import type { Db } from './db.js';

export interface Env {
  DB: Db;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_URL: string; // may be '' (then derived from the request origin per request)
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
