import { signToken, verifyToken } from './auth.js';
import { ensureSettings } from './data.js';
import type { Env } from './env.js';
import * as google from './google.js';
import { getUserByEmail, getUserById } from './users.js';

export const LOGIN_STATE = 'login';
const connectPurpose = (uid: string) => `connect:${uid}`;

export async function loginState(env: Env): Promise<string> {
  return signToken(env.SESSION_SECRET, LOGIN_STATE, 600);
}

/** Connect state is bound to the signed-in user id: `<uid>!<signed>`. */
export async function connectState(env: Env, userId: string): Promise<string> {
  return `${userId}!${await signToken(env.SESSION_SECRET, connectPurpose(userId), 600)}`;
}

/**
 * Stores the Google profile (picture, name). ownerName follows the Google name only while it is empty or still
 * equals the last name we synced, so a hand-typed name is never overwritten but a Google rename propagates.
 */
export async function syncGoogleProfile(env: Env, userId: string, x: { name: string; picture: string }): Promise<void> {
  await ensureSettings({ ...env, userId });
  if (x.name) {
    await env.DB.prepare(
      "UPDATE settings SET owner_name = ?1 WHERE user_id = ?2 AND (owner_name = '' OR owner_name = (SELECT google_name FROM users WHERE id = ?2))",
    )
      .bind(x.name, userId)
      .run();
    await env.DB.prepare('UPDATE users SET google_name = ? WHERE id = ?').bind(x.name, userId).run();
  }
  if (x.picture) await env.DB.prepare('UPDATE users SET picture = ? WHERE id = ?').bind(x.picture, userId).run();
}

export interface CallbackResult {
  location: string; // path (relative to APP_URL) to redirect to
  sessionUserId?: string; // set => issue a session for this user
}

/**
 * Decides what the shared /api/google/callback does.
 * - login state: only invited users / the owner (matched by lowercased email) may sign in.
 * - connect state: stores tokens for the signed-in user, refusing a Google account that belongs to someone else.
 */
export async function handleGoogleCallback(
  env: Env,
  q: { code?: string; state?: string; error?: string },
): Promise<CallbackResult> {
  const state = q.state ?? '';
  const bang = state.indexOf('!');
  const isConnect = bang > 0;
  const failTo = isConnect ? '/settings?google=error' : '/login?error=google';
  if (q.error || !q.code) return { location: failTo };

  if (isConnect) {
    const uid = state.slice(0, bang);
    if (!(await verifyToken(env.SESSION_SECRET, connectPurpose(uid), state.slice(bang + 1)))) return { location: failTo };
    const user = await getUserById(env, uid);
    if (!user) return { location: failTo };
    try {
      const x = await google.exchangeCode(env, q.code);
      if (!x.email || !x.emailVerified) return { location: failTo };
      if (user.email && user.email !== x.email) return { location: failTo };
      const other = await getUserByEmail(env, x.email);
      if (other && other.id !== user.id) return { location: failTo };
      await google.storeTokens(env, user.id, x);
      if (!user.email) await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(x.email, user.id).run();
      await syncGoogleProfile(env, user.id, x);
      return { location: '/settings?google=connected' };
    } catch (e) {
      console.error(e);
      return { location: failTo };
    }
  }

  if (!(await verifyToken(env.SESSION_SECRET, LOGIN_STATE, state))) return { location: failTo };
  try {
    const x = await google.exchangeCode(env, q.code);
    if (!x.email || !x.emailVerified) return { location: failTo };
    const user = await getUserByEmail(env, x.email);
    if (!user) return { location: '/login?error=not_invited' };
    await google.storeTokens(env, user.id, x);
    await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(new Date().toISOString(), user.id).run();
    await syncGoogleProfile(env, user.id, x);
    return { location: '/', sessionUserId: user.id };
  } catch (e) {
    console.error(e);
    return { location: failTo };
  }
}
