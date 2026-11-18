import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFromClient } from './db';
import type { Env } from './env';
import app from './index';
import { connectState, handleGoogleCallback, loginState } from './loginflow';
import { getUserByEmail, inviteMember, issueSession, userFromCookie, getUserById } from './users';

const MIG = join(__dirname, '..', 'migrations');
const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();

async function migrate(client: Client, upTo?: string, after?: string) {
  for (const f of files) {
    if (upTo && f > upTo) break;
    if (after && f <= after) continue;
    await client.executeMultiple(`BEGIN;\n${readFileSync(join(MIG, f), 'utf8')}\n;COMMIT;`);
  }
}

const SECRET = 'test-secret';
let client: Client;
let env: Env;

async function fresh(): Promise<void> {
  client = createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), 'mf-')), 'db.sqlite')}` });
  env = {
    DB: dbFromClient(client), ADMIN_PASSWORD: 'pw', SESSION_SECRET: SECRET,
    GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'cs', APP_URL: 'https://app.test',
  };
}

const ET = {
  slug: 'owner-slug', title: 'T', description: '', durationMin: 30, location: 'phone', locationDetail: '', color: 'teal',
  active: true, requireApproval: false, bufferBeforeMin: 0, bufferAfterMin: 0, minNoticeHours: 0, maxDaysAhead: 60,
  slotIntervalMin: 30, availability: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), [{ start: '09:00', end: '18:00' }]])), questions: [],
};

async function cookieFor(userId: string): Promise<string> {
  const u = (await getUserById(env, userId))!;
  return `mf_session=${encodeURIComponent(await issueSession(env, u))}`;
}
const call = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  app.fetch(new Request(`https://app.test${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}) } }), { ...env });

describe('migration 0004 keeps single-owner data', () => {
  beforeEach(fresh);
  it('assigns everything to the owner user and carries the Google email and session version', async () => {
    await migrate(client, '0003_busy_rules.sql');
    await client.execute("UPDATE settings SET owner_name='太郎', session_version=7, timezone='America/New_York' WHERE id=1");
    await client.execute("INSERT INTO google_tokens (id,email,refresh_token,updated_at) VALUES (1,'Owner@Gmail.com','rt','2024-01-01')");
    await client.execute(
      "INSERT INTO event_types (id,slug,title,duration_min,created_at) VALUES ('e1','s1','T',30,'2024-01-01')",
    );
    await client.execute(
      "INSERT INTO bookings (id,event_type_id,event_title,duration_min,location,start_at,end_at,guest_name,guest_email,status,created_at,updated_at) VALUES ('b1','e1','T',30,'phone','2030-01-01T00:00:00.000Z','2030-01-01T00:30:00.000Z','G','g@x.co','confirmed','2024-01-01','2024-01-01')",
    );
    await migrate(client, undefined, '0003_busy_rules.sql'); // applies 0004 and anything later
    const q = async (sql: string) => (await client.execute(sql)).rows[0];
    expect(await q("SELECT id, email, role, session_version FROM users")).toMatchObject({ id: 'owner', email: 'owner@gmail.com', role: 'owner', session_version: 7 });
    expect(await q("SELECT user_id, owner_name, timezone FROM settings")).toMatchObject({ user_id: 'owner', owner_name: '太郎', timezone: 'America/New_York' });
    expect(await q("SELECT user_id, email FROM google_tokens")).toMatchObject({ user_id: 'owner', email: 'Owner@Gmail.com' });
    expect(await q("SELECT user_id FROM event_types WHERE id='e1'")).toMatchObject({ user_id: 'owner' });
    expect(await q("SELECT user_id FROM bookings WHERE id='b1'")).toMatchObject({ user_id: 'owner' });
  });
  it('owner email is NULL when Google was never connected', async () => {
    await migrate(client);
    expect((await client.execute("SELECT email FROM users WHERE id='owner'")).rows[0].email).toBeNull();
  });
});

