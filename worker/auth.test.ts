import { describe, expect, it } from 'vitest';
import { parseCookies, safeEqual, signToken, verifyToken } from './auth.js';

describe('auth', () => {
  it('safeEqual', async () => {
    expect(await safeEqual('abc', 'abc')).toBe(true);
    expect(await safeEqual('abc', 'abd')).toBe(false);
    expect(await safeEqual('abc', 'abcd')).toBe(false);
  });
  it('signs and verifies tokens, rejects tampering, expiry, wrong purpose', async () => {
    const t = await signToken('secret', 'session', 60, 1000);
    expect(await verifyToken('secret', 'session', t, 2000)).toBe(true);
    expect(await verifyToken('other', 'session', t, 2000)).toBe(false);
    expect(await verifyToken('secret', 'google-state', t, 2000)).toBe(false);
    expect(await verifyToken('secret', 'session', t, 1000 + 61_000)).toBe(false);
    expect(await verifyToken('secret', 'session', t.replace(/^\d+/, '99999999999999'), 2000)).toBe(false);
    expect(await verifyToken('secret', 'session', undefined)).toBe(false);
  });
  it('parseCookies', () => {
    expect(parseCookies('a=1; mf_session=x.y.z')).toEqual({ a: '1', mf_session: 'x.y.z' });
  });
});
