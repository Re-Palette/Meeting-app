// Timezone helpers built on Intl only (no libraries).

export interface Interval {
  start: number; // epoch ms
  end: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface Parts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sun
}

export function getParts(ms: number, tz: string): Parts {
  const o: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10);
  }
  const hour = (o.hour ?? 0) % 24;
  const weekday = new Date(Date.UTC(o.year, o.month - 1, o.day)).getUTCDay();
  return { year: o.year, month: o.month, day: o.day, hour, minute: o.minute, second: o.second, weekday };
}

/** Offset (local - UTC) in ms at the given instant. */
export function tzOffsetMs(ms: number, tz: string): number {
  const p = getParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Convert a wall-clock time in `tz` to epoch ms. Hours may overflow (24:00 = next midnight). */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const t = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(t, tz);
}

export function parseDate(s: string): [number, number, number] {
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return [y, m, d];
}

export function isDateStr(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = parseDate(s);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

export function localDate(ms: number, tz: string): string {
  const p = getParts(ms, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = parseDate(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = parseDate(a);
  const [y2, m2, d2] = parseDate(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function weekdayOf(dateStr: string): number {
  const [y, m, d] = parseDate(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Epoch ms for `minutes` after local midnight of dateStr in tz. */
export function dateMinToUtc(dateStr: string, minutes: number, tz: string): number {
  const [y, m, d] = parseDate(dateStr);
  return zonedToUtc(y, m, d, Math.floor(minutes / 60), minutes % 60, tz);
}

/** Monday (YYYY-MM-DD) of the week containing dateStr. */
export function mondayOf(dateStr: string): string {
  return addDays(dateStr, -((weekdayOf(dateStr) + 6) % 7));
}

export function parseHM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return NaN;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (mi > 59 || h > 24 || (h === 24 && mi !== 0)) return NaN;
  return h * 60 + mi;
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ start: i.start, end: i.end });
  }
  return out;
}
