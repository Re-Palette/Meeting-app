import type { BookingRequest, EventType, EventTypeInput, Question, SettingsInput, WeeklyAvailability } from '../shared/types.js';
import { HttpError } from './env.js';
import { isValidTimezone, parseHM } from './tz.js';

const LOCATIONS = ['google_meet', 'zoom', 'in_person', 'phone', 'custom'];
const COLORS = ['teal', 'blue', 'purple', 'orange', 'pink'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bad(msg: string): never {
  throw new HttpError(400, msg);
}

function str(v: unknown, label: string, max: number, required = false): string {
  if (v === undefined || v === null) {
    if (required) bad(`${label}を入力してください`);
    return '';
  }
  if (typeof v !== 'string') bad(`${label}の形式が正しくありません`);
  const s = v.trim();
  if (required && !s) bad(`${label}を入力してください`);
  if (s.length > max) bad(`${label}は${max}文字以内で入力してください`);
  return s;
}

function int(v: unknown, label: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    bad(`${label}は${min}〜${max}の整数で指定してください`);
  }
  return v;
}

export function validateEventTypeInput(body: unknown): EventTypeInput {
  if (!body || typeof body !== 'object') bad('リクエストの形式が正しくありません');
  const b = body as Record<string, unknown>;
  const slug = str(b.slug, 'URL', 64, true).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) bad('URLは半角英数字とハイフンのみ使用できます');
  if (!LOCATIONS.includes(b.location as string)) bad('場所の種類が正しくありません');
  if (!COLORS.includes(b.color as string)) bad('カラーが正しくありません');

  const availability: WeeklyAvailability = {};
  const av = (b.availability ?? {}) as Record<string, unknown>;
  if (typeof av !== 'object' || Array.isArray(av)) bad('受付時間の形式が正しくありません');
  for (const [k, ranges] of Object.entries(av)) {
    if (!/^[0-6]$/.test(k) || !Array.isArray(ranges)) bad('受付時間の形式が正しくありません');
    const list = ranges.map((r) => {
      const rr = r as { start?: unknown; end?: unknown };
      const s = parseHM(String(rr?.start));
      const e = parseHM(String(rr?.end));
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) bad('受付時間は「開始 < 終了」のHH:MM形式で指定してください');
      return { start: String(rr.start), end: String(rr.end) };
    });
    if (list.length) availability[k] = list;
  }

  const questions: Question[] = [];
  if (b.questions !== undefined) {
    if (!Array.isArray(b.questions) || b.questions.length > 20) bad('質問は20件以内で指定してください');
    for (const q of b.questions as Record<string, unknown>[]) {
      const id = str(q?.id, '質問ID', 64, true);
      questions.push({ id, label: str(q.label, '質問', 200, true), required: !!q.required });
    }
    if (new Set(questions.map((q) => q.id)).size !== questions.length) bad('質問IDが重複しています');
  }

  return {
    slug,
    title: str(b.title, 'タイトル', 100, true),
    description: str(b.description, '説明', 2000),
    durationMin: int(b.durationMin, '所要時間', 5, 720),
    location: b.location as EventType['location'],
    locationDetail: str(b.locationDetail, '場所の詳細', 500),
    color: b.color as EventType['color'],
    active: !!b.active,
    requireApproval: !!b.requireApproval,
    bufferBeforeMin: int(b.bufferBeforeMin ?? 0, '前のバッファ', 0, 720),
    bufferAfterMin: int(b.bufferAfterMin ?? 0, '後のバッファ', 0, 720),
    minNoticeHours: int(b.minNoticeHours ?? 0, '最短受付時間', 0, 24 * 90),
    maxDaysAhead: int(b.maxDaysAhead ?? 60, '受付期間', 1, 365),
    slotIntervalMin: int(b.slotIntervalMin ?? 30, '開始間隔', 5, 720),
    availability,
    questions,
  };
}

export function validateSettingsInput(body: unknown): SettingsInput {
  if (!body || typeof body !== 'object') bad('リクエストの形式が正しくありません');
  const b = body as Record<string, unknown>;
  if (!isValidTimezone(b.timezone)) bad('タイムゾーンが正しくありません');
  const strArr = (v: unknown, label: string, max: number): string[] => {
    if (!Array.isArray(v) || v.length > max || v.some((x) => typeof x !== 'string')) bad(`${label}の形式が正しくありません`);
    return (v as string[]).map((x) => x.trim()).filter(Boolean);
  };
  const icsUrls = strArr(b.icsUrls ?? [], 'ICSのURL', 10);
  for (const u of icsUrls) {
    if (!/^(https?|webcal):\/\//i.test(u) || u.length > 2000) bad('ICSのURLはhttp(s)またはwebcalで始まる必要があります');
  }
  const ids = strArr(b.googleCalendarIds ?? [], 'カレンダー', 50);
  return {
    ownerName: str(b.ownerName, '名前', 100),
    timezone: b.timezone as string,
    googleCalendarIds: ids,
    googleTargetCalendarId: str(b.googleTargetCalendarId ?? 'primary', '書き込み先カレンダー', 300) || 'primary',
    icsUrls,
  };
}

export function validateBookingRequest(body: unknown, et: EventType): Required<BookingRequest> {
  if (!body || typeof body !== 'object') bad('リクエストの形式が正しくありません');
  const b = body as Record<string, unknown>;
  const startMs = typeof b.start === 'string' ? Date.parse(b.start) : NaN;
  if (!Number.isFinite(startMs)) bad('開始日時が正しくありません');
  const email = str(b.guestEmail, 'メールアドレス', 254, true);
  if (!EMAIL_RE.test(email)) bad('メールアドレスの形式が正しくありません');
  const rawAnswers = (b.answers ?? {}) as Record<string, unknown>;
  if (typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) bad('回答の形式が正しくありません');
  const answers: Record<string, string> = {};
  for (const q of et.questions) {
    const a = str(rawAnswers[q.id], q.label, 1000);
    if (q.required && !a) bad(`「${q.label}」は必須項目です`);
    if (a) answers[q.id] = a;
  }
  return {
    start: new Date(startMs).toISOString(),
    guestName: str(b.guestName, 'お名前', 100, true),
    guestEmail: email,
    guestCompany: str(b.guestCompany, '会社名', 100),
    notes: str(b.notes, '備考', 2000),
    answers,
  };
}
