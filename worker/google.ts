import type { LocationType } from '../shared/types.js';
import { decryptString, encryptString } from './crypto.js';
import type { Env } from './env.js';
import { HttpError, uidOf } from './env.js';
import { type Interval, zonedToUtc } from './tz.js';

export const GOOGLE_SCOPES =
  'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly openid email profile';

const API = 'https://www.googleapis.com/calendar/v3';

export interface TokenRow {
  email: string;
  refresh_token: string;
  access_token: string;
  expires_at: number;
  broken: boolean; // refresh token rejected (or undecryptable): reconnect required
}

export async function getTokens(env: Env, userId = uidOf(env)): Promise<TokenRow | null> {
  const r = await env.DB.prepare('SELECT email, refresh_token, access_token, expires_at, broken FROM google_tokens WHERE user_id = ?').bind(userId).first<{
    email: string;
    refresh_token: string;
    access_token: string;
    expires_at: number;
    broken: number;
  }>();
  if (!r) return null;
  try {
    return {
      email: r.email,
      refresh_token: await decryptString(env.SESSION_SECRET, r.refresh_token),
      access_token: await decryptString(env.SESSION_SECRET, r.access_token),
      expires_at: r.expires_at,
      broken: !!r.broken,
    };
  } catch {
    return { email: r.email, refresh_token: '', access_token: '', expires_at: 0, broken: true };
  }
}

async function markBroken(env: Env): Promise<void> {
  await env.DB.prepare('UPDATE google_tokens SET broken = 1, access_token = \'\', expires_at = 0 WHERE user_id = ?').bind(uidOf(env)).run();
}

export function googleConfigured(env: Env): boolean {
  return !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
}

export function redirectUri(env: Env): string {
  return `${env.APP_URL.replace(/\/$/, '')}/api/google/callback`;
}

export function buildAuthUrl(env: Env, state: string, prompt = 'consent'): string {
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(env),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt,
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

function decodeIdToken(idToken: string | undefined): { email?: string; email_verified?: boolean | string; name?: string; picture?: string } {
  if (!idToken) return {};
  try {
    const payload = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}

export interface GoogleExchange {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  email: string; // lowercased
  emailVerified: boolean;
  name: string;
  picture: string;
}

/** Exchanges an authorization code; identity comes from the ID token (received directly from Google), else userinfo. */
export async function exchangeCode(env: Env, code: string): Promise<GoogleExchange> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(env),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };
  let id = decodeIdToken(j.id_token);
  if (!id.email) {
    const u = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${j.access_token}` } });
    if (u.ok) id = (await u.json()) as typeof id;
  }
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_in: j.expires_in,
    email: (id.email ?? '').trim().toLowerCase(),
    emailVerified: id.email_verified === true || id.email_verified === 'true',
    name: id.name ?? '',
    picture: id.picture ?? '',
  };
}

/** Stores (encrypted) tokens for a user. Keeps the existing refresh token when Google does not send a new one. */
export async function storeTokens(env: Env, userId: string, x: GoogleExchange): Promise<void> {
  const existing = await getTokens(env, userId);
  const refresh = x.refresh_token ?? (existing && !existing.broken ? existing.refresh_token : '');
  if (!refresh) throw new Error('no refresh token');
  await env.DB.prepare(
    `INSERT INTO google_tokens (user_id, email, refresh_token, access_token, expires_at, updated_at)
     VALUES (?6, ?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(user_id) DO UPDATE SET email = ?1, refresh_token = ?2, access_token = ?3, expires_at = ?4, updated_at = ?5, broken = 0`,
  )
    .bind(
      x.email || existing?.email || '',
      await encryptString(env.SESSION_SECRET, refresh),
      await encryptString(env.SESSION_SECRET, x.access_token),
      Date.now() + x.expires_in * 1000,
      new Date().toISOString(),
      userId,
    )
    .run();
}

export async function disconnect(env: Env): Promise<void> {
  const t = await getTokens(env);
  if (t?.refresh_token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refresh_token)}`, { method: 'POST' });
    } catch {
      /* best effort */
    }
  }
  await env.DB.prepare('DELETE FROM google_tokens WHERE user_id = ?').bind(uidOf(env)).run();
}

/**
 * Returns a valid access token (refreshing when needed), or null when Google is not configured / not connected.
 * Throws when a connection exists but cannot be used (refresh failed, revoked token).
 */
