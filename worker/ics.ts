import { getParts, isValidTimezone, zonedToUtc } from './tz';

export interface IcsEvent {
  uid: string;
  title: string;
  start: number; // epoch ms
  end: number;
  allDay: boolean;
}

export interface IcsOptions {
  from: number;
  to: number;
  defaultTz: string;
}

interface DateInfo {
  ms: number;
  allDay: boolean;
  tz: string;
}

interface RawEvent {
  uid: string;
  summary: string;
  dtstart?: DateInfo;
  dtend?: DateInfo;
  duration?: string;
  rrule?: string;
  exdates: DateInfo[];
  recurrenceId?: DateInfo;
  transp: string;
  status: string;
}

const WIN_TZ: Record<string, string> = {
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'China Standard Time': 'Asia/Shanghai',
  'Korea Standard Time': 'Asia/Seoul',
  'India Standard Time': 'Asia/Kolkata',
  'UTC': 'UTC',
};

export function unfold(text: string): string[] {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

function parseLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  let inQuote = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ':' && !inQuote) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts: string[] = [];
  let cur = '';
  inQuote = false;
  for (const c of head) {
    if (c === '"') inQuote = !inQuote;
    if (c === ';' && !inQuote) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  const name = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

export function parseDateValue(value: string, params: Record<string, string>, defaultTz: string): DateInfo | null {
  const v = value.trim();
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { ms: zonedToUtc(+m[1], +m[2], +m[3], 0, 0, defaultTz), allDay: true, tz: defaultTz };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +m[4], +m[5]];
  if (m[7]) return { ms: Date.UTC(y, mo - 1, d, h, mi, +(m[6] ?? 0)), allDay: false, tz: 'UTC' };
  let tz = defaultTz;
  const tzid = params.TZID;
  if (tzid) {
    if (isValidTimezone(tzid)) tz = tzid;
    else if (WIN_TZ[tzid]) tz = WIN_TZ[tzid];
  }
  return { ms: zonedToUtc(y, mo, d, h, mi, tz), allDay: false, tz };
}

function parseDuration(s: string): number {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(s.trim());
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const ms =
    (+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 86400000 + +(m[4] ?? 0) * 3600000 + +(m[5] ?? 0) * 60000 + +(m[6] ?? 0) * 1000;
  return sign * ms;
}

const DAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const DAY = 86400000;

interface ByDay {
  n: number; // ordinal (0 = every)
  wd: number;
}

interface Rule {
  freq: string;
  interval: number;
  count: number | null;
  until: DateInfo | null;
  byDay: ByDay[];
  byMonthDay: number[];
}

function parseRule(rrule: string, defaultTz: string): Rule {
  const o: Record<string, string> = {};
  for (const part of rrule.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) o[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  const until = o.UNTIL ? parseDateValue(o.UNTIL, {}, defaultTz) : null;
  const byDay: ByDay[] = [];
  for (const tok of (o.BYDAY ?? '').split(',')) {
    const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(tok.trim());
    if (m) byDay.push({ n: m[1] ? parseInt(m[1], 10) : 0, wd: DAY_CODES[m[2].toUpperCase()] });
  }
  return {
    freq: (o.FREQ ?? '').toUpperCase(),
    interval: Math.max(1, parseInt(o.INTERVAL ?? '1', 10) || 1),
    count: o.COUNT ? parseInt(o.COUNT, 10) || null : null,
    until,
    byDay,
    byMonthDay: (o.BYMONTHDAY ?? '')
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n !== 0),
  };
}

const MAX_ITER_DAYS = 40000;

/** Days since 1970-01-01 (works for negative values). */
function dayNum(y: number, m: number, d: number): number {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  return Math.floor(dt.getTime() / DAY);
}

function ymd(day: number): [number, number, number, number] {
  const dt = new Date(day * DAY);
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), dt.getUTCDay()];
}

