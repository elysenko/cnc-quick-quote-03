/**
 * ASCII DXF group-code tokenizer + entity extraction.
 *
 * A DXF file is a flat stream of alternating lines:
 *   <integer group code>
 *   <value>
 * Sections are delimited by `0/SECTION`, `2/<NAME>` ... `0/ENDSEC`.
 */
import {
  ArcEntity,
  CircleEntity,
  DxfEntity,
  DxfParseError,
  DxfToken,
  LineEntity,
  PolyVertex,
  PolylineEntity,
  RawEntity,
} from './dxf-types';

const BINARY_SENTINEL = 'AutoCAD Binary DXF';

const NOT_A_DXF =
  'We could not read this file as a DXF drawing. Please export a plain-text ' +
  '(ASCII) DXF from your CAD program and upload it again.';

/**
 * Turn the uploaded buffer into text, rejecting empty and binary payloads.
 */
export function decodeDxf(data: Buffer | null | undefined): string {
  if (!data || data.length === 0) {
    throw new DxfParseError(
      'The uploaded drawing file is empty. Please re-export the part from ' +
        'your CAD program and upload it again.',
    );
  }

  const head = data.subarray(0, 64).toString('latin1');
  if (head.includes(BINARY_SENTINEL)) {
    throw new DxfParseError(
      'This is a binary DXF, which we cannot read. Please re-save it as an ' +
        'ASCII (plain text) DXF and upload it again.',
    );
  }

  // Real ASCII DXF files never contain NUL bytes.
  const probe = data.subarray(0, Math.min(data.length, 8192));
  for (let i = 0; i < probe.length; i += 1) {
    if (probe[i] === 0) {
      throw new DxfParseError(NOT_A_DXF);
    }
  }

  let text = data.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  if (text.includes('\uFFFD')) {
    throw new DxfParseError(NOT_A_DXF);
  }
  return text;
}

/**
 * Split the text into group-code / value tokens. Tolerates CRLF, lone CR and
 * leading/trailing whitespace on every line.
 */
export function tokenize(text: string): DxfToken[] {
  const lines = text.split(/\r\n|\r|\n/);
  const tokens: DxfToken[] = [];

  let i = 0;
  // Skip any blank preamble lines.
  while (i < lines.length && lines[i].trim() === '') {
    i += 1;
  }

  for (; i + 1 < lines.length; i += 2) {
    const rawCode = lines[i].trim();
    if (rawCode === '') {
      // A stray blank line: resync by consuming one line only.
      i -= 1;
      continue;
    }
    if (!/^[-+]?\d{1,4}$/.test(rawCode)) {
      throw new DxfParseError(NOT_A_DXF);
    }
    tokens.push({ code: parseInt(rawCode, 10), value: lines[i + 1].trim() });
  }

  const hasSection = tokens.some(
    (t) => t.code === 0 && t.value.toUpperCase() === 'SECTION',
  );
  if (tokens.length === 0 || !hasSection) {
    throw new DxfParseError(NOT_A_DXF);
  }
  return tokens;
}

/**
 * Read `$INSUNITS` from the HEADER section. Returns null when absent.
 */
export function readInsUnits(tokens: DxfToken[]): number | null {
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.code !== 9 || t.value.toUpperCase() !== '$INSUNITS') {
      continue;
    }
    for (let j = i + 1; j < tokens.length && j <= i + 8; j += 1) {
      if (tokens[j].code === 70) {
        const n = parseInt(tokens[j].value, 10);
        return Number.isFinite(n) ? n : null;
      }
      if (tokens[j].code === 9 || tokens[j].code === 0) {
        break;
      }
    }
  }
  return null;
}

/** Index ranges [start, end) of every ENTITIES section body. */
function entitySectionRanges(tokens: DxfToken[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const t = tokens[i];
    if (t.code !== 0 || t.value.toUpperCase() !== 'SECTION') {
      continue;
    }
    const nameTok = tokens[i + 1];
    if (nameTok.code !== 2 || nameTok.value.toUpperCase() !== 'ENTITIES') {
      continue;
    }
    let end = i + 2;
    while (
      end < tokens.length &&
      !(tokens[end].code === 0 && tokens[end].value.toUpperCase() === 'ENDSEC')
    ) {
      end += 1;
    }
    ranges.push([i + 2, end]);
    i = end;
  }
  return ranges;
}

/** Split a token range into raw entity records at each 0-code. */
function splitRecords(
  tokens: DxfToken[],
  start: number,
  end: number,
): RawEntity[] {
  const records: RawEntity[] = [];
  let current: RawEntity | null = null;
  for (let i = start; i < end; i += 1) {
    const t = tokens[i];
    if (t.code === 0) {
      current = { type: t.value.toUpperCase(), pairs: [] };
      records.push(current);
    } else if (current) {
      current.pairs.push(t);
    }
  }
  return records;
}

