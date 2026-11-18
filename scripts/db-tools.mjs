// Shared helpers for migrations, snapshots and restore (used by migrate.mjs, restore.mjs and tests).
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SKIP_TABLES = ['_migrations', '_backups', 'rate_limits'];
export const KEEP_SNAPSHOTS = 10;

export async function openClient(url, authToken) {
  if (url.startsWith('file:')) {
    const p = url.slice(5);
    if (p.includes('/')) mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true });
    return (await import('@libsql/client')).createClient({ url });
  }
  return (await import('@libsql/client/web')).createClient({ url, authToken });
}

/** Preview builds share the production database, so only production builds may migrate it. */
export function previewSkip(env) {
  return !!env.VERCEL_ENV && env.VERCEL_ENV !== 'production';
}

/**
 * Splits a migration into single statements. Our migrations contain no triggers; semicolons inside
 * string literals are handled, but anything we cannot split safely fails loudly.
 */
export function splitStatements(sql, file = 'migration') {
  if (/\bCREATE\s+(TEMP\w*\s+)?TRIGGER\b/i.test(sql)) throw new Error(`${file}: triggers are not supported by the migration runner`);
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      cur += '\n';
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
      continue;
    }
    if (c === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (quote) throw new Error(`${file}: unterminated string literal`);
  if (cur.trim()) out.push(cur.trim());
  for (const s of out) {
    if (/^(BEGIN|COMMIT|ROLLBACK|END)\b/i.test(s)) throw new Error(`${file}: do not use explicit transactions (the runner wraps the file atomically)`);
  }
  return out;
}

export async function userTables(client) {
  const rs = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return rs.rows.map((r) => String(r.name)).filter((n) => !SKIP_TABLES.includes(n));
}

async function ensureMeta(client) {
  await client.execute('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  await client.execute('CREATE TABLE IF NOT EXISTS _backups (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, reason TEXT, data TEXT)');
}

/** JSON dump of every user table, stored in `_backups`. Returns the snapshot id. Keeps the newest KEEP_SNAPSHOTS. */
export async function takeSnapshot(client, reason) {
  await ensureMeta(client);
  const tables = {};
  for (const t of await userTables(client)) {
    const rs = await client.execute(`SELECT * FROM "${t}"`);
    tables[t] = { columns: rs.columns, rows: rs.rows.map((r) => Object.fromEntries(rs.columns.map((c) => [c, r[c]]))) };
  }
  const schema = (await client.execute('SELECT name FROM _migrations ORDER BY name DESC LIMIT 1')).rows[0]?.name ?? '';
  const ins = await client.execute({
    sql: 'INSERT INTO _backups (created_at, reason, data) VALUES (?, ?, ?)',
    args: [new Date().toISOString(), reason, JSON.stringify({ schema: String(schema), tables })],
  });
  const id = Number(ins.lastInsertRowid);
  await client.execute({ sql: 'DELETE FROM _backups WHERE id NOT IN (SELECT id FROM _backups ORDER BY id DESC LIMIT ?)', args: [KEEP_SNAPSHOTS] });
  return id;
}

export async function listSnapshots(client) {
  await ensureMeta(client);
  const rs = await client.execute('SELECT id, created_at, reason, data FROM _backups ORDER BY id DESC');
  return rs.rows.map((r) => {
    const d = JSON.parse(String(r.data));
    return {
      id: Number(r.id),
      created_at: String(r.created_at),
      reason: String(r.reason),
      schema: d.schema ?? '',
      counts: Object.fromEntries(Object.entries(d.tables).map(([t, v]) => [t, v.rows.length])),
    };
  });
}

/** Restores a snapshot atomically: per snapshotted table, delete all rows then re-insert (unknown columns dropped, new ones default). */
export async function restoreSnapshot(client, id) {
  await ensureMeta(client);
  const row = (await client.execute({ sql: 'SELECT data FROM _backups WHERE id = ?', args: [id] })).rows[0];
  if (!row) throw new Error(`snapshot ${id} not found`);
  const snap = JSON.parse(String(row.data));
  const stmts = [];
  const skipped = [];
  for (const [table, { rows }] of Object.entries(snap.tables)) {
    const info = await client.execute(`PRAGMA table_info("${table}")`);
    const live = new Set(info.rows.map((r) => String(r.name)));
    if (!live.size) {
      skipped.push(table);
      continue;
    }
    stmts.push(`DELETE FROM "${table}"`);
    for (const r of rows) {
      const cols = Object.keys(r).filter((c) => live.has(c));
      if (!cols.length) continue;
      stmts.push({
        sql: `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
        args: cols.map((c) => r[c]),
      });
    }
  }
  await client.batch(stmts, 'write');
  return { restoredTables: Object.keys(snap.tables).filter((t) => !skipped.includes(t)), skipped, schema: snap.schema ?? '' };
}

export function readMigrations(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
}

/**
 * Applies pending migrations. Each file runs in ONE atomic batch together with its `_migrations` row.
 * A snapshot is taken first (abort without migrating if that fails).
 */
export async function runMigrations(client, dir, log = console.log) {
  await ensureMeta(client);
  const done = new Set((await client.execute('SELECT name FROM _migrations')).rows.map((r) => String(r.name)));
  const pending = readMigrations(dir).filter((m) => !done.has(m.name));
  if (!pending.length) {
    log('[migrate] up to date');
    return { applied: [], snapshots: [] };
  }
  const applied = [];
  const snapshots = [];
  for (const m of pending) {
    const statements = splitStatements(m.sql, m.name); // fail before touching anything
    let snapId = null;
    if ((await userTables(client)).length) {
      try {
        snapId = await takeSnapshot(client, `before ${m.name}`);
        snapshots.push(snapId);
        log(`[migrate] snapshot #${snapId} taken (before ${m.name})`);
      } catch (e) {
        throw Object.assign(new Error(`snapshot failed, nothing migrated: ${e instanceof Error ? e.message : e}`), { snapshotFailed: true });
      }
    }
    try {
      await client.batch(
        [...statements, { sql: 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)', args: [m.name, new Date().toISOString()] }],
        'write',
      );
    } catch (e) {
      throw Object.assign(new Error(`${m.name} failed: ${e instanceof Error ? e.message : e}`), { snapshotId: snapId });
    }
    log(`[migrate] applied ${m.name}`);
    applied.push(m.name);
  }
  log(`[migrate] done (${applied.length} applied)`);
  return { applied, snapshots };
}
