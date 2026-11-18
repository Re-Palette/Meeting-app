import type { Booking, CalendarEvent, EventType, Settings } from '../shared/types';
import type { Env } from './env';
import { getAccessToken, getTokens, freeBusy, listEvents } from './google';
import { parseIcs } from './ics';
import { type Interval } from './tz';

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
    googleConnected: !!t,
    googleEmail: t?.email ?? '',
    googleCalendarIds: parseJson<string[]>(r?.google_calendar_ids, ['primary']),
    googleTargetCalendarId: (r?.google_target_calendar_id as string) ?? 'primary',
    icsUrls: parseJson<string[]>(r?.ics_urls, []),
  };
}

// ---- ICS fetching with ~5 minute in-memory cache ----
const icsCache = new Map<string, { at: number; text: string }>();
const ICS_TTL = 5 * 60 * 1000;

async function fetchIcsText(url: string): Promise<string | null> {
  const hit = icsCache.get(url);
  if (hit && Date.now() - hit.at < ICS_TTL) return hit.text;
  try {
    const res = await fetch(url.replace(/^webcal:/i, 'https:'), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return hit?.text ?? null;
    const text = await res.text();
    icsCache.set(url, { at: Date.now(), text });
    return text;
  } catch {
    return hit?.text ?? null;
  }
}

export async function icsEvents(settings: Settings, from: number, to: number): Promise<CalendarEvent[]> {
  const lists = await Promise.all(
    settings.icsUrls.map(async (url, i) => {
      const text = await fetchIcsText(url);
      if (!text) return [];
      return parseIcs(text, { from, to, defaultTz: settings.timezone }).map(
        (e, j): CalendarEvent => ({
          id: `ics:${i}:${e.uid || j}:${e.start}`,
          title: e.title || '予定あり',
          start: new Date(e.start).toISOString(),
          end: new Date(e.end).toISOString(),
          source: 'ics',
        }),
      );
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

/** All busy intervals used by the slot engine: Google freebusy, ICS feeds, pending/confirmed bookings. */
export async function getBusy(env: Env, settings: Settings, from: number, to: number): Promise<Interval[]> {
  const [google, ics, bookings] = await Promise.all([
    settings.googleConnected && settings.googleCalendarIds.length
      ? freeBusy(env, settings.googleCalendarIds, from, to).catch(() => [] as Interval[])
      : Promise.resolve([] as Interval[]),
    icsEvents(settings, from, to).catch(() => [] as CalendarEvent[]),
    bookingRows(env, from, to, ['pending', 'confirmed']),
  ]);
  return [
    ...google,
    ...ics.map((e) => ({ start: Date.parse(e.start), end: Date.parse(e.end) })),
    ...bookings.map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) })),
  ];
}

/** Calendar view: Google events (real titles, falls back to freebusy), ICS, bookings. */
export async function getCalendarEvents(env: Env, settings: Settings, from: number, to: number): Promise<CalendarEvent[]> {
  const bookings = await bookingRows(env, from, to, ['pending', 'confirmed']);
  const own = new Set(bookings.map((b) => b.googleEventId).filter(Boolean));
  const out: CalendarEvent[] = [];

  if (settings.googleConnected && (await getAccessToken(env))) {
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
