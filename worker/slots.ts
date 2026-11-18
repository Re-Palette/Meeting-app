import type { EventType, Slot, WeeklyAvailability } from '../shared/types';
import {
  type Interval,
  addDays,
  dateMinToUtc,
  localDate,
  mergeIntervals,
  parseHM,
  weekdayOf,
} from './tz';

export type SlotEventType = Pick<
  EventType,
  | 'durationMin'
  | 'bufferBeforeMin'
  | 'bufferAfterMin'
  | 'minNoticeHours'
  | 'maxDaysAhead'
  | 'slotIntervalMin'
  | 'availability'
>;

export interface SlotParams {
  eventType: SlotEventType;
  busy: Interval[];
  now: number; // epoch ms
  fromDate: string; // YYYY-MM-DD, owner tz
  toDate: string; // inclusive
  timezone: string;
}

const MIN = 60000;

function windowsFor(av: WeeklyAvailability, weekday: number): [number, number][] {
  const out: [number, number][] = [];
  for (const r of av[String(weekday)] ?? []) {
    const s = parseHM(r.start);
    const e = parseHM(r.end);
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) out.push([s, e]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** `merged` is sorted and non-overlapping: binary-search the first block ending after `lo`. */
function overlapsBusy(merged: Interval[], lo: number, hi: number): boolean {
  let a = 0;
  let b = merged.length;
  while (a < b) {
    const mid = (a + b) >> 1;
    if (merged[mid].end <= lo) a = mid + 1;
    else b = mid;
  }
  return a < merged.length && merged[a].start < hi;
}

export function generateSlots(p: SlotParams): Slot[] {
  const { eventType: et, busy, now, timezone: tz } = p;
  const today = localDate(now, tz);
  const lastDay = addDays(today, et.maxDaysAhead);
  let day = p.fromDate < today ? today : p.fromDate;
  const end = p.toDate > lastDay ? lastDay : p.toDate;
  const earliest = now + et.minNoticeHours * 3600000;
  const dur = et.durationMin * MIN;
  const step = Math.max(1, et.slotIntervalMin);
  const bufB = et.bufferBeforeMin * MIN;
  const bufA = et.bufferAfterMin * MIN;
  const merged = mergeIntervals(busy);
  const slots: Slot[] = [];

  for (let guard = 0; day <= end && guard < 400; guard++, day = addDays(day, 1)) {
    const seen = new Set<number>();
    // Resolve the tz offset once per day; fall back to per-slot resolution only on DST-change days.
    const dayStart = dateMinToUtc(day, 0, tz);
    const uniform = dateMinToUtc(day, 24 * 60, tz) - dayStart === 24 * 60 * MIN;
    const at = (m: number) => (uniform ? dayStart + m * MIN : dateMinToUtc(day, m, tz));
    for (const [ws, we] of windowsFor(et.availability, weekdayOf(day))) {
      const windowEnd = at(we);
      for (let m = ws; m + et.durationMin <= we; m += step) {
        const start = at(m);
        const slotEnd = start + dur;
        if (slotEnd > windowEnd) continue;
        if (start < earliest || seen.has(start)) continue;
        if (overlapsBusy(merged, start - bufB, slotEnd + bufA)) continue;
        seen.add(start);
        slots.push({ start: new Date(start).toISOString(), end: new Date(slotEnd).toISOString() });
      }
    }
  }
  slots.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return slots;
}

/**
 * Free hours for the Mon-Sun week starting at `weekStartDate` (owner tz):
 * union of all availability windows per weekday, minus busy time.
 */
export function computeFreeHours(
  avails: WeeklyAvailability[],
  busy: Interval[],
  weekStartDate: string,
  tz: string,
): number {
  const mergedBusy = mergeIntervals(busy);
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStartDate, i);
    const wd = weekdayOf(day);
    const wins: Interval[] = [];
    for (const av of avails) {
      for (const [s, e] of windowsFor(av, wd)) {
        wins.push({ start: dateMinToUtc(day, s, tz), end: dateMinToUtc(day, e, tz) });
      }
    }
    for (const w of mergeIntervals(wins)) {
      let free = w.end - w.start;
      for (const b of mergedBusy) {
        const o = Math.min(b.end, w.end) - Math.max(b.start, w.start);
        if (o > 0) free -= o;
      }
      total += Math.max(0, free);
    }
  }
  return Math.round((total / 3600000) * 10) / 10;
}
