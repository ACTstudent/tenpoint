// Runs Tenpoint as a normal long-lived Node server (local development, a VPS, Docker, Render and so on).
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb, databaseUrlFromEnv, databaseTokenFromEnv } from './src/db.js';
import { createApp } from './src/app.js';
import { deleteExpiredSessions } from './src/store.js';

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;

// npm scripts run from the project folder, so the default file lands in ./data on every OS.
const db = await openDb(databaseUrlFromEnv(env) || 'file:data/tenpoint.db', databaseTokenFromEnv(env));
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
setInterval(() => deleteExpiredSessions(db).catch(() => {}), 864e5).unref();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
}
