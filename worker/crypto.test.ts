import { describe, expect, it } from 'vitest';
import { decryptString, encryptString, isEncrypted } from './crypto.js';
import { parseCookies } from './auth.js';

describe('token encryption', () => {
  it('round-trips and is non-deterministic', async () => {
    const a = await encryptString('secret', 'refresh-token');
    const b = await encryptString('secret', 'refresh-token');
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toContain('refresh-token');
    expect(await decryptString('secret', a)).toBe('refresh-token');
  });
  it('passes legacy plaintext through and rejects a wrong key', async () => {
    expect(await decryptString('secret', 'plain-old')).toBe('plain-old');
    const a = await encryptString('secret', 'x');
    await expect(decryptString('other', a)).rejects.toThrow();
  });
});

describe('parseCookies robustness', () => {
  it('does not throw on malformed percent-encoding', () => {
    expect(parseCookies('a=%E0%A4%A; b=ok')).toEqual({ a: '%E0%A4%A', b: 'ok' });
  });
});
