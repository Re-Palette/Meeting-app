import type { AuthMe, CurrentUser, Member } from '../shared/types.js';
import { COOKIE_NAME, SESSION_TTL_SEC, parseCookies, signToken, verifyToken } from './auth.js';
import { ensureSettings } from './data.js';
import { type Env, HttpError } from './env.js';
import * as google from './google.js';

export interface UserRow {
  id: string;
  email: string | null;
  role: 'owner' | 'member';
  session_version: number;
  invited_at: string;
  last_login_at: string;
  created_at: string;
  picture: string;
  google_name: string;
}

export const OWNER_ID = 'owner';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function getUserById(env: Env, id: string): Promise<UserRow | null> {
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export async function getUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  return env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.trim().toLowerCase()).first<UserRow>();
}

async function nameOf(env: Env, userId: string): Promise<string> {
  const r = await env.DB.prepare('SELECT owner_name FROM settings WHERE user_id = ?').bind(userId).first<{ owner_name: string }>();
  return r?.owner_name ?? '';
}

export async function toCurrentUser(env: Env, u: UserRow): Promise<CurrentUser> {
  return { id: u.id, email: u.email ?? '', name: await nameOf(env, u.id), picture: u.picture ?? '', role: u.role };
}

// ---- sessions: cookie = `<userId>!<signed token>`; HMAC purpose binds user id and that user's session_version ----

export async function issueSession(env: Env, u: UserRow): Promise<string> {
  const token = await signToken(env.SESSION_SECRET, `session:${u.id}:${u.session_version}`, SESSION_TTL_SEC);
  return `${u.id}!${token}`;
}

export async function userFromCookie(env: Env, cookieHeader: string | null | undefined): Promise<UserRow | null> {
  const raw = parseCookies(cookieHeader)[COOKIE_NAME];
  const bang = raw?.indexOf('!') ?? -1;
  if (!raw || bang <= 0) return null;
  const uid = raw.slice(0, bang);
  const u = await getUserById(env, uid);
  if (!u) return null;
  return (await verifyToken(env.SESSION_SECRET, `session:${u.id}:${u.session_version}`, raw.slice(bang + 1))) ? u : null;
}

export async function bumpSession(env: Env, userId: string): Promise<void> {
  await env.DB.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?').bind(userId).run();
}

export async function authMe(env: Env, u: UserRow | null): Promise<AuthMe> {
  return u ? { authenticated: true, user: await toCurrentUser(env, u) } : { authenticated: false, user: null };
}

// ---- members (owner only) ----

async function toMember(env: Env, u: UserRow): Promise<Member> {
  return {
    email: u.email ?? '',
    name: await nameOf(env, u.id),
    picture: u.picture ?? '',
    role: u.role,
    status: u.role === 'owner' || u.last_login_at ? 'active' : 'invited',
    invitedAt: u.invited_at || u.created_at,
    lastLoginAt: u.last_login_at,
  };
}

export async function listMembers(env: Env): Promise<Member[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM users ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, created_at",
  ).all<UserRow>();
  return Promise.all(results.map((u) => toMember(env, u)));
}

export async function inviteMember(env: Env, rawEmail: unknown): Promise<Member> {
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'メールアドレスの形式が正しくありません');
  if (await getUserByEmail(env, email)) throw new HttpError(409, 'このメールアドレスは既に登録されています');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare("INSERT INTO users (id, email, role, invited_at, created_at) VALUES (?, ?, 'member', ?, ?)").bind(id, email, now, now).run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'このメールアドレスは既に登録されています');
    throw e;
  }
  await ensureSettings({ ...env, userId: id });
  return toMember(env, (await getUserById(env, id))!);
}

export async function removeMember(env: Env, rawEmail: string): Promise<void> {
  const u = await getUserByEmail(env, rawEmail);
  if (!u) throw new HttpError(404, 'メンバーが見つかりません');
  if (u.role === 'owner') throw new HttpError(400, 'オーナーは削除できません');
  // Best effort: revoke Google access before deleting the stored tokens.
  try {
    await google.disconnect({ ...env, userId: u.id });
  } catch {
    /* ignore */
  }
  for (const t of ['bookings', 'event_types', 'settings', 'google_tokens']) {
    await env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(u.id).run();
  }
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id).run();
}
