import { Hono, type Context } from 'hono';
import type {
  Booking,
  DashboardData,
  EventType,
  EventTypeWithStats,
  PublicEventType,
  Settings,
} from '../shared/types.js';
import { COOKIE_NAME, SESSION_TTL_SEC, safeEqual } from './auth.js';
import {
  ensureSettings,
  getBusy,
  getCalendarEvents,
  loadSettings,
  rowToBooking,
  rowToEventType,
} from './data.js';
import { type Env, HttpError, uidOf } from './env.js';
import { connectState, handleGoogleCallback, loginState } from './loginflow.js';
import {
  OWNER_ID,
  type UserRow,
  authMe,
  bumpSession,
  getUserById,
  inviteMember,
  issueSession,
  listMembers,
  removeMember,
  userFromCookie,
} from './users.js';
import { clientIp, rateCheck, rateClear, rateHit } from './ratelimit.js';
import * as google from './google.js';
import { generateSlots, computeFreeHours } from './slots.js';
import {
  computeAnalytics,
  computeContacts,
  countCard,
  pendingCard,
  weekIndex,
  weekStarts,
} from './stats.js';
import { addDays, dateMinToUtc, isDateStr, diffDays, localDate } from './tz.js';
import { validateBookingRequest, validateEventTypeInput, validateSettingsInput } from './validate.js';

type Row = Record<string, unknown>;
type AppEnv = { Bindings: Env; Variables: { user: UserRow } };
type C = Context<AppEnv>;

const app = new Hono<AppEnv>();

// Per-request Env: derive APP_URL from the request origin when it is not configured.
app.use('*', async (c, next) => {
  if (!c.env.APP_URL) c.env.APP_URL = new URL(c.req.url).origin;
  await next();
});

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
  console.error(err);
  return c.json({ error: 'サーバーでエラーが発生しました。しばらくしてからもう一度お試しください' }, 500);
});

app.notFound((c) => c.json({ error: 'リソースが見つかりません' }, 404));

async function readJson(c: C): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, 'リクエストの形式が正しくありません');
  }
}

// ---------------------------------------------------------------- auth

const PUBLIC_API = (p: string) =>
  p.startsWith('/api/auth/') || p.startsWith('/api/public/') || p === '/api/google/callback';

app.use('/api/*', async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (PUBLIC_API(p)) return next();
  const user = await userFromCookie(c.env, c.req.header('Cookie'));
  if (!user) throw new HttpError(401, 'ログインが必要です');
  c.set('user', user);
  c.env.userId = user.id; // every owner-side query is scoped to this user
  await next();
});

const requireOwner = (c: C): void => {
  if (c.get('user').role !== 'owner') throw new HttpError(403, 'この操作はオーナーのみ可能です');
};

