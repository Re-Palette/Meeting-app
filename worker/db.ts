// Minimal D1-style adapter over libSQL (Turso, or a local SQLite file).
import { mkdirSync } from 'node:fs';
import type { Client, InValue } from '@libsql/client';

export interface RunResult {
  meta: { changes: number };
}

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<RunResult>;
}

export interface Db {
  prepare(sql: string): Statement;
}

function toArg(v: unknown): InValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v as InValue;
}

class Stmt implements Statement {
  constructor(
    private client: () => Promise<Client>,
    private sql: string,
    private args: InValue[] = [],
  ) {}

  bind(...values: unknown[]): Statement {
    return new Stmt(this.client, this.sql, values.map(toArg));
  }

  private async exec() {
    return (await this.client()).execute({ sql: this.sql, args: this.args });
  }

  async first<T>(): Promise<T | null> {
    const rs = await this.exec();
    return (rs.rows[0] as unknown as T) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const rs = await this.exec();
    return { results: rs.rows as unknown as T[] };
  }

  async run(): Promise<RunResult> {
    const rs = await this.exec();
    return { meta: { changes: Number(rs.rowsAffected) } };
  }
}

export async function openClient(url: string, authToken?: string): Promise<Client> {
  if (url.startsWith('file:')) {
    const path = url.slice('file:'.length);
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (dir) mkdirSync(dir, { recursive: true });
    const { createClient } = await import('@libsql/client');
    return createClient({ url });
  }
  // Remote Turso: the HTTP/WebSocket-only build avoids bundling the native SQLite binding.
  const { createClient } = await import('@libsql/client/web');
  return createClient({ url, authToken });
}

/** Wraps an already-open client (used by tests and scripts). */
export function dbFromClient(client: Client): Db {
  return { prepare: (sql) => new Stmt(async () => client, sql) };
}

let shared: Promise<Client> | null = null;

/** Lazily-created process-wide connection (reused across invocations on a warm instance). */
export function createDb(env: NodeJS.ProcessEnv = process.env): Db {
  const get = (): Promise<Client> => {
    shared ??= openClient(env.TURSO_DATABASE_URL || 'file:.data/local.db', env.TURSO_AUTH_TOKEN);
    return shared;
  };
  return { prepare: (sql) => new Stmt(get, sql) };
}
