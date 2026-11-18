import type { Booking, CalendarEvent, EventType, Settings } from '../shared/types.js';
import type { Env } from './env.js';
import { HttpError } from './env.js';
import { getAccessToken, getTokens, freeBusy, listEvents } from './google.js';
import { type IcsEvent, parseIcs } from './ics.js';
import { type Interval } from './tz.js';

type Row = Record<string, unknown>;

export function parseJson<T>(s: unknown, fallback: T): T {
  try {
    return JSON.parse(String(s)) as T;
  } catch {
    return fallback;
  }
}

export function rowToEventType(r: Row): EventType {
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    description: r.description as string,
    durationMin: r.duration_min as number,
    location: r.location as EventType['location'],
    locationDetail: r.location_detail as string,
    color: r.color as EventType['color'],
    active: !!r.active,
    requireApproval: !!r.require_approval,
    bufferBeforeMin: r.buffer_before_min as number,
    bufferAfterMin: r.buffer_after_min as number,
    minNoticeHours: r.min_notice_hours as number,
    maxDaysAhead: r.max_days_ahead as number,
    slotIntervalMin: r.slot_interval_min as number,
    availability: parseJson(r.availability, {}),
    questions: parseJson(r.questions, []),
    createdAt: r.created_at as string,
  };
}

export function rowToBooking(r: Row): Booking {
  return {
    id: r.id as string,
    eventTypeId: r.event_type_id as string,
    eventTitle: r.event_title as string,
    durationMin: r.duration_min as number,
    location: r.location as Booking['location'],
    locationDetail: r.location_detail as string,
    start: r.start_at as string,
    end: r.end_at as string,
    guestName: r.guest_name as string,
    guestEmail: r.guest_email as string,
    guestCompany: r.guest_company as string,
    notes: r.notes as string,
    answers: parseJson(r.answers, {}),
    status: r.status as Booking['status'],
    meetUrl: r.meet_url as string,
    syncError: (r.sync_error as string) ?? '',
    googleEventId: r.google_event_id as string,
    createdAt: r.created_at as string,
  };
}

export async function loadSettings(env: Env): Promise<Settings> {
  const r = await env.DB.prepare('SELECT * FROM settings WHERE id = 1').first<Row>();
  const t = await getTokens(env);
  return {
    ownerName: (r?.owner_name as string) ?? '',
    timezone: (r?.timezone as string) ?? 'Asia/Tokyo',
    googleConnected: !!t && !t.broken, // a broken (revoked) connection shows as disconnected; email stays for context
    googleEmail: t?.email ?? '',
    googleCalendarIds: parseJson<string[]>(r?.google_calendar_ids, ['primary']),
    googleTargetCalendarId: (r?.google_target_calendar_id as string) ?? 'primary',
    icsUrls: parseJson<string[]>(r?.ics_urls, []),
  };
}

export const CAL_UNAVAILABLE = 'カレンダーを確認できませんでした。しばらくしてからお試しください';

// ---- ICS: raw text and parsed events cached per URL for ~5 minutes ----
interface IcsEntry {
  at: number;
  text: string;
  tz: string;
  from: number;
  to: number;
  events: IcsEvent[];
}
const icsCache = new Map<string, IcsEntry>();
const ICS_TTL = 5 * 60 * 1000;
const DAY_MS = 86400000;

/** Throws when the feed cannot be fetched. */
async function icsParsed(url: string, tz: string, from: number, to: number, now = Date.now()): Promise<IcsEvent[]> {
  let e = icsCache.get(url);
  if (!e || now - e.at >= ICS_TTL) {
    const res = await fetch(url.replace(/^webcal:/i, 'https:'), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`ics ${res.status}`);
    e = { at: now, text: await res.text(), tz: '', from: 0, to: 0, events: [] };
    icsCache.set(url, e);
  }
  if (e.tz !== tz || from < e.from || to > e.to) {
    // Parse a wide window once so later queries within it are served from the parsed cache.
    const wFrom = Math.min(from, now - 35 * DAY_MS);
    const wTo = Math.max(to, now + 400 * DAY_MS);
    e.events = parseIcs(e.text, { from: wFrom, to: wTo, defaultTz: tz });
    e.tz = tz;
    e.from = wFrom;
    e.to = wTo;
  }
  return e.events.filter((x) => x.end > from && x.start < to);
}

export function resetIcsCache(): void {
  icsCache.clear();
}

/** strict: a failing feed throws instead of being treated as "no events". */
export async function icsEvents(settings: Settings, from: number, to: number, strict = false): Promise<CalendarEvent[]> {
  const lists = await Promise.all(
    settings.icsUrls.map(async (url, i) => {
      try {
        return (await icsParsed(url, settings.timezone, from, to)).map(
          (e, j): CalendarEvent => ({
            id: `ics:${i}:${e.uid || j}:${e.start}`,
            title: e.title || '予定あり',
            start: new Date(e.start).toISOString(),
            end: new Date(e.end).toISOString(),
            source: 'ics',
          }),
        );
      } catch (err) {
        if (strict) throw err;
        return [];
      }
    }),
  );
  return lists.flat();
}

