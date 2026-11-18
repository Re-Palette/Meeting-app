import { copyFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { KEEP_SNAPSHOTS, listSnapshots, previewSkip, restoreSnapshot, runMigrations, splitStatements, takeSnapshot } from '../scripts/db-tools.mjs';
import { assertDatabaseConfigured, dbFromClient } from './db';
import type { Env } from './env';
import app from './index';
import { getUserByEmail, inviteMember, issueSession } from './users';

const MIG = join(__dirname, '..', 'migrations');
const quiet = () => undefined;
const newClient = () => createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), 'mfs-')), 'db.sqlite')}` });

/** Directory holding only migrations up to (and including) the given number. */
function migrationsUpTo(n: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'mfm-'));
  for (const f of readdirSync(MIG).sort()) if (parseInt(f, 10) <= n) copyFileSync(join(MIG, f), join(dir, f));
  return dir;
}

const rows = async (c: Client, sql: string) => (await c.execute(sql)).rows.map((r) => ({ ...r }));

async function seed(c: Client, step: number): Promise<void> {
  await c.execute("UPDATE settings SET owner_name='太郎', timezone='America/New_York', ics_urls='[\"http://x/a.ics\"]' WHERE id=1");
  await c.execute(
    "INSERT INTO event_types (id,slug,title,description,duration_min,location,location_detail,color,active,require_approval,buffer_before_min,buffer_after_min,min_notice_hours,max_days_ahead,slot_interval_min,availability,questions,created_at) VALUES ('e1','slug1','面談','説明',45,'zoom','https://z',  'blue',1,1,5,10,3,30,15,'{\"1\":[{\"start\":\"09:00\",\"end\":\"12:00\"}]}','[{\"id\":\"q\",\"label\":\"Q\",\"required\":true}]','2024-01-01T00:00:00.000Z')",
  );
  const extraCols = step >= 2 ? ",meet_url,google_event_id,google_calendar_id,sync_error" : ",meet_url,google_event_id";
  const extraVals = step >= 2 ? ",'https://meet/x','gev1','primary','err'" : ",'https://meet/x','gev1'";
  await c.execute(
    `INSERT INTO bookings (id,event_type_id,event_title,duration_min,location,location_detail,start_at,end_at,guest_name,guest_email,guest_company,notes,answers,status,created_at,updated_at${extraCols}) VALUES ('b1','e1','面談',45,'zoom','https://z','2030-01-01T01:00:00.000Z','2030-01-01T01:45:00.000Z','山田','y@x.co','Acme','メモ','{"q":"a"}','confirmed','2024-01-02T00:00:00.000Z','2024-01-02T00:00:00.000Z'${extraVals})`,
  );
  if (step >= 2) {
    await c.execute("INSERT INTO google_tokens (id,email,refresh_token,access_token,expires_at,updated_at) VALUES (1,'Boss@Gmail.com','rt','at',123,'2024-01-01')");
    await c.execute("UPDATE settings SET session_version=3 WHERE id=1");
  }
  if (step >= 3) await c.execute('UPDATE settings SET busy_rules=\'[{"id":"r","label":"L","calendarId":"","keyword":"学校","beforeMin":0,"afterMin":90,"enabled":true}]\' WHERE id=1');
}

describe('upgrade keeps every row (seeded at each historical schema step)', () => {
  for (const step of [1, 2, 3]) {
    it(`data seeded after migration 000${step} survives the remaining migrations`, async () => {
      const c = newClient();
      await runMigrations(c, migrationsUpTo(step), quiet);
      await seed(c, step);
      const res = await runMigrations(c, MIG, quiet);
      expect(res.applied.length).toBe(readdirSync(MIG).length - step);
      expect(res.snapshots.length).toBe(res.applied.length); // one snapshot before each pending migration

      expect((await rows(c, "SELECT * FROM event_types WHERE id='e1'"))[0]).toMatchObject({
        user_id: 'owner', slug: 'slug1', title: '面談', description: '説明', duration_min: 45, location: 'zoom', location_detail: 'https://z',
        color: 'blue', active: 1, require_approval: 1, buffer_before_min: 5, buffer_after_min: 10, min_notice_hours: 3, max_days_ahead: 30,
        slot_interval_min: 15, availability: '{"1":[{"start":"09:00","end":"12:00"}]}', questions: '[{"id":"q","label":"Q","required":true}]',
      });
      expect((await rows(c, "SELECT * FROM bookings WHERE id='b1'"))[0]).toMatchObject({
        user_id: 'owner', event_type_id: 'e1', guest_name: '山田', guest_email: 'y@x.co', guest_company: 'Acme', notes: 'メモ', answers: '{"q":"a"}',
        status: 'confirmed', start_at: '2030-01-01T01:00:00.000Z', meet_url: 'https://meet/x', google_event_id: 'gev1',
        ...(step >= 2 ? { google_calendar_id: 'primary', sync_error: 'err' } : {}),
      });
      expect((await rows(c, 'SELECT * FROM settings'))[0]).toMatchObject({ user_id: 'owner', owner_name: '太郎', timezone: 'America/New_York', ics_urls: '["http://x/a.ics"]' });
      if (step >= 2) {
        expect((await rows(c, 'SELECT * FROM google_tokens'))[0]).toMatchObject({ user_id: 'owner', email: 'Boss@Gmail.com', refresh_token: 'rt', access_token: 'at', expires_at: 123 });
        expect((await rows(c, "SELECT * FROM users WHERE id='owner'"))[0]).toMatchObject({ email: 'boss@gmail.com', session_version: 3 });
      }
      if (step >= 3) expect((await rows(c, 'SELECT busy_rules FROM settings'))[0].busy_rules).toContain('学校');
      // the pre-migration snapshot contains the original rows
      const snaps = await listSnapshots(c);
      expect(snaps.find((x) => x.id === res.snapshots[0])!.counts).toMatchObject({ event_types: 1, bookings: 1 });
      // second run: up to date, no new snapshot
      const again = await runMigrations(c, MIG, quiet);
      expect(again).toEqual({ applied: [], snapshots: [] });
      expect((await listSnapshots(c)).length).toBe(snaps.length);
    });
  }
});

describe('atomic migrations', () => {
  it('a failing migration leaves nothing applied or recorded, and reports the snapshot id', async () => {
    const c = newClient();
    await runMigrations(c, migrationsUpTo(1), quiet);
    await c.execute("INSERT INTO event_types (id,slug,title,duration_min,created_at) VALUES ('e1','s','T',30,'2024')");
    const dir = migrationsUpTo(1);
    writeFileSync(join(dir, '0002_bad.sql'), 'CREATE TABLE half_done (x INTEGER);\nINSERT INTO does_not_exist VALUES (1);');
    const err = await runMigrations(c, dir, quiet).catch((e) => e);
    expect(err.message).toContain('0002_bad.sql failed');
    expect(typeof err.snapshotId).toBe('number');
    expect((await rows(c, "SELECT name FROM sqlite_master WHERE name='half_done'")).length).toBe(0);
    expect((await rows(c, "SELECT name FROM _migrations WHERE name='0002_bad.sql'")).length).toBe(0);
    expect((await rows(c, 'SELECT id FROM event_types')).length).toBe(1);
  });
  it('splitStatements handles quotes/comments and rejects triggers and explicit transactions', () => {
    expect(splitStatements("-- c; x\nINSERT INTO t VALUES ('a;b'); -- tail\nSELECT 1;")).toEqual(["INSERT INTO t VALUES ('a;b')", 'SELECT 1']);
    expect(() => splitStatements('CREATE TRIGGER x AFTER INSERT ON t BEGIN SELECT 1; END;')).toThrow(/trigger/i);
    expect(() => splitStatements('BEGIN; SELECT 1; COMMIT;')).toThrow(/transaction/i);
    expect(() => splitStatements("SELECT 'oops;")).toThrow(/unterminated/);
  });
  it('every shipped migration splits cleanly', () => {
    for (const f of readdirSync(MIG)) expect(() => splitStatements(readFileSync(join(MIG, f), 'utf8'), f)).not.toThrow();
  });
});

describe('snapshot and restore', () => {
  let c: Client;
  beforeEach(async () => {
    c = newClient();
    await runMigrations(c, MIG, quiet);
    await c.execute("INSERT INTO event_types (id,slug,title,duration_min,created_at,user_id) VALUES ('e1','s1','T1',30,'2024','owner'),('e2','s2','T2',30,'2024','owner')");
    await c.execute("UPDATE settings SET owner_name='太郎'");
  });
  it('round-trips: deleted and changed rows come back', async () => {
    const id = await takeSnapshot(c, 'test');
    await c.execute('DELETE FROM event_types');
    await c.execute("UPDATE settings SET owner_name='壊れた'");
    await restoreSnapshot(c, id);
    expect((await rows(c, 'SELECT id FROM event_types ORDER BY id')).map((r) => r.id)).toEqual(['e1', 'e2']);
    expect((await rows(c, 'SELECT owner_name FROM settings'))[0].owner_name).toBe('太郎');
  });
  it('drops removed columns and defaults new ones', async () => {
    const id = await takeSnapshot(c, 'test');
    const snap = JSON.parse(String((await rows(c, `SELECT data FROM _backups WHERE id=${id}`))[0].data));
    for (const r of snap.tables.users.rows) { r.legacy_column = 'x'; delete r.picture; }
    await c.execute({ sql: 'UPDATE _backups SET data=? WHERE id=?', args: [JSON.stringify(snap), id] });
    await restoreSnapshot(c, id);
    expect((await rows(c, 'SELECT id, picture FROM users'))[0]).toMatchObject({ id: 'owner', picture: '' });
  });
  it('keeps only the newest 10 snapshots; excludes meta and rate-limit tables', async () => {
    await c.execute("INSERT INTO rate_limits (key, window_start, count) VALUES ('k', 1, 1)");
    for (let i = 0; i < KEEP_SNAPSHOTS + 2; i++) await takeSnapshot(c, `s${i}`);
    const snaps = await listSnapshots(c);
    expect(snaps.length).toBe(KEEP_SNAPSHOTS);
    expect(Object.keys(snaps[0].counts)).not.toContain('rate_limits');
    expect(Object.keys(snaps[0].counts)).not.toContain('_backups');
  });
  it('refuses unknown snapshot ids', async () => {
    await expect(restoreSnapshot(c, 9999)).rejects.toThrow(/not found/);
  });
});

describe('guards', () => {
  it('preview builds skip migrations; production and local do not', () => {
    expect(previewSkip({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(previewSkip({ VERCEL_ENV: 'development' })).toBe(true);
    expect(previewSkip({ VERCEL_ENV: 'production' })).toBe(false);
    expect(previewSkip({})).toBe(false);
  });
  it('refuses the local file fallback on Vercel without TURSO_DATABASE_URL (503, Japanese)', () => {
    expect(() => assertDatabaseConfigured({ VERCEL: '1' })).toThrowError(/データベースが接続されていません/);
    try { assertDatabaseConfigured({ VERCEL: '1' }); } catch (e) { expect((e as { status: number }).status).toBe(503); }
    expect(() => assertDatabaseConfigured({ VERCEL: '1', TURSO_DATABASE_URL: 'libsql://x' })).not.toThrow();
    expect(() => assertDatabaseConfigured({})).not.toThrow();
  });
});

describe('GET /api/export', () => {
  it("exports only the caller's data, without tokens; owner also gets members", async () => {
    const c = newClient();
    await runMigrations(c, MIG, quiet);
    const env: Env = { DB: dbFromClient(c), ADMIN_PASSWORD: 'pw', SESSION_SECRET: 's', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', APP_URL: 'https://a.test' };
    await inviteMember(env, 'm@example.com');
    const m = (await getUserByEmail(env, 'm@example.com'))!;
    await c.execute("INSERT INTO event_types (id,slug,title,duration_min,created_at,user_id) VALUES ('eo','so','OwnerET',30,'2024','owner'),('em','sm','MemberET',30,'2024',?)".replace('?', `'${m.id}'`));
    await c.execute("INSERT INTO google_tokens (user_id,email,refresh_token,access_token,expires_at,updated_at) VALUES ('owner','o@x.co','SECRET-REFRESH','SECRET-ACCESS',1,'2024')");
    const owner = (await rows(c, "SELECT * FROM users WHERE id='owner'"))[0];
    const cookie = async (u: unknown) => `mf_session=${encodeURIComponent(await issueSession(env, u as never))}`;
    const get = async (ck: string) => app.fetch(new Request('https://a.test/api/export', { headers: { cookie: ck } }), { ...env });

    const r = await get(await cookie(owner));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename="meetflow-backup-\d{4}-\d{2}-\d{2}\.json"$/);
    const text = await r.text();
    expect(text).not.toContain('SECRET-REFRESH');
    expect(text).not.toContain('SECRET-ACCESS');
    expect(text).not.toContain('refresh_token');
    const j = JSON.parse(text);
    expect(j.schemaVersion).toBe(readdirSync(MIG).sort().pop());
    expect(j.exportedAt).toBeTruthy();
    expect(j.eventTypes.map((e: { slug: string }) => e.slug)).toEqual(['so']);
    expect(j.settings).toHaveProperty('busyRules');
    expect(j.members.length).toBe(2);

    const mj = await (await get(await cookie((await rows(c, `SELECT * FROM users WHERE id='${m.id}'`))[0]))).json();
    expect(mj.eventTypes.map((e: { slug: string }) => e.slug)).toEqual(['sm']);
    expect(mj.members).toBeUndefined();
    expect((await app.fetch(new Request('https://a.test/api/export'), { ...env })).status).toBe(401);
  });
});
