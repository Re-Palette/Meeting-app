// Applies migrations/*.sql in order, tracking applied files in `_migrations`. Idempotent.
// Usage: node scripts/migrate.mjs [--if-configured]
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env */
}

const ifConfigured = process.argv.includes('--if-configured');
const remoteUrl = process.env.TURSO_DATABASE_URL;
if (ifConfigured && !remoteUrl) {
  console.log('[migrate] TURSO_DATABASE_URL is not set; skipping database migrations.');
  process.exit(0);
}

const url = remoteUrl || 'file:.data/local.db';
let client;
if (url.startsWith('file:')) {
  const p = url.slice(5);
  if (p.includes('/')) mkdirSync(dirname(p), { recursive: true });
  client = (await import('@libsql/client')).createClient({ url });
} else {
  client = (await import('@libsql/client/web')).createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

await client.execute('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
const done = new Set((await client.execute('SELECT name FROM _migrations')).rows.map((r) => String(r.name)));

let applied = 0;
for (const f of files) {
  if (done.has(f)) continue;
  const sql = readFileSync(join(dir, f), 'utf8');
  try {
    await client.executeMultiple(`BEGIN;\n${sql}\n;COMMIT;`);
  } catch (e) {
    try {
      await client.execute('ROLLBACK');
    } catch {
      /* no open transaction */
    }
    console.error(`[migrate] ${f} failed:`, e instanceof Error ? e.message : e);
    process.exit(1);
  }
  await client.execute({ sql: 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)', args: [f, new Date().toISOString()] });
  console.log(`[migrate] applied ${f}`);
  applied++;
}
console.log(applied ? `[migrate] done (${applied} applied)` : '[migrate] up to date');
client.close();
