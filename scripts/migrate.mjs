// Applies migrations/*.sql in order. Each file is atomic (with its `_migrations` row) and preceded by a snapshot.
// Usage: node scripts/migrate.mjs [--if-configured]
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openClient, previewSkip, runMigrations } from './db-tools.mjs';

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env */
}

if (previewSkip(process.env)) {
  console.log('[migrate] preview build: skipping migrations on the shared database');
  process.exit(0);
}
const remoteUrl = process.env.TURSO_DATABASE_URL;
if (process.argv.includes('--if-configured') && !remoteUrl) {
  console.log('[migrate] TURSO_DATABASE_URL is not set; skipping database migrations.');
  process.exit(0);
}

const client = await openClient(remoteUrl || 'file:.data/local.db', process.env.TURSO_AUTH_TOKEN);
try {
  await runMigrations(client, join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations'));
} catch (e) {
  console.error(`[migrate] ${e instanceof Error ? e.message : e}`);
  if (e.snapshotId) console.error(`[migrate] data is unchanged (migration is atomic). If needed restore with: npm run db:restore -- --id ${e.snapshotId} --yes`);
  process.exit(1);
} finally {
  client.close();
}