describe('scoping, members and sessions (HTTP)', () => {
  let aCookie: string;
  let bCookie: string;
  let bId: string;
  let ownerEtId: string;
  let ownerBookingId: string;
  beforeEach(async () => {
    await fresh();
    await migrate(client);
    const login = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: 'pw' }) });
    expect(login.status).toBe(200);
    aCookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
    const m = await call('/api/members', { method: 'POST', cookie: aCookie, body: JSON.stringify({ email: 'Member@Example.com' }) });
    expect(m.status).toBe(201);
    bId = (await getUserByEmail(env, 'member@example.com'))!.id;
    bCookie = await cookieFor(bId);
    const et = await call('/api/event-types', { method: 'POST', cookie: aCookie, body: JSON.stringify(ET) });
    ownerEtId = ((await et.json()) as { id: string }).id;
    const now = new Date().toISOString();
    ownerBookingId = 'bk1';
    await client.execute({
      sql: "INSERT INTO bookings (id,user_id,event_type_id,event_title,duration_min,location,start_at,end_at,guest_name,guest_email,status,created_at,updated_at) VALUES ('bk1','owner',?,'T',30,'phone','2099-01-01T00:00:00.000Z','2099-01-01T00:30:00.000Z','G','g@x.co','pending',?,?)",
      args: [ownerEtId, now, now],
    });
  });

  it('password login maps to the owner; me returns the user', async () => {
    const me = (await (await call('/api/auth/me', { cookie: aCookie })).json()) as { authenticated: boolean; user: { role: string; id: string } };
    expect(me).toMatchObject({ authenticated: true, user: { role: 'owner', id: 'owner' } });
    expect(await (await call('/api/auth/me')).json()).toEqual({ authenticated: false, user: null });
  });

  it("member cannot see or modify the owner's event types and bookings (404)", async () => {
    expect(await (await call('/api/event-types', { cookie: bCookie })).json()).toEqual([]);
    expect(await (await call('/api/bookings', { cookie: bCookie })).json()).toEqual([]);
    expect((await call(`/api/event-types/${ownerEtId}`, { cookie: bCookie })).status).toBe(404);
    expect((await call(`/api/event-types/${ownerEtId}`, { method: 'PUT', cookie: bCookie, body: JSON.stringify({ ...ET, slug: 'x2' }) })).status).toBe(404);
    expect((await call(`/api/event-types/${ownerEtId}`, { method: 'DELETE', cookie: bCookie })).status).toBe(404);
    for (const a of ['approve', 'decline', 'cancel']) {
      expect((await call(`/api/bookings/${ownerBookingId}/${a}`, { method: 'POST', cookie: bCookie })).status).toBe(404);
    }
    expect((await call(`/api/event-types/${ownerEtId}`, { cookie: aCookie })).status).toBe(200);
    // slug stays globally unique
    expect((await call('/api/event-types', { method: 'POST', cookie: bCookie, body: JSON.stringify(ET) })).status).toBe(409);
    // settings are separate
    await call('/api/settings', { method: 'PUT', cookie: bCookie, body: JSON.stringify({ ownerName: 'B', timezone: 'Asia/Tokyo', googleCalendarIds: [], googleTargetCalendarId: 'primary', icsUrls: [], busyRules: [] }) });
    expect(((await (await call('/api/settings', { cookie: aCookie })).json()) as { ownerName: string }).ownerName).toBe('');
  });

  it('members API is owner-only', async () => {
    for (const [path, method] of [['/api/members', 'GET'], ['/api/members', 'POST'], ['/api/members/x%40y.co', 'DELETE']]) {
      expect((await call(path, { method, cookie: bCookie, body: method === 'POST' ? '{"email":"z@z.co"}' : undefined })).status).toBe(403);
    }
    expect((await call('/api/members')).status).toBe(401);
    const list = (await (await call('/api/members', { cookie: aCookie })).json()) as { email: string; role: string; status: string }[];
    expect(list.map((m) => [m.role, m.email, m.status])).toEqual([['owner', '', 'active'], ['member', 'member@example.com', 'invited']]);
    expect((await call('/api/members', { method: 'POST', cookie: aCookie, body: '{"email":"MEMBER@example.com"}' })).status).toBe(409);
    expect((await call('/api/members', { method: 'POST', cookie: aCookie, body: '{"email":"bad"}' })).status).toBe(400);
    expect((await call('/api/members/owner', { method: 'DELETE', cookie: aCookie })).status).toBe(404);
  });

  it('removing a member deletes their data and revokes their session; owner cannot be removed', async () => {
    await client.execute("UPDATE users SET email='o@x.co' WHERE id='owner'");
    expect((await call('/api/members/o%40x.co', { method: 'DELETE', cookie: aCookie })).status).toBe(400);
    await call('/api/event-types', { method: 'POST', cookie: bCookie, body: JSON.stringify({ ...ET, slug: 'b-slug' }) });
    expect((await call('/api/members/member%40example.com', { method: 'DELETE', cookie: aCookie })).status).toBe(200);
    expect((await call('/api/event-types', { cookie: bCookie })).status).toBe(401);
    for (const t of ['event_types', 'settings', 'bookings', 'google_tokens']) {
      expect((await client.execute({ sql: `SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`, args: [bId] })).rows[0].n).toBe(0);
    }
    expect((await call(`/api/event-types/${ownerEtId}`, { cookie: aCookie })).status).toBe(200);
  });

  it("logout bumps only that user's session version", async () => {
    expect((await call('/api/auth/logout', { method: 'POST', cookie: bCookie })).status).toBe(200);
    expect((await call('/api/auth/me', { cookie: bCookie })).status).toBe(200);
    expect(((await (await call('/api/auth/me', { cookie: bCookie })).json()) as { authenticated: boolean }).authenticated).toBe(false);
    expect(((await (await call('/api/auth/me', { cookie: aCookie })).json()) as { authenticated: boolean }).authenticated).toBe(true);
    // a cookie for another user id cannot be forged by swapping the prefix
    const token = decodeURIComponent(aCookie.split('=')[1]).split('!')[1];
    expect(await userFromCookie(env, `mf_session=${bId}!${token}`)).toBeNull();
  });

  it('public booking uses the event type owner scope; overlap guard is per user', async () => {
    await call('/api/event-types', { method: 'POST', cookie: bCookie, body: JSON.stringify({ ...ET, slug: 'b-slug' }) });
    const day = new Date(Date.now() + 8 * 86400000);
    const d = day.toISOString().slice(0, 10);
    const slots = async (slug: string) => ((await (await call(`/api/public/event-types/${slug}/slots?from=${d}&to=${d}`)).json()) as { slots: { start: string }[] }).slots;
    const sa = await slots('owner-slug');
    const sb = await slots('b-slug');
    expect(sa.length).toBeGreaterThan(0);
    const body = (start: string, email: string) => JSON.stringify({ start, guestName: 'G', guestEmail: email });
    expect((await call('/api/public/event-types/owner-slug/book', { method: 'POST', body: body(sa[0].start, 'a@x.co') })).status).toBe(201);
    expect((await call('/api/public/event-types/b-slug/book', { method: 'POST', body: body(sb[0].start, 'b@x.co') })).status).toBe(201);
    const rows = (await client.execute("SELECT user_id FROM bookings WHERE guest_email IN ('a@x.co','b@x.co') ORDER BY guest_email")).rows.map((r) => r.user_id);
    expect(rows).toEqual(['owner', bId]);
  });
});