/** Group old-style POLYLINE records with their trailing VERTEX records. */
function groupPolylines(records: RawEntity[]): RawEntity[] {
  const grouped: RawEntity[] = [];
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i];
    if (rec.type !== 'POLYLINE') {
      grouped.push(rec);
      continue;
    }
    const children: RawEntity[] = [];
    let j = i + 1;
    for (; j < records.length; j += 1) {
      const next = records[j];
      if (next.type === 'VERTEX') {
        children.push(next);
        continue;
      }
      break;
    }
    // Consume a trailing SEQEND if present.
    if (j < records.length && records[j].type === 'SEQEND') {
      j += 1;
    }
    grouped.push({ ...rec, children });
    i = j - 1;
  }
  return grouped;
}

function num(pairs: DxfToken[], code: number, fallback: number): number {
  for (const p of pairs) {
    if (p.code === code) {
      const v = parseFloat(p.value);
      return Number.isFinite(v) ? v : fallback;
    }
  }
  return fallback;
}

function flags(pairs: DxfToken[]): number {
  const v = num(pairs, 70, 0);
  return Number.isFinite(v) ? Math.trunc(v) : 0;
}

function toLine(rec: RawEntity): LineEntity {
  return {
    type: 'LINE',
    x1: num(rec.pairs, 10, 0),
    y1: num(rec.pairs, 20, 0),
    x2: num(rec.pairs, 11, 0),
    y2: num(rec.pairs, 21, 0),
  };
}

function toCircle(rec: RawEntity): CircleEntity | null {
  const r = num(rec.pairs, 40, 0);
  if (!(r > 0)) {
    return null;
  }
  return {
    type: 'CIRCLE',
    cx: num(rec.pairs, 10, 0),
    cy: num(rec.pairs, 20, 0),
    r,
  };
}

function toArc(rec: RawEntity): ArcEntity | null {
  const r = num(rec.pairs, 40, 0);
  if (!(r > 0)) {
    return null;
  }
  return {
    type: 'ARC',
    cx: num(rec.pairs, 10, 0),
    cy: num(rec.pairs, 20, 0),
    r,
    startDeg: num(rec.pairs, 50, 0),
    endDeg: num(rec.pairs, 51, 0),
  };
}

/**
 * LWPOLYLINE stores its vertices as a repeating 10/20 run; a 42 bulge belongs
 * to the vertex it follows.
 */
function toLwPolyline(rec: RawEntity): PolylineEntity | null {
  const vertices: PolyVertex[] = [];
  let closed = false;
  let current: PolyVertex | null = null;
  for (const p of rec.pairs) {
    switch (p.code) {
      case 10:
        current = { x: parseFloat(p.value) || 0, y: 0, bulge: 0 };
        vertices.push(current);
        break;
      case 20:
        if (current) {
          current.y = parseFloat(p.value) || 0;
        }
        break;
      case 42:
        if (current) {
          const b = parseFloat(p.value);
          current.bulge = Number.isFinite(b) ? b : 0;
        }
        break;
      case 70:
        closed = (Math.trunc(parseFloat(p.value) || 0) & 1) === 1;
        break;
      default:
        break;
    }
  }
  if (vertices.length < 2) {
    return null;
  }
  return { type: 'POLYLINE', vertices, closed };
}

function toOldPolyline(rec: RawEntity): PolylineEntity | null {
  const vertices: PolyVertex[] = [];
  for (const child of rec.children ?? []) {
    vertices.push({
      x: num(child.pairs, 10, 0),
      y: num(child.pairs, 20, 0),
      bulge: num(child.pairs, 42, 0),
    });
  }
  if (vertices.length < 2) {
    return null;
  }
  return {
    type: 'POLYLINE',
    vertices,
    closed: (flags(rec.pairs) & 1) === 1,
  };
}

/**
 * Extract every supported entity from the ENTITIES section(s). Unsupported
 * entity types (TEXT, DIMENSION, ...) are silently ignored.
 */
export function extractEntities(tokens: DxfToken[]): DxfEntity[] {
  let ranges = entitySectionRanges(tokens);
  if (ranges.length === 0) {
    // Tolerate files without a proper ENTITIES section by scanning the whole
    // stream; header variables never use 0-codes so this is safe.
    ranges = [[0, tokens.length]];
  }

  const entities: DxfEntity[] = [];
  for (const [start, end] of ranges) {
    const records = groupPolylines(splitRecords(tokens, start, end));
    for (const rec of records) {
      let entity: DxfEntity | null = null;
      switch (rec.type) {
        case 'LINE':
          entity = toLine(rec);
          break;
        case 'CIRCLE':
          entity = toCircle(rec);
          break;
        case 'ARC':
          entity = toArc(rec);
          break;
        case 'LWPOLYLINE':
          entity = toLwPolyline(rec);
          break;
        case 'POLYLINE':
          entity = toOldPolyline(rec);
          break;
        default:
          entity = null;
      }
      if (entity) {
        entities.push(entity);
      }
    }
  }
  return entities;
}
