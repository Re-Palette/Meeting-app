import type { AnalyticsData, Booking, Contact, StatCard } from '../shared/types';
import { addDays, dateMinToUtc, diffDays, getParts, localDate, mondayOf, pad } from './tz';

export function weekStarts(now: number, tz: string, n: number): string[] {
  const cur = mondayOf(localDate(now, tz));
  return Array.from({ length: n }, (_, i) => addDays(cur, -7 * (n - 1 - i)));
}

/** Index of the week bucket containing `ms` (or -1). */
export function weekIndex(ms: number, starts: string[], tz: string): number {
  const idx = diffDays(starts[0], mondayOf(localDate(ms, tz))) / 7;
  return Number.isInteger(idx) && idx >= 0 && idx < starts.length ? idx : -1;
}

export function pct(cur: number, prev: number): number {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

export function monthRange(now: number, tz: string, offset = 0): { start: number; end: number } {
  const p = getParts(now, tz);
  const idx = p.year * 12 + (p.month - 1) + offset;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  const ny = Math.floor((idx + 1) / 12);
  const nm = ((idx + 1) % 12) + 1;
  return { start: dateMinToUtc(`${pad(y, 4)}-${pad(m)}-01`, 0, tz), end: dateMinToUtc(`${pad(ny, 4)}-${pad(nm)}-01`, 0, tz) };
}

export function countCard(
  bookings: Booking[],
  statuses: string[],
  now: number,
  tz: string,
): StatCard {
  const inRange = (b: Booking, r: { start: number; end: number }) => {
    const s = Date.parse(b.start);
    return statuses.includes(b.status) && s >= r.start && s < r.end;
  };
  const cur = monthRange(now, tz, 0);
  const prev = monthRange(now, tz, -1);
  const value = bookings.filter((b) => inRange(b, cur)).length;
  const prevValue = bookings.filter((b) => inRange(b, prev)).length;
  const starts = weekStarts(now, tz, 12);
  const series = new Array<number>(12).fill(0);
  for (const b of bookings) {
    if (!statuses.includes(b.status)) continue;
    const i = weekIndex(Date.parse(b.start), starts, tz);
    if (i >= 0) series[i]++;
  }
  return { value, delta: pct(value, prevValue), series };
}

export function pendingCard(bookings: Booking[], now: number, tz: string): StatCard {
  const starts = weekStarts(now, tz, 12);
  const series = new Array<number>(12).fill(0);
  let value = 0;
  for (const b of bookings) {
    if (b.status !== 'pending') continue;
    value++;
    const i = weekIndex(Date.parse(b.createdAt), starts, tz);
    if (i >= 0) series[i]++;
  }
  return { value, delta: pct(series[11], series[10]), series };
}

export function computeAnalytics(bookings: Booking[], titles: Map<string, string>, now: number, tz: string): AnalyticsData {
  const starts = weekStarts(now, tz, 12);
  const weekly = starts.map((weekStart) => ({ weekStart, confirmed: 0, pending: 0, declined: 0, cancelled: 0 }));
  const byEt = new Map<string, { title: string; count: number }>();
  const byWeekday = new Array<number>(7).fill(0);
  const byHour = new Array<number>(24).fill(0);
  let confirmed = 0;
  let declined = 0;
  let leadSum = 0;
  let leadN = 0;

  for (const b of bookings) {
    const i = weekIndex(Date.parse(b.createdAt), starts, tz);
    if (i >= 0) weekly[i][b.status]++;
    if (b.status === 'declined') declined++;
    if (b.status === 'confirmed') {
      confirmed++;
      const p = getParts(Date.parse(b.start), tz);
      byWeekday[p.weekday]++;
      byHour[p.hour]++;
    }
    if (b.status === 'confirmed' || b.status === 'pending') {
      const e = byEt.get(b.eventTypeId) ?? { title: titles.get(b.eventTypeId) ?? b.eventTitle, count: 0 };
      e.count++;
      byEt.set(b.eventTypeId, e);
    }
    if (b.status !== 'declined') {
      leadSum += (Date.parse(b.start) - Date.parse(b.createdAt)) / 86400000;
      leadN++;
    }
  }
  return {
    weekly,
    byEventType: [...byEt.entries()]
      .map(([eventTypeId, v]) => ({ eventTypeId, ...v }))
      .sort((a, b) => b.count - a.count),
    byWeekday,
    byHour,
    totals: {
      bookings: bookings.length,
      confirmed,
      // percentage (0-100): confirmed / (confirmed + declined)
      approvalRate: confirmed + declined === 0 ? 0 : Math.round((confirmed / (confirmed + declined)) * 100),
      avgLeadDays: leadN ? Math.round((leadSum / leadN) * 10) / 10 : 0,
    },
  };
}

export function computeContacts(bookings: Booking[]): Contact[] {
  const map = new Map<string, Contact>();
  for (const b of [...bookings].sort((a, c) => (a.start < c.start ? -1 : 1))) {
    if (b.status === 'declined') continue;
    const key = b.guestEmail.toLowerCase();
    const c = map.get(key);
    map.set(key, {
      email: key,
      name: b.guestName || c?.name || '',
      company: b.guestCompany || c?.company || '',
      bookingCount: (c?.bookingCount ?? 0) + (b.status === 'cancelled' ? 0 : 1),
      lastBookingAt: b.start,
    });
  }
  return [...map.values()].filter((c) => c.bookingCount > 0).sort((a, b) => (a.lastBookingAt < b.lastBookingAt ? 1 : -1));
}
