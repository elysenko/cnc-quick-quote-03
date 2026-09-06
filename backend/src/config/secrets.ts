import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc.v1:';

/**
 * AES-256-GCM at-rest encryption for secret `SystemSetting` values, keyed from
 * APP_SECRET (falling back to JWT_SECRET so a single-secret deployment still works).
 *
 * Rotation caveat: changing APP_SECRET makes previously stored ciphertexts
 * undecryptable. `decryptSecret` returns null in that case rather than throwing, and
 * every caller falls back to the env-provided value — see resolveConfig().
 */
function key(): Buffer {
  const material = process.env.APP_SECRET ?? process.env.JWT_SECRET ?? 'colossus-development-secret';
  return createHash('sha256').update(material).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Returns null when the value cannot be decrypted (e.g. APP_SECRET was rotated). */
export function decryptSecret(stored: string): string | null {
  if (!isEncrypted(stored)) return stored;
  try {
    const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split('.');
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/** `sk_live_abcd…wxyz` → `sk_live_••••wxyz`. Never returns the full value. */
export function maskSecret(plaintext: string | null): string | null {
  if (!plaintext) return null;
  if (plaintext.length <= 8) return '••••';
  const head = plaintext.slice(0, Math.min(8, plaintext.length - 4));
  return `${head}••••${plaintext.slice(-4)}`;
}
