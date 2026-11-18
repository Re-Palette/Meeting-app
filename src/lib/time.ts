import type { LocationType } from '../../shared/types';

export const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

export const browserTz = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sun
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFmt(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
      weekday: 'short',
    });
    partsCache.set(tz, f);
  }
  return f;
}
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zoned(date: Date | string, tz: string): ZonedParts {
  const d = typeof date === 'string' ? new Date(date) : date;
  let p: Intl.DateTimeFormatPart[];
  try {
    p = partsFmt(tz).formatToParts(d);
  } catch {
    p = partsFmt('UTC').formatToParts(d);
  }
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '0';
  return {
    year: +get('year'),
    month: +get('month'),
    day: +get('day'),
    hour: +get('hour') % 24,
    minute: +get('minute'),
    weekday: WD[get('weekday')] ?? 0,
  };
}

/** UTC instant for a wall-clock time in tz. */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const offset = (t: number) => {
    const z = zoned(new Date(t), tz);
    return Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute) - t;
  };
  let ts = guess - offset(guess);
  ts = guess - offset(ts);
  return new Date(ts);
}

/** Plain calendar date helpers (no time zone, UTC-based arithmetic). */
export interface YMD {
  y: number;
  m: number;
  d: number;
}
export const ymdAdd = (a: YMD, days: number): YMD => {
  const t = new Date(Date.UTC(a.y, a.m - 1, a.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
export const ymdWeekday = (a: YMD) => new Date(Date.UTC(a.y, a.m - 1, a.d)).getUTCDay();
export const ymdKey = (a: YMD) => `${a.y}-${String(a.m).padStart(2, '0')}-${String(a.d).padStart(2, '0')}`;
export const ymdDiff = (a: YMD, b: YMD) =>
  Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
export const todayIn = (tz: string): YMD => {
  const z = zoned(new Date(), tz);
  return { y: z.year, m: z.month, d: z.day };
};
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function fmtTime(iso: string, tz: string) {
  const z = zoned(iso, tz);
  return `${pad2(z.hour)}:${pad2(z.minute)}`;
}
export function fmtDate(iso: string, tz: string) {
  const z = zoned(iso, tz);
  return `${z.month}月${z.day}日`;
}
export function fmtDateWd(iso: string, tz: string, paren: '()' | '（）' = '()') {
  const z = zoned(iso, tz);
  const [o, c] = paren === '()' ? ['(', ')'] : ['（', '）'];
  return `${z.month}月${z.day}日${o}${WEEKDAYS_JA[z.weekday]}${c}`;
}
export function fmtDateTime(iso: string, tz: string) {
  return `${fmtDateWd(iso, tz, '（）')} ${fmtTime(iso, tz)}`;
}
export function fmtRange(start: string, end: string, tz: string) {
  return `${fmtTime(start, tz)} – ${fmtTime(end, tz)}`;
}

export function tzLabel(tz: string) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
    const off = p.find((x) => x.type === 'timeZoneName')?.value ?? '';
    return `${tz.replace(/_/g, ' ')} (${off})`;
  } catch {
    return tz;
  }
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 4 && h < 11) return 'おはようございます';
  if (h >= 11 && h < 18) return 'こんにちは';
  return 'こんばんは';
}

export function givenName(full: string) {
  const parts = full.trim().split(/[\s　]+/);
  return parts.length > 1 ? parts[parts.length - 1] : full.trim();
}

export function relativeDays(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff <= 0) return '今日';
  if (diff === 1) return '昨日';
  if (diff < 30) return `${diff}日前`;
  if (diff < 365) return `${Math.floor(diff / 30)}か月前`;
  return `${Math.floor(diff / 365)}年前`;
}

export const LOCATION_LABEL: Record<LocationType, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  in_person: '対面',
  phone: '電話',
  custom: 'その他',
};

export function durationLabel(min: number) {
  if (min < 60 || min % 60 !== 0) return `${min}分`;
  return `${min / 60}時間`;
}

export function slugify(input: string) {
  const ascii = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (ascii.length >= 3) return ascii.slice(0, 40);
  return `${ascii ? ascii + '-' : ''}${Math.random().toString(36).slice(2, 8)}`;
}