describe('google callback decisions (stubbed token + userinfo)', () => {
  const idToken = (p: Record<string, unknown>) => `x.${Buffer.from(JSON.stringify(p)).toString('base64url')}.y`;
  const stub = (p: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, id_token: idToken(p), ...extra }))));
  beforeEach(async () => { await fresh(); await migrate(client); });
  afterEach(() => vi.unstubAllGlobals());

  it('invited member signs in (case-insensitive), gets profile, last_login_at and tokens', async () => {
    await inviteMember(env, 'invitee@example.com');
    stub({ email: 'Invitee@Example.com', email_verified: true, name: 'Hanako', picture: 'https://p/1.png' });
    const r = await handleGoogleCallback(env, { code: 'c', state: await loginState(env) });
    expect(r.location).toBe('/');
    const u = (await getUserByEmail(env, 'invitee@example.com'))!;
    expect(r.sessionUserId).toBe(u.id);
    expect(u.last_login_at).not.toBe('');
    expect(u.picture).toBe('https://p/1.png');
    expect((await client.execute({ sql: 'SELECT email FROM google_tokens WHERE user_id=?', args: [u.id] })).rows[0].email).toBe('invitee@example.com');
  });
  it('uninvited and unverified emails are rejected without a session', async () => {
    stub({ email: 'stranger@example.com', email_verified: true });
    expect(await handleGoogleCallback(env, { code: 'c', state: await loginState(env) })).toEqual({ location: '/login?error=not_invited' });
    await inviteMember(env, 'v@example.com');
    stub({ email: 'v@example.com', email_verified: false });
    expect(await handleGoogleCallback(env, { code: 'c', state: await loginState(env) })).toEqual({ location: '/login?error=google' });
    expect(await handleGoogleCallback(env, { code: 'c', state: 'forged.state.x' })).toEqual({ location: '/login?error=google' });
    expect(await handleGoogleCallback(env, { error: 'access_denied', state: await loginState(env) })).toEqual({ location: '/login?error=google' });
  });
  it("owner's connected Google email signs in as the owner", async () => {
    await client.execute("UPDATE users SET email='boss@example.com' WHERE id='owner'");
    stub({ email: 'BOSS@example.com', email_verified: true, name: 'Boss' });
    const r = await handleGoogleCallback(env, { code: 'c', state: await loginState(env) });
    expect(r).toEqual({ location: '/', sessionUserId: 'owner' });
  });
  it('connect: sets the owner email, rejects another account or another user\'s email', async () => {
    await inviteMember(env, 'm@example.com');
    stub({ email: 'Boss@Example.com', email_verified: true });
    expect((await handleGoogleCallback(env, { code: 'c', state: await connectState(env, 'owner') })).location).toBe('/settings?google=connected');
    expect((await getUserById(env, 'owner'))!.email).toBe('boss@example.com');
    stub({ email: 'other@example.com', email_verified: true });
    expect((await handleGoogleCallback(env, { code: 'c', state: await connectState(env, 'owner') })).location).toBe('/settings?google=error');
    const m = (await getUserByEmail(env, 'm@example.com'))!;
    stub({ email: 'boss@example.com', email_verified: true });
    expect((await handleGoogleCallback(env, { code: 'c', state: await connectState(env, m.id) })).location).toBe('/settings?google=error');
    // state bound to a user id cannot be reused for another
    const st = (await connectState(env, 'owner')).replace(/^owner/, m.id);
    expect((await handleGoogleCallback(env, { code: 'c', state: st })).location).toBe('/settings?google=error');
  });
  it('name rule: fills empty names, follows Google renames, never overwrites a hand-typed name', async () => {
    await inviteMember(env, 'n@example.com');
    const signIn = async (name: string) => {
      stub({ email: 'n@example.com', email_verified: true, name });
      await handleGoogleCallback(env, { code: 'c', state: await loginState(env) });
    };
    const uid = (await getUserByEmail(env, 'n@example.com'))!.id;
    const nameNow = async () => (await client.execute({ sql: 'SELECT owner_name FROM settings WHERE user_id=?', args: [uid] })).rows[0].owner_name;
    await signIn('Old Name');
    expect(await nameNow()).toBe('Old Name');
    await signIn('New Name'); // still equals last synced -> follows the rename
    expect(await nameNow()).toBe('New Name');
    await client.execute({ sql: "UPDATE settings SET owner_name='My Own Name' WHERE user_id=?", args: [uid] });
    await signIn('Renamed Again'); // hand-typed -> kept
    expect(await nameNow()).toBe('My Own Name');
    expect((await getUserByEmail(env, 'n@example.com'))!.google_name).toBe('Renamed Again');
  });
});
