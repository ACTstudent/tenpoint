import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { openDb } from './src/db.js';
import { createApp } from './src/app.js';

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;

const db = openDb(resolve(env.DATABASE_PATH || join(here, 'data', 'tenpoint.db')));
const baseUrl = env.BASE_URL || '';
const app = createApp({
  db,
  publicDir: join(here, 'public'),
  srcDir: join(here, 'src'),
  baseUrl,
  secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === '1' : baseUrl.startsWith('https://'),
  trustProxy: env.TRUST_PROXY === '1',
});

const port = Number(env.PORT || 3000);
const server = createServer(app);
server.listen(port, () => console.log(`Tenpoint is running on http://localhost:${port}`));

// Clear out expired sessions once a day.
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString()), 864e5).unref();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
}
