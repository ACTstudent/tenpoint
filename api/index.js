// Vercel runs this file as a serverless function. vercel.json sends every request that isn't a
// static file in public/ here, with the original path still in req.url.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb, databaseUrlFromEnv, databaseTokenFromEnv } from '../src/db.js';
import { createApp } from '../src/app.js';
import { setupPage } from '../src/views/setup.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let ready;

async function start() {
  const url = databaseUrlFromEnv();
  if (!url) return null;
  const db = await openDb(url, databaseTokenFromEnv());
  return createApp({
    db,
    publicDir: join(root, 'public'),
    srcDir: join(root, 'src'),
    baseUrl: process.env.BASE_URL || '',
    secureCookies: true,
    trustProxy: true,
    serverless: true,
  });
}

export default async function handler(req, res) {
  // One app per warm instance. A failed start is retried on the next request.
  ready ??= start().catch((err) => { ready = undefined; throw err; });
  let app;
  try {
    app = await ready;
  } catch (err) {
    console.error(err);
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(setupPage({ problem: 'connect' }));
  }
  if (!app) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(setupPage({ problem: 'missing' }));
  }
  return app(req, res);
}
