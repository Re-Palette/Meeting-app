import {
  addDays,
  dateMinToUtc,
  diffDays,
  getParts,
  isValidTimezone,
  localDate,
  pad,
  parseDate,
  weekdayOf,
  zonedToUtc,
} from './tz';

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

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
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

interface Rule {
  freq: string;
  interval: number;
  count: number | null;
  until: DateInfo | null;
  byDay: number[];
  byMonthDay: number[];
}

function parseRule(rrule: string, defaultTz: string): Rule {
  const o: Record<string, string> = {};
  for (const part of rrule.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) o[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  const until = o.UNTIL ? parseDateValue(o.UNTIL, {}, defaultTz) : null;
  return {
    freq: (o.FREQ ?? '').toUpperCase(),
    interval: Math.max(1, parseInt(o.INTERVAL ?? '1', 10) || 1),
    count: o.COUNT ? parseInt(o.COUNT, 10) || null : null,
    until,
    byDay: (o.BYDAY ?? '')
      .split(',')
      .map((s) => DAY_CODES[s.replace(/^[+-]?\d+/, '').toUpperCase()])
      .filter((n) => n !== undefined),
    byMonthDay: (o.BYMONTHDAY ?? '')
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter((n) => n > 0),
  };
}

const MAX_DAYS = 20000;

/** Expand an event into occurrence start times (epoch ms) that may intersect [from, to). */
function occurrences(ev: RawEvent, start: DateInfo, spanMs: number, opts: IcsOptions): number[] {
  if (!ev.rrule) return [start.ms];
  const rule = parseRule(ev.rrule, opts.defaultTz);
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(rule.freq)) return [start.ms];

  const tz = start.tz;
  const sp = getParts(start.ms, tz);
  const startDate = `${pad(sp.year, 4)}-${pad(sp.month)}-${pad(sp.day)}`;
  const minutes = sp.hour * 60 + sp.minute;
  const untilMs = rule.until
    ? rule.until.allDay
      ? addMs(rule.until.ms, 86400000 - 1)
      : rule.until.ms
    : Infinity;
  const limit = Math.min(opts.to, untilMs + 1);
  const byMonthDay = rule.byMonthDay.length ? rule.byMonthDay : [sp.day];
  const byDay = rule.byDay.length ? rule.byDay : [sp.weekday];
  const startWeekOffset = (sp.weekday + 6) % 7;
  const out: number[] = [];
  let n = 0;

  for (let i = 0, day = startDate; i < MAX_DAYS; i++, day = addDays(day, 1)) {
    const occ = dateMinToUtc(day, minutes, tz);
    if (occ >= limit && occ > start.ms) break;
    const [y, m, d] = parseDate(day);
    let match = false;
    switch (rule.freq) {
      case 'DAILY':
        match = i % rule.interval === 0;
        break;
      case 'WEEKLY':
        match = byDay.includes(weekdayOf(day)) && Math.floor((i + startWeekOffset) / 7) % rule.interval === 0;
        break;
      case 'MONTHLY':
        match = ((y - sp.year) * 12 + (m - sp.month)) % rule.interval === 0 && byMonthDay.includes(d);
        break;
      case 'YEARLY':
        match = (y - sp.year) % rule.interval === 0 && m === sp.month && d === sp.day;
        break;
    }
    if (!match) continue;
    if (occ < start.ms) continue;
    n++;
    if (rule.count !== null && n > rule.count) break;
    if (occ + spanMs > opts.from) out.push(occ);
  }
  return out;
}

function addMs(a: number, b: number): number {
  return a + b;
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

    let spanMs: number;
    let allDayDays = 0;
    if (start.allDay) {
      if (ev.dtend) {
        const a = localDate(start.ms, start.tz);
        const b = localDate(ev.dtend.ms, start.tz);
        allDayDays = Math.max(1, diffDays(a, b));
      } else allDayDays = 1;
      spanMs = allDayDays * 86400000;
    } else if (ev.dtend) spanMs = ev.dtend.ms - start.ms;
    else if (ev.duration) spanMs = parseDuration(ev.duration);
    else spanMs = 0;
    if (spanMs <= 0) continue;

    const exdates = new Set(ev.exdates.map((d) => d.ms));
    for (const occ of occurrences(ev, start, spanMs, opts)) {
      if (exdates.has(occ)) continue;
      if (!ev.recurrenceId && overridden.has(`${ev.uid}|${occ}`)) continue;
      let end = occ + spanMs;
      if (start.allDay) {
        end = dateMinToUtc(addDays(localDate(occ, start.tz), allDayDays), 0, start.tz);
      }
      if (end <= opts.from || occ >= opts.to) continue;
      result.push({ uid: ev.uid, title: ev.summary, start: occ, end, allDay: start.allDay });
    }
  }
  return result.sort((a, b) => a.start - b.start);
}