function cookieHeader(c: C, value: string, maxAge: number): string {
  const secure = new URL(c.req.url).protocol === 'https:' || c.env.APP_URL?.startsWith('https://');
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

const LOGIN_LIMIT_MSG = '試行回数が多すぎます。しばらくしてからお試しください';

app.post('/api/auth/login', async (c) => {
  if (!c.env.ADMIN_PASSWORD || !c.env.SESSION_SECRET) {
    throw new HttpError(500, '管理者パスワードが設定されていません');
  }
  const key = `login:${clientIp(c.req.raw)}`;
  await rateCheck(c.env, key, 10, 10 * 60_000, LOGIN_LIMIT_MSG);
  const body = (await readJson(c)) as { password?: unknown };
  const ok = typeof body?.password === 'string' && (await safeEqual(body.password, c.env.ADMIN_PASSWORD));
  if (!ok) {
    await rateHit(c.env, key, Number.MAX_SAFE_INTEGER, 10 * 60_000, LOGIN_LIMIT_MSG);
    throw new HttpError(401, 'パスワードが正しくありません');
  }
  await rateClear(c.env, key);
  const owner = await getUserById(c.env, OWNER_ID);
  if (!owner) throw new HttpError(500, 'オーナーアカウントが見つかりません。マイグレーションを実行してください');
  c.header('Set-Cookie', cookieHeader(c, await issueSession(c.env, owner), SESSION_TTL_SEC));
  return c.json({ ok: true });
});

app.post('/api/auth/logout', async (c) => {
  // Bumping the version revokes this user's sessions only (when the caller holds a valid one).
  const user = await userFromCookie(c.env, c.req.header('Cookie'));
  if (user) await bumpSession(c.env, user.id);
  c.header('Set-Cookie', cookieHeader(c, '', 0));
  return c.json({ ok: true });
});

app.get('/api/auth/me', async (c) => c.json(await authMe(c.env, await userFromCookie(c.env, c.req.header('Cookie')))));

/** Google sign-in: redirects to Google; only invited users (or the owner) get a session in the callback. */
app.get('/api/auth/google', async (c) => {
  const base = c.env.APP_URL.replace(/\/$/, '');
  if (!google.googleConfigured(c.env) || !c.env.SESSION_SECRET) return c.redirect(`${base}/login?error=google`, 302);
  return c.redirect(google.buildAuthUrl(c.env, await loginState(c.env), 'select_account consent'), 302);
});

// ---------------------------------------------------------------- members (owner only)

app.get('/api/members', async (c) => {
  requireOwner(c);
  return c.json(await listMembers(c.env));
});

app.post('/api/members', async (c) => {
  requireOwner(c);
  const body = (await readJson(c)) as { email?: unknown };
  return c.json(await inviteMember(c.env, body?.email), 201);
});

app.delete('/api/members/:email', async (c) => {
  requireOwner(c);
  await removeMember(c.env, decodeURIComponent(c.req.param('email')));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- helpers

async function allBookings(env: Env): Promise<Booking[]> {
  const { results } = await env.DB.prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY start_at').bind(uidOf(env)).all<Row>();
  return results.map(rowToBooking);
}

async function getEventTypeById(env: Env, id: string): Promise<EventType> {
  const r = await env.DB.prepare('SELECT * FROM event_types WHERE id = ? AND user_id = ?').bind(id, uidOf(env)).first<Row>();
  if (!r) throw new HttpError(404, '日程調整ページが見つかりません');
  return rowToEventType(r);
}

async function getBooking(env: Env, id: string): Promise<Booking> {
  const r = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').bind(id, uidOf(env)).first<Row>();
  if (!r) throw new HttpError(404, '予約が見つかりません');
  return rowToBooking(r);
}

function withStats(types: EventType[], bookings: Booking[], tz: string, now: number): EventTypeWithStats[] {
  const starts = weekStarts(now, tz, 8);
  return types.map((et) => {
    const trend = new Array<number>(8).fill(0);
    let bookingCount = 0;
    for (const b of bookings) {
      if (b.eventTypeId !== et.id || b.status === 'declined' || b.status === 'cancelled') continue;
      bookingCount++;
      const i = weekIndex(Date.parse(b.createdAt), starts, tz);
      if (i >= 0) trend[i]++;
    }
    return { ...et, bookingCount, trend };
  });
}

async function listEventTypes(env: Env): Promise<EventType[]> {
  const { results } = await env.DB.prepare('SELECT * FROM event_types WHERE user_id = ? ORDER BY created_at').bind(uidOf(env)).all<Row>();
  return results.map(rowToEventType);
}

async function setSyncError(env: Env, id: string, msg: string): Promise<void> {
  await env.DB.prepare('UPDATE bookings SET sync_error = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(msg, new Date().toISOString(), id, uidOf(env)).run();
}

async function syncToGoogle(env: Env, booking: Booking, settings: Settings): Promise<void> {
  if (!settings.googleConnected) return;
  let questions: EventType['questions'] = [];
  try {
    questions = (await getEventTypeById(env, booking.eventTypeId)).questions;
  } catch {
    /* event type deleted */
  }
  const lines = [booking.notes && `備考: ${booking.notes}`, booking.guestCompany && `会社: ${booking.guestCompany}`];
  for (const [id, a] of Object.entries(booking.answers)) {
    lines.push(`${questions.find((q) => q.id === id)?.label ?? id}: ${a}`);
  }
  const calendarId = settings.googleTargetCalendarId || 'primary';
  let ev: { id: string; meetUrl: string };
  try {
    ev = await google.createEvent(env, {
      calendarId,
      title: `${booking.eventTitle} / ${booking.guestName}`,
      description: lines.filter(Boolean).join('\n'),
      start: booking.start,
      end: booking.end,
      location: booking.location,
      locationDetail: booking.locationDetail,
      guestEmail: booking.guestEmail,
      guestName: booking.guestName,
    });
  } catch (e) {
    console.error('google event creation failed', e);
    await setSyncError(env, booking.id, 'Googleカレンダーへの登録に失敗しました');
    return;
  }
  const res = await env.DB.prepare(
    `UPDATE bookings SET google_event_id = ?, meet_url = ?, google_calendar_id = ?, sync_error = '', updated_at = ?
     WHERE id = ? AND user_id = ? AND status = 'confirmed'`,
  )
    .bind(ev.id, ev.meetUrl, calendarId, new Date().toISOString(), booking.id, uidOf(env))
    .run();
  if (!res.meta.changes) {
    // Cancelled while the event was being created: do not leave an orphan in Google Calendar.
    try {
      await google.deleteEvent(env, calendarId, ev.id);
    } catch (e) {
      console.error('orphan google event cleanup failed', e);
    }
  }
}

// ---------------------------------------------------------------- dashboard etc.

app.get('/api/dashboard', async (c) => {
  const env = c.env;
  const now = Date.now();
  const settings = await loadSettings(env);
  const tz = settings.timezone;
  const [bookings, types] = await Promise.all([allBookings(env), listEventTypes(env)]);

  // Free hours per week for the last 12 weeks (this week = last point).
  const starts = weekStarts(now, tz, 12);
  const rangeFrom = dateMinToUtc(starts[0], 0, tz);
  const rangeTo = dateMinToUtc(addDays(starts[11], 7), 0, tz);
  const busy = await getBusy(env, settings, rangeFrom, rangeTo);
  const avails = types.filter((t) => t.active).map((t) => t.availability);
  const freeSeries = starts.map((s) => computeFreeHours(avails, busy, s, tz));

  const nowIso = new Date(now).toISOString();
  const upcoming = bookings.filter((b) => (b.status === 'confirmed' || b.status === 'pending') && b.start >= nowIso).slice(0, 5);
  const pending = bookings.filter((b) => b.status === 'pending').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  const data: DashboardData = {
    ownerName: settings.ownerName,
    stats: {
      monthBookings: countCard(bookings, ['confirmed', 'pending'], now, tz),
      confirmed: countCard(bookings, ['confirmed'], now, tz),
      pending: pendingCard(bookings, now, tz),
      freeHoursThisWeek: {
        value: freeSeries[11],
        delta: Math.round((freeSeries[11] - freeSeries[10]) * 10) / 10,
        series: freeSeries,
      },
    },
    upcoming,
    pending,
    eventTypes: withStats(types, bookings, tz, now),
  };
  return c.json(data);
});

app.get('/api/analytics', async (c) => {
  const settings = await loadSettings(c.env);
  const [bookings, types] = await Promise.all([allBookings(c.env), listEventTypes(c.env)]);
  const titles = new Map(types.map((t) => [t.id, t.title]));
  return c.json(computeAnalytics(bookings, titles, Date.now(), settings.timezone));
});

app.get('/api/contacts', async (c) => c.json(computeContacts(await allBookings(c.env))));

app.get('/api/calendar/events', async (c) => {
  const from = Date.parse(c.req.query('from') ?? '');
  const to = Date.parse(c.req.query('to') ?? '');
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    throw new HttpError(400, 'from と to を ISO 形式で指定してください');
  }
  if (to - from > 100 * 86400000) throw new HttpError(400, '期間は100日以内で指定してください');
  const settings = await loadSettings(c.env);
  return c.json(await getCalendarEvents(c.env, settings, from, to));
});

// ---------------------------------------------------------------- event types

app.get('/api/event-types', async (c) => {
  const settings = await loadSettings(c.env);
  const [types, bookings] = await Promise.all([listEventTypes(c.env), allBookings(c.env)]);
  return c.json(withStats(types, bookings, settings.timezone, Date.now()));
});

async function slugTaken(env: Env, slug: string, exceptId?: string): Promise<boolean> {
  const r = await env.DB.prepare('SELECT id FROM event_types WHERE slug = ?').bind(slug).first<{ id: string }>();
  return !!r && r.id !== exceptId;
}

function etBindings(i: ReturnType<typeof validateEventTypeInput>): unknown[] {
  return [
    i.slug, i.title, i.description, i.durationMin, i.location, i.locationDetail, i.color,
    i.active ? 1 : 0, i.requireApproval ? 1 : 0, i.bufferBeforeMin, i.bufferAfterMin,
    i.minNoticeHours, i.maxDaysAhead, i.slotIntervalMin,
    JSON.stringify(i.availability), JSON.stringify(i.questions),
  ];
}

app.post('/api/event-types', async (c) => {
  const input = validateEventTypeInput(await readJson(c));
  if (await slugTaken(c.env, input.slug)) throw new HttpError(409, 'このURLは既に使われています');
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      `INSERT INTO event_types (slug, title, description, duration_min, location, location_detail, color, active,
        require_approval, buffer_before_min, buffer_after_min, min_notice_hours, max_days_ahead, slot_interval_min,
        availability, questions, id, created_at, user_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(...etBindings(input), id, new Date().toISOString(), uidOf(c.env))
      .run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'このURLは既に使われています');
    throw e;
  }
  return c.json(await getEventTypeById(c.env, id), 201);
});

app.get('/api/event-types/:id', async (c) => c.json(await getEventTypeById(c.env, c.req.param('id'))));

app.put('/api/event-types/:id', async (c) => {
  const id = c.req.param('id');
  await getEventTypeById(c.env, id);
  const input = validateEventTypeInput(await readJson(c));
  if (await slugTaken(c.env, input.slug, id)) throw new HttpError(409, 'このURLは既に使われています');
  await c.env.DB.prepare(
    `UPDATE event_types SET slug=?, title=?, description=?, duration_min=?, location=?, location_detail=?, color=?,
      active=?, require_approval=?, buffer_before_min=?, buffer_after_min=?, min_notice_hours=?, max_days_ahead=?,
      slot_interval_min=?, availability=?, questions=? WHERE id=? AND user_id=?`,
  )
    .bind(...etBindings(input), id, uidOf(c.env))
    .run();
  return c.json(await getEventTypeById(c.env, id));
});

app.delete('/api/event-types/:id', async (c) => {
  const id = c.req.param('id');
  await getEventTypeById(c.env, id);
  await c.env.DB.prepare('DELETE FROM event_types WHERE id = ? AND user_id = ?').bind(id, uidOf(c.env)).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- bookings (owner)

app.get('/api/bookings', async (c) => {
  const status = c.req.query('status');
  const scope = c.req.query('scope') ?? 'all';
  if (status && !['pending', 'confirmed', 'declined', 'cancelled'].includes(status)) {
    throw new HttpError(400, 'ステータスの指定が正しくありません');
  }
  if (!['upcoming', 'past', 'all'].includes(scope)) throw new HttpError(400, 'スコープの指定が正しくありません');
  const where: string[] = ['user_id = ?'];
  const binds: string[] = [uidOf(c.env)];
  const nowIso = new Date().toISOString();
  if (status) {
    where.push('status = ?');
    binds.push(status);
  }
  if (scope === 'upcoming') {
    where.push('end_at >= ?');
    binds.push(nowIso);
  } else if (scope === 'past') {
    where.push('end_at < ?');
    binds.push(nowIso);
  }
  const order = scope === 'upcoming' ? 'ASC' : 'DESC';
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM bookings WHERE ${where.join(' AND ')} ORDER BY start_at ${order}`,
  )
    .bind(...binds)
    .all<Row>();
  return c.json(results.map(rowToBooking));
});

app.post('/api/bookings/:id/approve', async (c) => {
  const b = await getBooking(c.env, c.req.param('id'));
  if (b.status !== 'pending') throw new HttpError(409, '承認待ちの予約ではありません');
  const res = await c.env.DB.prepare("UPDATE bookings SET status='confirmed', updated_at=? WHERE id=? AND user_id=? AND status='pending'")
    .bind(new Date().toISOString(), b.id, uidOf(c.env))
    .run();
  if (!res.meta.changes) throw new HttpError(409, '承認待ちの予約ではありません');
  const settings = await loadSettings(c.env);
  await syncToGoogle(c.env, { ...b, status: 'confirmed' }, settings);
  return c.json(await getBooking(c.env, b.id));
});

app.post('/api/bookings/:id/decline', async (c) => {
  const b = await getBooking(c.env, c.req.param('id'));
  const res = await c.env.DB.prepare("UPDATE bookings SET status='declined', updated_at=? WHERE id=? AND user_id=? AND status='pending'")
    .bind(new Date().toISOString(), b.id, uidOf(c.env))
    .run();
  if (!res.meta.changes) throw new HttpError(409, '承認待ちの予約ではありません');
  return c.json(await getBooking(c.env, b.id));
});

app.post('/api/bookings/:id/cancel', async (c) => {
  const b = await getBooking(c.env, c.req.param('id'));
  const res = await c.env.DB.prepare(
    "UPDATE bookings SET status='cancelled', updated_at=? WHERE id=? AND user_id=? AND status IN ('pending','confirmed')",
  )
    .bind(new Date().toISOString(), b.id, uidOf(c.env))
    .run();
  if (!res.meta.changes) throw new HttpError(409, 'この予約はキャンセルできません');
  if (b.googleEventId) {
    try {
      const row = await c.env.DB.prepare('SELECT google_calendar_id FROM bookings WHERE id = ? AND user_id = ?').bind(b.id, uidOf(c.env)).first<{ google_calendar_id: string }>();
      const settings = await loadSettings(c.env);
      await google.deleteEvent(c.env, row?.google_calendar_id || settings.googleTargetCalendarId || 'primary', b.googleEventId);
    } catch (e) {
      console.error('google event deletion failed', e);
      await setSyncError(c.env, b.id, 'Googleカレンダーからの削除に失敗しました。手動で削除してください');
    }
  }
  return c.json(await getBooking(c.env, b.id));
});

// ---------------------------------------------------------------- settings

app.get('/api/settings', async (c) => {
  await ensureSettings(c.env);
  return c.json(await loadSettings(c.env));
});

app.put('/api/settings', async (c) => {
  const i = validateSettingsInput(await readJson(c));
  await ensureSettings(c.env);
  await c.env.DB.prepare(
    `UPDATE settings SET owner_name=?, timezone=?, google_calendar_ids=?, google_target_calendar_id=?, ics_urls=?, busy_rules=? WHERE user_id=?`,
  )
    .bind(i.ownerName, i.timezone, JSON.stringify(i.googleCalendarIds), i.googleTargetCalendarId, JSON.stringify(i.icsUrls), JSON.stringify(i.busyRules), uidOf(c.env))
    .run();
  return c.json(await loadSettings(c.env));
});

// ---------------------------------------------------------------- google

app.get('/api/google/calendars', async (c) => {
  const settings = await loadSettings(c.env);
  if (!settings.googleConnected) return c.json([]);
  return c.json(await google.listCalendars(c.env));
});

app.get('/api/google/auth-url', async (c) => {
  if (!google.googleConfigured(c.env)) {
    throw new HttpError(400, 'Google連携が設定されていません(GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
  }
  return c.json({ url: google.buildAuthUrl(c.env, await connectState(c.env, c.get('user').id)) });
});

app.get('/api/google/callback', async (c) => {
  const base = (c.env.APP_URL ?? '').replace(/\/$/, '');
  const r = await handleGoogleCallback(c.env, { code: c.req.query('code'), state: c.req.query('state'), error: c.req.query('error') });
  if (r.sessionUserId) {
    const u = await getUserById(c.env, r.sessionUserId);
    if (u) c.header('Set-Cookie', cookieHeader(c, await issueSession(c.env, u), SESSION_TTL_SEC));
  }
  return c.redirect(`${base}${r.location}`, 302);
});

app.post('/api/google/disconnect', async (c) => {
  await google.disconnect(c.env);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- public

/** Resolves the event type and scopes a copy of Env to the user who owns it. */
async function publicEventType(env: Env, slug: string): Promise<{ et: EventType; uenv: Env }> {
  const r = await env.DB.prepare('SELECT * FROM event_types WHERE slug = ? AND active = 1').bind(slug).first<Row>();
  if (!r) throw new HttpError(404, 'このページは見つかりません');
  return { et: rowToEventType(r), uenv: { ...env, userId: r.user_id as string } };
}

app.get('/api/public/event-types/:slug', async (c) => {
  const { et, uenv } = await publicEventType(c.env, c.req.param('slug'));
  const settings = await loadSettings(uenv);
  const out: PublicEventType = {
    slug: et.slug,
    title: et.title,
    description: et.description,
    durationMin: et.durationMin,
    location: et.location,
    color: et.color,
    requireApproval: et.requireApproval,
    questions: et.questions,
    ownerName: settings.ownerName,
    timezone: settings.timezone,
    maxDaysAhead: et.maxDaysAhead,
  };
  return c.json(out);
});

async function slotsFor(env: Env, et: EventType, settings: Settings, fromDate: string, toDate: string, now: number, useCache: boolean) {
  const tz = settings.timezone;
  // Strict: if Google / ICS cannot be read, fail with 503 rather than offering possibly-busy slots.
  const busy = await getBusy(env, settings, dateMinToUtc(addDays(fromDate, -1), 0, tz), dateMinToUtc(addDays(toDate, 2), 0, tz), {
    strict: true,
    cache: useCache,
  });
  return generateSlots({ eventType: et, busy, now, fromDate, toDate, timezone: tz });
}

app.get('/api/public/event-types/:slug/slots', async (c) => {
  await rateHit(c.env, `slots:${clientIp(c.req.raw)}`, 120, 10 * 60_000, 'アクセスが多すぎます。しばらくしてからお試しください');
  const { et, uenv } = await publicEventType(c.env, c.req.param('slug'));
  const settings = await loadSettings(uenv);
  const now = Date.now();
  const today = localDate(now, settings.timezone);
  const from = c.req.query('from') ?? today;
  const to = c.req.query('to') ?? addDays(from, 13);
  if (!isDateStr(from) || !isDateStr(to)) throw new HttpError(400, '日付は YYYY-MM-DD 形式で指定してください');
  if (to < from) throw new HttpError(400, '終了日は開始日以降を指定してください');
  if (diffDays(from, to) > 42) throw new HttpError(400, '期間は42日以内で指定してください');
  return c.json({ timezone: settings.timezone, slots: await slotsFor(uenv, et, settings, from, to, now, true) });
});

app.post('/api/public/event-types/:slug/book', async (c) => {
  await rateHit(c.env, `book:${clientIp(c.req.raw)}`, 5, 3600_000, '予約リクエストが多すぎます。しばらくしてからお試しください');
  const { et, uenv } = await publicEventType(c.env, c.req.param('slug'));
  const req = validateBookingRequest(await readJson(c), et);
  const settings = await loadSettings(uenv);
  const now = Date.now();
  const emailCount = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM bookings WHERE lower(guest_email) = ? AND status IN ('pending','confirmed') AND end_at > ?",
  )
    .bind(req.guestEmail.toLowerCase(), new Date(now).toISOString())
    .first<{ n: number }>();
  if ((emailCount?.n ?? 0) >= 3) {
    throw new HttpError(429, 'このメールアドレスでは、これ以上予約できません(上限3件)。');
  }
  const day = localDate(Date.parse(req.start), settings.timezone);
  const slots = await slotsFor(uenv, et, settings, day, day, now, false);
  const slot = slots.find((s) => Date.parse(s.start) === Date.parse(req.start));
  if (!slot) throw new HttpError(409, '申し訳ありません、この時間は既に埋まっています。別の時間をお選びください');

  const id = crypto.randomUUID();
  const status = et.requireApproval ? 'pending' : 'confirmed';
  const iso = new Date(now).toISOString();
  // Atomic guard: insert only when no pending/confirmed booking overlaps this interval.
  const res = await c.env.DB.prepare(
    `INSERT INTO bookings (id, event_type_id, event_title, duration_min, location, location_detail, start_at, end_at,
       guest_name, guest_email, guest_company, notes, answers, status, meet_url, google_event_id, created_at, updated_at, user_id)
     SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,'','',?15,?15,?18
     WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE user_id = ?18 AND status IN ('pending','confirmed') AND start_at < ?17 AND end_at > ?16)`,
  )
    .bind(
      id, et.id, et.title, et.durationMin, et.location, et.locationDetail, slot.start, slot.end,
      req.guestName, req.guestEmail, req.guestCompany, req.notes, JSON.stringify(req.answers), status, iso,
      // overlap guard widened by this event type's buffers
      new Date(Date.parse(slot.start) - et.bufferBeforeMin * 60000).toISOString(),
      new Date(Date.parse(slot.end) + et.bufferAfterMin * 60000).toISOString(),
      uidOf(uenv),
    )
    .run();
  if (!res.meta.changes) throw new HttpError(409, '申し訳ありません、この時間は既に埋まっています。別の時間をお選びください');

  if (status === 'confirmed') await syncToGoogle(uenv, await getBooking(uenv, id), settings);
  return c.json(await getBooking(uenv, id), 201);
});

export default app;
