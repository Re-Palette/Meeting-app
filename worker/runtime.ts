import { createDb } from './db.js';
import type { Env } from './env.js';

const db = createDb();

/** Per-request Env built from process.env (the object may be mutated per request). */
export function envFromProcess(): Env {
  const e = process.env;
  return {
    DB: db,
    ADMIN_PASSWORD: e.ADMIN_PASSWORD ?? '',
    SESSION_SECRET: e.SESSION_SECRET ?? '',
    GOOGLE_CLIENT_ID: e.GOOGLE_CLIENT_ID ?? '',
    GOOGLE_CLIENT_SECRET: e.GOOGLE_CLIENT_SECRET ?? '',
    APP_URL: e.APP_URL ?? '',
  };
}
