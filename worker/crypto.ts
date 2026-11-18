// AES-GCM encryption at rest, key derived (HKDF-SHA256) from SESSION_SECRET.
const enc = new TextEncoder();
const dec = new TextDecoder();
const PREFIX = 'enc:v1:';
const keyCache = new Map<string, Promise<CryptoKey>>();

function b64(buf: Uint8Array): string {
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function deriveKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle
      .importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey'])
      .then((base) =>
        crypto.subtle.deriveKey(
          { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('meetflow-token-salt-v1'), info: enc.encode('google-tokens') },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      );
    keyCache.set(secret, k);
  }
  return k;
}

export function isEncrypted(s: string): boolean {
  return s.startsWith(PREFIX);
}

export async function encryptString(secret: string, plain: string): Promise<string> {
  if (!plain) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(secret), enc.encode(plain)));
  return `${PREFIX}${b64(iv)}.${b64(ct)}`;
}

/** Decrypts values produced by encryptString; legacy plaintext values are returned unchanged. */
export async function decryptString(secret: string, stored: string): Promise<string> {
  if (!stored || !isEncrypted(stored)) return stored;
  const [iv, ct] = stored.slice(PREFIX.length).split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await deriveKey(secret), unb64(ct));
  return dec.decode(pt);
}
