import { serve } from '@hono/node-server';
import app from '../worker/index.js';
import { envFromProcess } from '../worker/runtime.js';

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env: rely on the process environment */
}

const port = Number(process.env.PORT ?? 8787);
serve({ port, fetch: (req) => app.fetch(req, envFromProcess()) }, () => console.log(`API listening on http://localhost:${port}`));
