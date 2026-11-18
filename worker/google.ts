import type { LocationType } from '../shared/types';
import type { Env } from './env';
import { HttpError } from './env';
import { type Interval, zonedToUtc } from './tz';

export const GOOGLE_SCOPES =
  'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly openid email';

const API = 'https://www.googleapis.com/calendar/v3';

interface TokenRow {
  email: string;
  refresh_token: string;
  access_token: string;
  expires_at: number;
}

export async function getTokens(env: Env): Promise<TokenRow | null> {
  return env.DB.prepare('SELECT email, refresh_token, access_token, expires_at FROM google_tokens WHERE id = 1').first<TokenRow>();
}

export function googleConfigured(env: Env): boolean {
  return !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
}

export function redirectUri(env: Env): string {
  return `${env.APP_URL.replace(/\/$/, '')}/api/google/callback`;
}

export function buildAuthUrl(env: Env, state: string): string {
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(env),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

function emailFromIdToken(idToken: string | undefined): string {
  if (!idToken) return '';
  try {
    const payload = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))));
    return typeof json.email === 'string' ? json.email : '';
  } catch {
    return '';
  }
}

export async function exchangeCode(env: Env, code: string): Promise<void> {
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
  const existing = await getTokens(env);
  const refresh = j.refresh_token ?? existing?.refresh_token;
  if (!refresh) throw new Error('no refresh token');
  await env.DB.prepare(
    `INSERT INTO google_tokens (id, email, refresh_token, access_token, expires_at, updated_at)
     VALUES (1, ?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(id) DO UPDATE SET email = ?1, refresh_token = ?2, access_token = ?3, expires_at = ?4, updated_at = ?5`,
  )
    .bind(emailFromIdToken(j.id_token) || existing?.email || '', refresh, j.access_token, Date.now() + j.expires_in * 1000, new Date().toISOString())
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
  await env.DB.prepare('DELETE FROM google_tokens WHERE id = 1').run();
}

/** Returns a valid access token (refreshing when needed) or null when not connected / refresh fails. */
export async function getAccessToken(env: Env): Promise<string | null> {
  if (!googleConfigured(env)) return null;
  const t = await getTokens(env);
  if (!t) return null;
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
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token: string; expires_in: number };
  await env.DB.prepare('UPDATE google_tokens SET access_token = ?1, expires_at = ?2, updated_at = ?3 WHERE id = 1')
    .bind(j.access_token, Date.now() + j.expires_in * 1000, new Date().toISOString())
    .run();
  return j.access_token;
}

async function gfetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken(env);
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
