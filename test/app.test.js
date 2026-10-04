import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let server, base, db;
const slackCalls = [];

before(async () => {
  // Set TEST_DATABASE_URL (for example to a local libSQL server) to run the same tests over HTTP, as on Vercel.
  db = await openDb(process.env.TEST_DATABASE_URL || ':memory:');
  const app = createApp({
    db,
    publicDir: join(root, 'public'),
    srcDir: join(root, 'src'),
    fetchImpl: async (url, opts) => { slackCalls.push({ url, body: JSON.parse(opts.body) }); return { ok: true }; },
    log: { error() {}, warn() {} },
    rateLimits: { signup: { limit: 100 }, respond: { limit: 5 } },
  });
  server = createServer(app);
  // Building the large test upload can take longer than Node's 5 second keep-alive timeout, and fetch
  // would then reuse a socket the server is closing.
  server.keepAliveTimeout = 60000;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections(); server.close(); db.close(); });

// A tiny browser: keeps the session cookie and sends same-origin headers.
function client() {
  let cookie = '';
  const go = async (path, { method = 'GET', form, json, headers = {} } = {}) => {
    const h = { Origin: base, ...headers };
    if (cookie) h.Cookie = cookie;
    let body;
    if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    if (json) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    const res = await fetch(base + path, { method, headers: h, body, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    return { status: res.status, headers: res.headers, text: await res.text(), location: res.headers.get('location') };
  };
  return go;
}

async function signedIn(email) {
  const go = client();
  const r = await go('/signup', { method: 'POST', form: { email, password: 'correct horse battery' } });
  assert.equal(r.status, 303);
  assert.equal(r.location, '/app');
  return go;
}

async function newSurvey(go, brand = 'Copperline Coffee') {
  const r = await go('/app/surveys', { method: 'POST', form: { name: 'Customer NPS', brand } });
  assert.equal(r.status, 303);
  const id = r.location.match(/\/app\/surveys\/(\d+)\/share/)[1];
  const share = await go(`/app/surveys/${id}/share`);
  const pid = share.text.match(/\/s\/([A-Za-z0-9_-]+)"/)[1];
  return { id, pid };
}

test('landing page renders with security headers', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const html = await res.text();
  assert.match(html, /Ask one question\./);
  assert.ok(!/[—–]/.test(html), 'no em or en dashes in the page');
});

test('signup validates input and refuses duplicates', async () => {
  const go = client();
  let r = await go('/signup', { method: 'POST', form: { email: 'nope', password: 'longenough' } });
  assert.equal(r.status, 422);
  assert.match(r.text, /valid email/);
  r = await go('/signup', { method: 'POST', form: { email: 'short@example.com', password: 'short' } });
  assert.match(r.text, /at least 8/);
  await signedIn('dupe@example.com');
  r = await client()('/signup', { method: 'POST', form: { email: 'DUPE@example.com', password: 'another password' } });
  assert.match(r.text, /already exists/);
});

test('login, logout and protected pages', async () => {
  await signedIn('login@example.com');
  const go = client();
  assert.equal((await go('/app')).location, '/login');
  let r = await go('/login', { method: 'POST', form: { email: 'login@example.com', password: 'wrong password' } });
  assert.equal(r.status, 422);
  assert.match(r.text, /don&#39;t match/);
  r = await go('/login', { method: 'POST', form: { email: 'login@example.com', password: 'correct horse battery' } });
  assert.equal(r.location, '/app');
  assert.equal((await go('/app')).status, 200);
  await go('/logout', { method: 'POST' });
  assert.equal((await go('/app')).location, '/login');
});

test('cross-site posts to signed-in routes are blocked', async () => {
  const go = await signedIn('csrf@example.com');
  const r = await go('/app/surveys', { method: 'POST', form: { name: 'x', brand: 'y' }, headers: { Origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

test('a link answer is saved and shows up in results and export', async () => {
  const go = await signedIn('flow@example.com');
  const { id, pid } = await newSurvey(go);
  const page = await fetch(`${base}/s/${pid}`);
  assert.match(await page.text(), /How likely are you to recommend Copperline Coffee/);
  const anon = client();
  let r = await anon(`/s/${pid}`, { method: 'POST', form: { score: '', comment: 'no score' } });
  assert.equal(r.status, 422);
  r = await anon(`/s/${pid}`, { method: 'POST', form: { score: '9', comment: 'Great <b>coffee</b>', src: 'link' } });
  assert.equal(r.location, `/s/${pid}/thanks`);
  const results = await go(`/app/surveys/${id}`);
  assert.match(results.text, /\+100/);
  assert.match(results.text, /Great &lt;b&gt;coffee&lt;\/b&gt;/);
  const csv = await go(`/app/surveys/${id}/export.csv`);
  assert.match(csv.headers.get('content-disposition'), /customer-nps-answers\.csv/);
  assert.match(csv.text, /9,promoter,Great <b>coffee<\/b>,,link/);
});

test('widget API: CORS, score first, comment later, one answer', async () => {
  const go = await signedIn('api@example.com');
  const { id, pid } = await newSurvey(go);
  const pre = await fetch(`${base}/api/r/${pid}`, { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
  const cfg = await (await fetch(`${base}/api/s/${pid}`)).json();
  assert.equal(cfg.brand, 'Copperline Coffee');
  let res = await fetch(`${base}/api/r/${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: 3, source: 'widget' }) });
  assert.equal(res.status, 201);
  const { id: rid, token } = await res.json();
  res = await fetch(`${base}/api/r/${pid}/${rid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'wrong', comment: 'x' }) });
  assert.equal(res.status, 403);
  res = await fetch(`${base}/api/r/${pid}/${rid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, score: 4, comment: 'Line was long' }) });
  assert.equal(res.status, 200);
  const rows = await db.all('SELECT score, comment, source FROM responses WHERE survey_id = ?', [Number(id)]);
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ score: 4, comment: 'Line was long', source: 'widget' }]);
  res = await fetch(`${base}/api/r/${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: 12 }) });
  assert.equal(res.status, 422);
});

test('email clicks record the recipient only when it is a real address', async () => {
  const go = await signedIn('email@example.com');
  const { id, pid } = await newSurvey(go);
  const real = await fetch(`${base}/s/${pid}?score=10&src=email&email=ana@example.com`);
  assert.match(await real.text(), /value="ana@example.com"/);
  const tag = await fetch(`${base}/s/${pid}?score=10&src=email&email=*|EMAIL|*`);
  assert.ok(!(await tag.text()).includes('*|EMAIL|*'));
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM responses WHERE survey_id = ?', [Number(id)])).n, 0, 'opening the page alone records nothing');
});

test('imports keep dates, block duplicates and can be undone', async () => {
  const go = await signedIn('import@example.com');
  const { id } = await newSurvey(go);
  const csv = 'Score,Comment,Created At\n10,Old fan,2023-03-04 05:06:07\n2,Old critic,2023-04-01\nx,bad,2023-01-01\n';
  let r = await go(`/app/surveys/${id}/import`, { method: 'POST', form: { csv, file_name: 'old.csv' } });
  assert.equal(r.status, 303);
  assert.match(r.location, /m=imported&n=2&s=1/);
  const dates = (await db.all("SELECT created_at FROM responses WHERE survey_id = ? AND source = 'import' ORDER BY created_at", [Number(id)])).map((x) => x.created_at);
  assert.deepEqual(dates, ['2023-03-04T05:06:07.000Z', '2023-04-01T00:00:00.000Z']);
  r = await go(`/app/surveys/${id}/import`, { method: 'POST', form: { csv, file_name: 'old.csv' } });
  assert.equal(r.status, 422);
  assert.match(r.text, /already imported/);
  r = await go(`/app/surveys/${id}/import`, { method: 'POST', form: { csv: 'Name\nBob\n' } });
  assert.match(r.text, /No score column/);
  const importId = (await db.get('SELECT id FROM imports WHERE survey_id = ?', [Number(id)])).id;
  await go(`/app/surveys/${id}/imports/${importId}/undo`, { method: 'POST' });
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM responses WHERE survey_id = ?', [Number(id)])).n, 0);
});

test('settings validate colours and Slack URLs, and Slack gets new answers', async () => {
  const go = await signedIn('settings@example.com');
  const { id, pid } = await newSurvey(go);
  const form = { name: 'NPS', brand: 'Copperline', question: 'Would you recommend us?', followUp: 'Why?', color: '#2f5bd3', slackWebhook: '' };
  let r = await go(`/app/surveys/${id}/settings`, { method: 'POST', form: { ...form, color: 'blue' } });
  assert.equal(r.status, 422);
  r = await go(`/app/surveys/${id}/settings`, { method: 'POST', form: { ...form, slackWebhook: 'https://example.com/hook' } });
  assert.match(r.text, /not a Slack webhook/);
  r = await go(`/app/surveys/${id}/settings`, { method: 'POST', form: { ...form, slackWebhook: 'https://hooks.slack.com/services/T000/B000/XYZ' } });
  assert.equal(r.status, 303);
  slackCalls.length = 0;
  await client()(`/s/${pid}`, { method: 'POST', form: { score: '2', comment: 'Cold <coffee> & slow' } });
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(slackCalls.length, 1);
  assert.match(slackCalls[0].body.text, /\*2\* \(Detractor\)/);
  assert.match(slackCalls[0].body.text, /Cold &lt;coffee&gt; &amp; slow/);
});

test('people cannot see each other\'s surveys', async () => {
  const owner = await signedIn('owner@example.com');
  const { id } = await newSurvey(owner);
  const other = await signedIn('other@example.com');
  assert.equal((await other(`/app/surveys/${id}`)).status, 404);
  assert.equal((await other(`/app/surveys/${id}/export.csv`)).status, 404);
  assert.equal((await other(`/app/surveys/${id}/delete`, { method: 'POST', form: { confirm: 'yes' } })).status, 404);
  assert.equal((await owner(`/app/surveys/${id}`)).status, 200);
});

test('deleting a survey and an account removes the data', async () => {
  const go = await signedIn('leaver@example.com');
  const { id, pid } = await newSurvey(go);
  await client()(`/s/${pid}`, { method: 'POST', form: { score: '8' } });
  let r = await go(`/app/surveys/${id}/delete`, { method: 'POST', form: { confirm: 'yes' } });
  assert.equal(r.location, '/app?m=deleted');
  assert.equal((await fetch(`${base}/s/${pid}`)).status, 404);
  await newSurvey(go);
  r = await go('/app/account/delete', { method: 'POST', form: { password: 'wrong one' } });
  assert.equal(r.status, 422);
  r = await go('/app/account/delete', { method: 'POST', form: { password: 'correct horse battery' } });
  assert.equal(r.location, '/');
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM users WHERE email = 'leaver@example.com'")).n, 0);
  // Nothing is left behind: no orphaned surveys, answers, imports or sessions.
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM surveys s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL')).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM responses r LEFT JOIN surveys s ON s.id = r.survey_id WHERE s.id IS NULL')).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM sessions x LEFT JOIN users u ON u.id = x.user_id WHERE u.id IS NULL')).n, 0);
});

test('static files are served and paths cannot escape the public folder', async () => {
  assert.equal((await fetch(`${base}/styles.css`)).status, 200);
  assert.equal((await fetch(`${base}/lib/nps.js`)).status, 200);
  assert.equal((await fetch(`${base}/lib/db.js`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e/server.js`)).status, 404);
  const w = await fetch(`${base}/widget.js`);
  assert.equal(w.headers.get('access-control-allow-origin'), '*');
});

test('answers from one network are rate limited per survey', async () => {
  const go = await signedIn('limits@example.com');
  const { pid } = await newSurvey(go);
  const statuses = [];
  for (let i = 0; i < 7; i++) {
    const res = await fetch(`${base}/api/r/${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: 9 }) });
    statuses.push(res.status);
  }
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429, 429]);
});

test('an oversized import gets a readable error, and a bad URL is a 404', async () => {
  const go = await signedIn('big@example.com');
  const { id } = await newSurvey(go);
  const huge = 'Score\n' + '9\n'.repeat(8 * 1024 * 1024);
  const r = await go(`/app/surveys/${id}/import`, { method: 'POST', form: { csv: huge } });
  assert.equal(r.status, 422);
  assert.match(r.text, /larger than 8 MB/);
  assert.equal((await fetch(`${base}/%E0%A4%A`)).status, 404);
});

test('big imports go in parts, are checked again on the server, and can be rolled back', async () => {
  const go = await signedIn('parts@example.com');
  const { id } = await newSurvey(go);
  const json = (path, data) => go(path, { method: 'POST', json: data });
  const hash = 'a'.repeat(64);
  let r = await json(`/app/surveys/${id}/imports`, { fileHash: hash, fileName: 'export.csv', total: 3 });
  assert.equal(r.status, 201);
  const importId = JSON.parse(r.text).id;
  r = await json(`/app/surveys/${id}/imports`, { fileHash: hash, fileName: 'export.csv', total: 3 });
  assert.equal(r.status, 409, 'the same file cannot be started twice');
  r = await json(`/app/surveys/${id}/imports/${importId}/rows`, { rows: [{ score: 11, comment: '', email: '', created_at: '2024-01-01T00:00:00Z' }] });
  assert.equal(r.status, 422, 'scores outside 0 to 10 are refused');
  r = await json(`/app/surveys/${id}/imports/${importId}/rows`, { rows: [
    { score: 9, comment: 'Old fan', email: 'fan@example.com', created_at: '2024-01-01T00:00:00Z' },
    { score: 3, comment: 'x'.repeat(5000), email: 'not an email', created_at: '2999-01-01T00:00:00Z' },
  ] });
  assert.equal(r.status, 200);
  r = await json(`/app/surveys/${id}/imports/${importId}/rows`, { rows: [{ score: 10, comment: '', email: '', created_at: 'garbage' }] });
  assert.equal(r.status, 200);
  const rows = await db.all('SELECT score, comment, email, created_at FROM responses WHERE survey_id = ? ORDER BY id', [Number(id)]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { score: 9, comment: 'Old fan', email: 'fan@example.com', created_at: '2024-01-01T00:00:00.000Z' });
  assert.equal(rows[1].comment.length, 2000, 'comments are clipped');
  assert.equal(rows[1].email, '', 'bad emails are dropped');
  assert.ok(rows[1].created_at <= new Date().toISOString(), 'future dates become today');
  const page = await go(`/app/surveys/${id}/import`);
  assert.match(page.text, /3 answers/);
  // Another account cannot add rows to this import.
  const other = await signedIn('parts-other@example.com');
  r = await other(`/app/surveys/${id}/imports/${importId}/rows`, { method: 'POST', json: { rows: [] } });
  assert.equal(r.status, 404);
  await go(`/app/surveys/${id}/imports/${importId}/undo`, { method: 'POST', json: {} });
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM responses WHERE survey_id = ?', [Number(id)])).n, 0);
  // A signed-out JSON request gets a JSON answer rather than a redirect.
  r = await client()(`/app/surveys/${id}/imports`, { method: 'POST', json: { fileHash: hash, total: 1 } });
  assert.equal(r.status, 401);
});

test('rate limits are kept in the database, so they hold across server instances', async () => {
  const { hitRateLimit } = await import('../src/store.js');
  const cfg = { limit: 2, windowMs: 60000 };
  assert.deepEqual([await hitRateLimit(db, 'k1', cfg), await hitRateLimit(db, 'k1', cfg), await hitRateLimit(db, 'k1', cfg)], [true, true, false]);
  assert.equal(await hitRateLimit(db, 'k2', cfg), true, 'keys are counted separately');
  assert.equal(await hitRateLimit(db, 'k1', { limit: 2, windowMs: -1 }), true, 'an expired window starts again');
});
