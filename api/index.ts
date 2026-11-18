import app from '../worker/index.js';
import { envFromProcess } from '../worker/runtime.js';

// vercel.json rewrites /api/* to this function; the Node.js runtime keeps the original request URL,
// so Hono routes on the real path (/api/auth/login, ...).
const handler = (req: Request): Promise<Response> => Promise.resolve(app.fetch(req, envFromProcess()));

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
