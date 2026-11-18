const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await hmacKey(secret);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** Constant-time comparison of two strings (compared via equal-length digests, so length does not leak). */
export async function safeEqual(a: string, b: string, secret = 'meetflow-compare'): Promise<boolean> {
  const [ha, hb] = await Promise.all([hmacHex(secret, a), hmacHex(secret, b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0 && ha.length === hb.length;
}

export const COOKIE_NAME = 'mf_session';
export const SESSION_TTL_SEC = 30 * 24 * 3600;

export async function signToken(secret: string, purpose: string, ttlSec: number, now = Date.now()): Promise<string> {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const exp = now + ttlSec * 1000;
  const payload = `${exp}.${nonce}`;
  const sig = await hmacHex(secret, `${purpose}.${payload}`);
  return `${payload}.${sig}`;
}

export async function verifyToken(
  secret: string,
  purpose: string,
  token: string | undefined | null,
  now = Date.now(),
): Promise<boolean> {
  if (!secret || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts;
  const expected = await hmacHex(secret, `${purpose}.${exp}.${nonce}`);
  if (!(await safeEqual(sig, expected))) return false;
  const expMs = Number(exp);
  return Number.isFinite(expMs) && expMs > now;
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const raw = part.slice(i + 1).trim();
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(raw);
    } catch {
      out[part.slice(0, i).trim()] = raw;
    }
  }
  return out;
}