function daysInMonth(y: number, m: number): number {
  return dayNum(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - dayNum(y, m, 1);
}

/**
 * Day numbers (local calendar days of the event) of occurrences within [loDay, hiDay].
 * Pure integer arithmetic (no Intl); COUNT is honoured by counting from DTSTART.
 */
function occurrenceDays(rule: Rule, startDay: number, sp: { year: number; month: number; day: number; weekday: number }, loDay: number, hiDay: number): number[] {
  const out: number[] = [];
  const hasByDay = rule.byDay.length > 0;
  const arith = rule.freq === 'DAILY' && !hasByDay;
  let last = hiDay;
  if (rule.count !== null && arith) last = Math.min(last, startDay + (rule.count - 1) * rule.interval);

  if (arith) {
    let d = Math.max(startDay, loDay);
    d += (rule.interval - ((d - startDay) % rule.interval)) % rule.interval;
    for (; d <= last; d += rule.interval) out.push(d);
    return out;
  }

  const from = rule.count !== null ? startDay : Math.max(startDay, loDay);
  last = Math.min(last, from + MAX_ITER_DAYS);
  const startWeekOffset = (sp.weekday + 6) % 7;
  let n = 0;
  for (let d = from; d <= last; d++) {
    const i = d - startDay;
    const [y, m, dom, wd] = ymd(d);
    let match = false;
    switch (rule.freq) {
      case 'DAILY':
        match = i % rule.interval === 0 && rule.byDay.some((b) => b.wd === wd);
        break;
      case 'WEEKLY': {
        const days = hasByDay ? rule.byDay.map((b) => b.wd) : [sp.weekday];
        match = days.includes(wd) && Math.floor((i + startWeekOffset) / 7) % rule.interval === 0;
        break;
      }
      case 'MONTHLY': {
        if (((y - sp.year) * 12 + (m - sp.month)) % rule.interval !== 0) break;
        const dim = daysInMonth(y, m);
        const dayOk = (): boolean =>
          rule.byDay.some((b) => {
            if (b.wd !== wd) return false;
            if (b.n === 0) return true;
            return b.n > 0 ? Math.ceil(dom / 7) === b.n : Math.ceil((dim - dom + 1) / 7) === -b.n;
          });
        const mdOk = (): boolean => rule.byMonthDay.some((x) => (x > 0 ? dom === x : dom === dim + 1 + x));
        if (hasByDay && rule.byMonthDay.length) match = dayOk() && mdOk();
        else if (hasByDay) match = dayOk();
        else if (rule.byMonthDay.length) match = mdOk();
        else match = dom === sp.day;
        break;
      }
      case 'YEARLY':
        match = (y - sp.year) % rule.interval === 0 && m === sp.month && dom === sp.day;
        break;
    }
    if (!match) continue;
    n++;
    if (rule.count !== null && n > rule.count) break;
    if (d >= loDay) out.push(d);
  }
  return out;
}

function unescapeText(s: string): string {
  return s.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

export function parseIcs(text: string, opts: IcsOptions): IcsEvent[] {
  const lines = unfold(text);
  const raws: RawEvent[] = [];
  let cur: RawEvent | null = null;
  let alarmDepth = 0;

  for (const line of lines) {
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      cur = { uid: '', summary: '', exdates: [], transp: '', status: '' };
      alarmDepth = 0;
      continue;
    }
    if (upper === 'END:VEVENT') {
      if (cur) raws.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    if (upper === 'BEGIN:VALARM') {
      alarmDepth++;
      continue;
    }
    if (upper === 'END:VALARM') {
      alarmDepth = Math.max(0, alarmDepth - 1);
      continue;
    }
    if (alarmDepth > 0) continue;
    const p = parseLine(line);
    if (!p) continue;
    switch (p.name) {
      case 'UID':
        cur.uid = p.value.trim();
        break;
      case 'SUMMARY':
        cur.summary = unescapeText(p.value);
        break;
      case 'DTSTART':
        cur.dtstart = parseDateValue(p.value, p.params, opts.defaultTz) ?? undefined;
        break;
      case 'DTEND':
        cur.dtend = parseDateValue(p.value, p.params, opts.defaultTz) ?? undefined;
        break;
      case 'DURATION':
        cur.duration = p.value;
        break;
      case 'RRULE':
        cur.rrule = p.value;
        break;
      case 'EXDATE':
        for (const v of p.value.split(',')) {
          const d = parseDateValue(v, p.params, opts.defaultTz);
          if (d) cur.exdates.push(d);
        }
        break;
      case 'RECURRENCE-ID':
        cur.recurrenceId = parseDateValue(p.value, p.params, opts.defaultTz) ?? undefined;
        break;
      case 'TRANSP':
        cur.transp = p.value.trim().toUpperCase();
        break;
      case 'STATUS':
        cur.status = p.value.trim().toUpperCase();
        break;
    }
  }

  // Overridden instances of recurring events (RECURRENCE-ID) replace the original occurrence.
  const overridden = new Set<string>();
  for (const r of raws) if (r.recurrenceId) overridden.add(`${r.uid}|${r.recurrenceId.ms}`);

  const result: IcsEvent[] = [];
  for (const ev of raws) {
    if (!ev.dtstart) continue;
    if (ev.transp === 'TRANSPARENT' || ev.status === 'CANCELLED') continue;
    const start = ev.dtstart;
    const tz = start.tz;
    const sp = getParts(start.ms, tz);

    let spanMs: number;
    let allDayDays = 0;
    if (start.allDay) {
      if (ev.dtend) {
        const a = dayNum(sp.year, sp.month, sp.day);
        const e = getParts(ev.dtend.ms, tz);
        allDayDays = Math.max(1, dayNum(e.year, e.month, e.day) - a);
      } else allDayDays = 1;
      spanMs = allDayDays * DAY;
    } else if (ev.dtend) spanMs = ev.dtend.ms - start.ms;
    else if (ev.duration) spanMs = parseDuration(ev.duration);
    else spanMs = 0;
    if (spanMs <= 0) continue;

    const exact = new Set(ev.exdates.filter((d) => !d.allDay).map((d) => d.ms));
    const exDays = new Set(
      ev.exdates
        .filter((d) => d.allDay)
        .map((d) => {
          const q = getParts(d.ms, d.tz);
          return dayNum(q.year, q.month, q.day);
        }),
    );

    const emit = (occ: number, day: number): void => {
      if (exact.has(occ) || exDays.has(day)) return;
      if (!ev.recurrenceId && overridden.has(`${ev.uid}|${occ}`)) return;
      let end = occ + spanMs;
      if (start.allDay) {
        const [y, m, d] = ymd(day + allDayDays);
        end = tz === 'UTC' ? Date.UTC(y, m - 1, d) : zonedToUtc(y, m, d, 0, 0, tz);
      }
      if (end <= opts.from || occ >= opts.to) return;
      result.push({ uid: ev.uid, title: ev.summary, start: occ, end, allDay: start.allDay });
    };

    const startDay = dayNum(sp.year, sp.month, sp.day);
    const rule = ev.rrule ? parseRule(ev.rrule, opts.defaultTz) : null;
    if (!rule || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(rule.freq)) {
      emit(start.ms, startDay);
      continue;
    }
    const untilMs = rule.until ? (rule.until.allDay ? rule.until.ms + DAY - 1 : rule.until.ms) : Infinity;
    const loDay = Math.floor((opts.from - spanMs) / DAY) - 2;
    let hiDay = Math.ceil(opts.to / DAY) + 2;
    if (Number.isFinite(untilMs)) hiDay = Math.min(hiDay, Math.ceil(untilMs / DAY) + 2);
    const minutes = sp.hour * 60 + sp.minute;
    for (const day of occurrenceDays(rule, startDay, sp, loDay, hiDay)) {
      const [y, m, d] = ymd(day);
      const occ = tz === 'UTC' ? Date.UTC(y, m - 1, d, sp.hour, sp.minute) : zonedToUtc(y, m, d, Math.floor(minutes / 60), minutes % 60, tz);
      if (occ > untilMs) continue;
      emit(occ, day);
    }
  }
  return result.sort((a, b) => a.start - b.start);
}