export async function getAccessToken(env: Env): Promise<string | null> {
  if (!googleConfigured(env)) return null;
  const t = await getTokens(env);
  if (!t) return null;
  if (t.broken) throw new Error('google connection broken');
  if (t.access_token && t.expires_at > Date.now() + 60_000) return t.access_token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: t.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 400 || res.status === 401) {
      if (body.includes('invalid_grant') || body.includes('invalid_client') || res.status === 401) await markBroken(env);
    }
    throw new Error(`google token refresh failed: ${res.status}`);
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  // Also upgrades legacy plaintext rows to encrypted storage.
  await env.DB.prepare('UPDATE google_tokens SET access_token = ?1, refresh_token = ?2, expires_at = ?3, updated_at = ?4 WHERE user_id = ?5')
    .bind(
      await encryptString(env.SESSION_SECRET, j.access_token),
      await encryptString(env.SESSION_SECRET, t.refresh_token),
      Date.now() + j.expires_in * 1000,
      new Date().toISOString(),
      uidOf(env),
    )
    .run();
  return j.access_token;
}

async function gfetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  let token: string | null;
  try {
    token = await getAccessToken(env);
  } catch {
    throw new HttpError(502, 'Googleとの接続が切れています。設定から再接続してください');
  }
  if (!token) throw new HttpError(400, 'Googleカレンダーが接続されていません');
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return res;
}

export async function listCalendars(env: Env): Promise<{ id: string; summary: string; primary: boolean }[]> {
  const res = await gfetch(env, '/users/me/calendarList?minAccessRole=reader&fields=items(id,summary,primary)');
  if (!res.ok) throw new HttpError(502, 'Googleカレンダー一覧の取得に失敗しました');
  const j = (await res.json()) as { items?: { id: string; summary?: string; primary?: boolean }[] };
  return (j.items ?? []).map((c) => ({ id: c.id, summary: c.summary ?? c.id, primary: !!c.primary }));
}

export async function freeBusy(env: Env, calendarIds: string[], from: number, to: number): Promise<Interval[]> {
  if (!calendarIds.length) return [];
  const res = await gfetch(env, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      items: calendarIds.map((id) => ({ id })),
    }),
  });
  if (!res.ok) throw new Error(`freebusy ${res.status}`);
  const j = (await res.json()) as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> };
  const out: Interval[] = [];
  for (const c of Object.values(j.calendars ?? {})) {
    for (const b of c.busy ?? []) out.push({ start: Date.parse(b.start), end: Date.parse(b.end) });
  }
  return out;
}

export interface GoogleListedEvent {
  id: string;
  calendarId: string;
  title: string;
  start: number;
  end: number;
}

/** events.list with real titles. Skips cancelled and transparent (free) events. */
export async function listEvents(env: Env, calendarId: string, from: number, to: number, tz: string): Promise<GoogleListedEvent[]> {
  const out: GoogleListedEvent[] = [];
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      fields: 'nextPageToken,items(id,summary,status,transparency,start,end)',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const res = await gfetch(env, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    if (!res.ok) throw new Error(`events.list ${res.status}`);
    const j = (await res.json()) as {
      nextPageToken?: string;
      items?: {
        id: string;
        summary?: string;
        status?: string;
        transparency?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }[];
    };
    for (const e of j.items ?? []) {
      if (e.status === 'cancelled' || e.transparency === 'transparent' || !e.start || !e.end) continue;
      const toMs = (x: { dateTime?: string; date?: string }): number => {
        if (x.dateTime) return Date.parse(x.dateTime);
        const [y, m, d] = (x.date ?? '').split('-').map(Number);
        return zonedToUtc(y, m, d, 0, 0, tz);
      };
      out.push({ id: e.id, calendarId, title: e.summary || '予定あり', start: toMs(e.start), end: toMs(e.end) });
    }
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return out;
}

export interface CreateEventInput {
  calendarId: string;
  title: string;
  description: string;
  start: string;
  end: string;
  location: LocationType;
  locationDetail: string;
  guestEmail: string;
  guestName: string;
}

export async function createEvent(env: Env, input: CreateEventInput): Promise<{ id: string; meetUrl: string }> {
  const body: Record<string, unknown> = {
    summary: input.title,
    description: input.description,
    start: { dateTime: input.start },
    end: { dateTime: input.end },
    attendees: [{ email: input.guestEmail, displayName: input.guestName }],
  };
  const meet = input.location === 'google_meet';
  if (meet) {
    body.conferenceData = {
      createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
    };
  } else if (input.locationDetail) {
    body.location = input.locationDetail;
  }
  const res = await gfetch(
    env,
    `/calendars/${encodeURIComponent(input.calendarId)}/events?sendUpdates=all${meet ? '&conferenceDataVersion=1' : ''}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(`events.insert ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { id: string; hangoutLink?: string };
  return { id: j.id, meetUrl: j.hangoutLink ?? '' };
}

export async function deleteEvent(env: Env, calendarId: string, eventId: string): Promise<void> {
  const res = await gfetch(env, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`events.delete ${res.status}`);
}
