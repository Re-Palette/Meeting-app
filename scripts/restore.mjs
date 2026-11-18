// Usage: npm run db:restore -- --list
//        npm run db:restore -- --id N --yes
import { listSnapshots, openClient, restoreSnapshot } from './db-tools.mjs';

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env */
}

const args = process.argv.slice(2);
const idIdx = args.indexOf('--id');
const client = await openClient(process.env.TURSO_DATABASE_URL || 'file:.data/local.db', process.env.TURSO_AUTH_TOKEN);
try {
  if (args.includes('--list')) {
    const snaps = await listSnapshots(client);
    if (!snaps.length) console.log('No snapshots.');
    for (const s of snaps) {
      const counts = Object.entries(s.counts).map(([t, n]) => `${t}=${n}`).join(' ');
      console.log(`#${s.id}  ${s.created_at}  ${s.reason}  [schema ${s.schema || '-'}]  ${counts}`);
    }
  } else if (idIdx >= 0) {
    const id = Number(args[idIdx + 1]);
    if (!Number.isInteger(id)) throw new Error('--id needs a number (see --list)');
    if (!args.includes('--yes')) {
      console.error(`Refusing to restore snapshot #${id} without --yes. This REPLACES the current rows of the snapshotted tables.`);
      process.exit(2);
    }
    const r = await restoreSnapshot(client, id);
    console.log(`Restored snapshot #${id} (schema ${r.schema || '-'}): ${r.restoredTables.join(', ')}${r.skipped.length ? `; skipped missing tables: ${r.skipped.join(', ')}` : ''}`);
  } else {
    console.error('Usage: npm run db:restore -- --list | --id N --yes');
    process.exit(2);
  }
} catch (e) {
  console.error(`[restore] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
} finally {
  client.close();
}
