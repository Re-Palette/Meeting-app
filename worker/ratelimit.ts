import type { Env } from './env';
import { HttpError } from './env';

export function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') ?? 'local';
}

function windowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

async function prune(env: Env, now: number): Promise<void> {
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 2 * 3600_000).run();
  }
}

/** Fixed-window counter: increments and throws 429 when the limit is exceeded. */
export async function rateHit(env: Env, key: string, limit: number, windowMs: number, message: string, now = Date.now()): Promise<void> {
  const ws = windowStart(now, windowMs);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1 RETURNING count`,
  )
    .bind(key, ws)
    .first<{ count: number }>();
  await prune(env, now);
  if ((row?.count ?? 0) > limit) throw new HttpError(429, message);
}

/** Throws 429 when the window already holds >= limit hits (does not count). */
export async function rateCheck(env: Env, key: string, limit: number, windowMs: number, message: string, now = Date.now()): Promise<void> {
  const row = await env.DB.prepare('SELECT count FROM rate_limits WHERE key = ? AND window_start = ?')
    .bind(key, windowStart(now, windowMs))
    .first<{ count: number }>();
  if ((row?.count ?? 0) >= limit) throw new HttpError(429, message);
}

export async function rateClear(env: Env, key: string): Promise<void> {
  await env.DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();
}
