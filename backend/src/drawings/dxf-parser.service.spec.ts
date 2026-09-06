import { readFileSync } from 'fs';
import { join } from 'path';
import { DxfParserService } from './dxf-parser.service';
import { DxfParseError, ParsedGeometry } from './dxf-types';

const FIXTURES = join(__dirname, '__fixtures__');

function load(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

/** Relative error helper for the "within 0.5%" assertions. */
function relError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

/** Build a tiny in-memory DXF from a flat list of group code / value strings. */
function dxf(entityLines: string[], crlf = false): Buffer {
  const lines = [
    '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    ...entityLines,
    '0', 'ENDSEC', '0', 'EOF',
  ];
  return Buffer.from(lines.join(crlf ? '\r\n' : '\n'), 'utf8');
}

describe('DxfParserService', () => {
  let service: DxfParserService;

  beforeEach(() => {
    service = new DxfParserService();
    // Keep the Nest logger quiet during the suite.
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  describe('units', () => {
    it('parses a 4in x 2in rectangle of 4 LINEs with $INSUNITS = 1', () => {
      const geo = service.parse(load('rect-4x2-inch.dxf'));

      expect(geo.detectedUnits).toBe('in ($INSUNITS = 1)');
      expect(geo.entityCount).toBe(4);
      expect(geo.polylines).toHaveLength(4);
      expect(geo.bboxWIn).toBeCloseTo(4);
      expect(geo.bboxHIn).toBeCloseTo(2);
      expect(geo.cutLengthIn).toBeCloseTo(12);
    });

    it('gives the same inch results for the millimetre version ($INSUNITS = 4)', () => {
      const geo = service.parse(load('rect-4x2-mm.dxf'));

      expect(geo.detectedUnits).toBe('mm ($INSUNITS = 4)');
      expect(geo.bboxWIn).toBeCloseTo(4);
      expect(geo.bboxHIn).toBeCloseTo(2);
      expect(geo.cutLengthIn).toBeCloseTo(12);
    });

    it('assumes millimetres when $INSUNITS is absent', () => {
      const geo = service.parse(load('rect-4x2-no-insunits.dxf'));

      expect(geo.detectedUnits).toContain('mm');
      expect(geo.detectedUnits).toContain('default');
      expect(geo.detectedUnits).toContain('absent');
      expect(geo.bboxWIn).toBeCloseTo(4);
      expect(geo.bboxHIn).toBeCloseTo(2);
      expect(geo.cutLengthIn).toBeCloseTo(12);
    });

    it('tolerates CRLF line endings and padded group codes', () => {
      const geo = service.parse(load('rect-4x2-inch-crlf.dxf'));

      expect(geo.entityCount).toBe(4);
      expect(geo.cutLengthIn).toBeCloseTo(12);
    });

    it('logs the detected units on a successful parse', () => {
      const spy = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation(() => undefined);

      service.parse(load('rect-4x2-mm.dxf'));

      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toContain('mm ($INSUNITS = 4)');
    });
  });

  describe('curved geometry', () => {
    it('flattens a 1in radius CIRCLE to within 0.5% of its circumference', () => {
      const geo = service.parse(load('circle-r1-inch.dxf'));

      expect(geo.entityCount).toBe(1);
      expect(relError(geo.cutLengthIn, 2 * Math.PI)).toBeLessThan(0.005);
      expect(geo.bboxWIn).toBeCloseTo(2);
      expect(geo.bboxHIn).toBeCloseTo(2);
    });

    it('flattens a quarter ARC to within 0.5% of pi*r/2', () => {
      const geo = service.parse(load('arc-quarter-r2-inch.dxf'));
      const expected = (Math.PI * 2) / 2;

      expect(geo.entityCount).toBe(1);
      expect(relError(geo.cutLengthIn, expected)).toBeLessThan(0.005);
    });

    it('makes a bulged LWPOLYLINE longer than the same polyline with bulge 0', () => {
      const bulged = service.parse(load('lwpolyline-bulge.dxf'));
      const straight = service.parse(load('lwpolyline-straight.dxf'));

      expect(straight.cutLengthIn).toBeCloseTo(6);
      expect(bulged.cutLengthIn).toBeGreaterThan(straight.cutLengthIn);
      // bulge 0.5 over a 4in chord => r = 2.5, included angle = 4*atan(0.5)
      const arcLen = 2.5 * (4 * Math.atan(0.5));
      expect(relError(bulged.cutLengthIn, arcLen + 2)).toBeLessThan(0.005);
    });

    it('closes a closed LWPOLYLINE square (includes the closing segment)', () => {
      const geo = service.parse(load('lwpolyline-closed-square.dxf'));

      expect(geo.entityCount).toBe(1);
      expect(geo.cutLengthIn).toBeCloseTo(8);
      expect(geo.bboxWIn).toBeCloseTo(2);
      expect(geo.bboxHIn).toBeCloseTo(2);
      const pts = geo.polylines[0];
      expect(pts.slice(0, 2)).toEqual(pts.slice(-2));
    });

    it('supports old-style POLYLINE / VERTEX / SEQEND entities', () => {
      const geo = service.parse(load('polyline-vertex-square.dxf'));

      expect(geo.entityCount).toBe(1);
      expect(geo.cutLengthIn).toBeCloseTo(12);
      expect(geo.bboxWIn).toBeCloseTo(3);
      expect(geo.bboxHIn).toBeCloseTo(3);
    });
  });

  describe('part-local normalisation', () => {
    it('translates a rectangle drawn at (100,100) back to the origin', () => {
      const geo = service.parse(load('rect-offset-100.dxf'));

      expect(geo.bboxWIn).toBeCloseTo(4);
      expect(geo.bboxHIn).toBeCloseTo(2);
      expect(geo.cutLengthIn).toBeCloseTo(12);

      const all = geo.polylines.flat();
      for (const v of all) {
        expect(v).toBeGreaterThanOrEqual(-1e-9);
      }
      expect(Math.min(...all)).toBeCloseTo(0);
      expect(Math.max(...all)).toBeCloseTo(4);
    });

    it('never emits NaN or Infinity', () => {
      const files = [
        'rect-4x2-inch.dxf',
        'circle-r1-inch.dxf',
        'arc-quarter-r2-inch.dxf',
        'lwpolyline-bulge.dxf',
      ];
      for (const f of files) {
        const geo: ParsedGeometry = service.parse(load(f));
        expect(Number.isFinite(geo.bboxWIn)).toBe(true);
        expect(Number.isFinite(geo.bboxHIn)).toBe(true);
        expect(Number.isFinite(geo.cutLengthIn)).toBe(true);
        for (const v of geo.polylines.flat()) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    });

    it('handles a degenerate zero-length drawing without NaN', () => {
      const geo = service.parse(
        dxf(['0', 'LINE', '10', '1.0', '20', '1.0', '11', '1.0', '21', '1.0']),
      );

      expect(geo.bboxWIn).toBe(0);
      expect(geo.bboxHIn).toBe(0);
      expect(geo.cutLengthIn).toBe(0);
      expect(geo.polylines[0].every((v) => Number.isFinite(v))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('throws DxfParseError for an empty buffer', () => {
      expect(() => service.parse(Buffer.alloc(0))).toThrow(DxfParseError);
      expect(() => service.parse(Buffer.alloc(0))).toThrow(/empty/i);
    });

    it('throws DxfParseError for a garbage buffer', () => {
      const junk = Buffer.from(
        'This is not a DXF at all, just some notes about the job.\n',
        'utf8',
      );
      expect(() => service.parse(junk)).toThrow(DxfParseError);
    });

    it('throws DxfParseError for a binary DXF', () => {
      const bin = Buffer.from('AutoCAD Binary DXF\r\n ', 'latin1');
      expect(() => service.parse(bin)).toThrow(DxfParseError);
      expect(() => service.parse(bin)).toThrow(/binary/i);
    });

    it('throws DxfParseError when there are no supported entities', () => {
      expect(() => service.parse(load('text-only.dxf'))).toThrow(DxfParseError);
      expect(() => service.parse(load('text-only.dxf'))).toThrow(
        /no lines, arcs, circles or polylines we can cut/i,
      );
    });
  });

  describe('vertex budget', () => {
    it('caps the emitted vertex count at 20000', () => {
      const body: string[] = [];
      // 800 large, tightly stacked circles: at the derived tolerance a naive
      // flattening emits ~49k vertices, well past the cap.
      for (let i = 0; i < 800; i += 1) {
        body.push('0', 'CIRCLE', '10', '0', '20', '0', '40', '10');
      }
      const geo = service.parse(dxf(body, true));

      const vertices = geo.polylines.reduce((n, p) => n + p.length / 2, 0);
      expect(geo.entityCount).toBe(800);
      expect(vertices).toBeLessThanOrEqual(20000);
      expect(service['logger'].warn).toHaveBeenCalled();
    });
  });
});