export async function bookingRows(env: Env, from: number, to: number, statuses: string[]): Promise<Booking[]> {
  const ph = statuses.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT * FROM bookings WHERE status IN (${ph}) AND start_at < ? AND end_at > ? ORDER BY start_at`,
  )
    .bind(...statuses, new Date(to).toISOString(), new Date(from).toISOString())
    .all<Row>();
  return results.map(rowToBooking);
}

/** Google freebusy + ICS (the parts that need network). Strict mode throws on any failure. */
async function externalBusy(env: Env, settings: Settings, from: number, to: number, strict: boolean): Promise<Interval[]> {
  const tokens = await getTokens(env);
  const google = (async (): Promise<Interval[]> => {
    if (!tokens || !settings.googleCalendarIds.length) return [];
    if (tokens.broken) {
      if (strict) throw new Error('google connection broken');
      return [];
    }
    try {
      return await freeBusy(env, settings.googleCalendarIds, from, to);
    } catch (e) {
      if (strict) throw e;
      return [];
    }
  })();
  const ics = icsEvents(settings, from, to, strict);
  const [g, i] = await Promise.all([google, ics]);
  return [...g, ...i.map((e) => ({ start: Date.parse(e.start), end: Date.parse(e.end) }))];
}

function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Per-instance busy cache (60s). Warm instances are reused by Vercel Fluid compute.
const busyCache = new Map<string, { at: number; busy: Interval[] }>();
const BUSY_TTL = 60_000;

/** In-memory 60s cache around externalBusy. Only successful results are cached. */
async function cachedExternalBusy(env: Env, settings: Settings, from: number, to: number): Promise<Interval[]> {
  const v = hashStr(JSON.stringify([settings.googleCalendarIds, settings.icsUrls, settings.timezone, settings.googleConnected]));
  const key = `${from}:${to}:${v}`;
  const now = Date.now();
  const hit = busyCache.get(key);
  if (hit && now - hit.at < BUSY_TTL) return hit.busy;
  const busy = await externalBusy(env, settings, from, to, true);
  if (busyCache.size > 200) {
    for (const [k, e] of busyCache) if (now - e.at >= BUSY_TTL) busyCache.delete(k);
    if (busyCache.size > 200) busyCache.clear();
  }
  busyCache.set(key, { at: now, busy });
  return busy;
}

export function resetBusyCache(): void {
  busyCache.clear();
}

export interface BusyOptions {
  /** Fail with 503 when Google or an ICS feed cannot be read (used for public booking). */
  strict?: boolean;
  /** Use the 60s Cache API entry for Google+ICS (bookings are always read fresh). */
  cache?: boolean;
}

/** All busy intervals used by the slot engine: Google freebusy, ICS feeds, pending/confirmed bookings. */
export async function getBusy(env: Env, settings: Settings, from: number, to: number, opts: BusyOptions = {}): Promise<Interval[]> {
  const strict = !!opts.strict;
  const [external, bookings] = await Promise.all([
    (async () => {
      try {
        return opts.cache ? await cachedExternalBusy(env, settings, from, to) : await externalBusy(env, settings, from, to, strict);
      } catch (e) {
        console.error('busy source failed', e);
        if (strict) throw new HttpError(503, CAL_UNAVAILABLE);
        return [] as Interval[];
      }
    })(),
    bookingRows(env, from, to, ['pending', 'confirmed']),
  ]);
  return [...external, ...bookings.map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))];
}

/** Calendar view: Google events (real titles, falls back to freebusy), ICS, bookings. */
export async function getCalendarEvents(env: Env, settings: Settings, from: number, to: number): Promise<CalendarEvent[]> {
  const bookings = await bookingRows(env, from, to, ['pending', 'confirmed']);
  const own = new Set(bookings.map((b) => b.googleEventId).filter(Boolean));
  const out: CalendarEvent[] = [];

  let gToken: string | null = null;
  try {
    gToken = settings.googleConnected ? await getAccessToken(env) : null;
  } catch {
    gToken = null;
  }
  if (gToken) {
    const perCal = await Promise.all(
      settings.googleCalendarIds.map(async (calId) => {
        try {
          return (await listEvents(env, calId, from, to, settings.timezone))
            .filter((e) => !own.has(e.id))
            .map((e): CalendarEvent => ({
              id: `g:${calId}:${e.id}`,
              title: e.title,
              start: new Date(e.start).toISOString(),
              end: new Date(e.end).toISOString(),
              source: 'google',
            }));
        } catch {
          const busy = await freeBusy(env, [calId], from, to).catch(() => [] as Interval[]);
          return busy.map(
            (b, i): CalendarEvent => ({
              id: `gb:${calId}:${b.start}:${i}`,
              title: '予定あり',
              start: new Date(b.start).toISOString(),
              end: new Date(b.end).toISOString(),
              source: 'google',
            }),
          );
        }
      }),
    );
    out.push(...perCal.flat());
  }

  out.push(...(await icsEvents(settings, from, to).catch(() => [] as CalendarEvent[])));
  for (const b of bookings) {
    out.push({
      id: `b:${b.id}`,
      title: `${b.eventTitle} / ${b.guestName}`,
      start: b.start,
      end: b.end,
      source: 'booking',
      status: b.status,
    });
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}
