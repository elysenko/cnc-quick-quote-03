/**
 * Namespaced browser storage.
 *
 * Mockups are served many-per-origin at `/<mockup_id>/` and browser storage is
 * origin-scoped (not path-scoped), so an unprefixed key collides with every other
 * mockup the reviewer has opened. Every read/write in the app goes through here.
 */
const NS =
  (typeof location !== 'undefined' ? location.pathname.split('/')[1] : '') ||
  'app';

/** e.g. `49c3b66f-…-a4:user` — the colon separator is load-bearing. */
export const nsKey = (key: string): string => `${NS}:${key}`;

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(nsKey(key));
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(nsKey(key), value);
  } catch {
    /* private mode / quota — preview keeps working without persistence */
  }
}

export function removeKeys(...keys: string[]): void {
  try {
    for (const key of keys) localStorage.removeItem(nsKey(key));
  } catch {
    /* ignore */
  }
}

/**
 * Reads JSON and validates its shape. Anything unrecognized is cleared and null
 * is returned, so a stale or hand-edited value can never blank the page.
 */
export function readValidated<T>(
  key: string,
  isValid: (value: unknown) => value is T,
): T | null {
  const raw = readRaw(key);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isValid(parsed)) return parsed;
  } catch {
    /* fall through to clear */
  }
  removeKeys(key);
  return null;
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
