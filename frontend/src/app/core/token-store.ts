import { readRaw, removeKeys, writeRaw } from './storage';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

/**
 * Session tokens.
 *
 * Kept in namespaced browser storage rather than memory-only so a full page reload —
 * which every deep link is — does not sign the customer out mid-checkout.
 */
export const tokenStore = {
  access: (): string | null => readRaw(ACCESS_KEY),
  refresh: (): string | null => readRaw(REFRESH_KEY),
  set(accessToken: string, refreshToken: string): void {
    writeRaw(ACCESS_KEY, accessToken);
    writeRaw(REFRESH_KEY, refreshToken);
  },
  clear(): void {
    removeKeys(ACCESS_KEY, REFRESH_KEY);
  },
};
