import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as store from './store.js';
import * as auth from './auth.js';
import {
  HttpError, readForm, parseCookies, cookie, sendHtml, sendJson, redirect,
  staticFiles, fileVersion, clientIp, baseHeaders,
} from './http.js';
import { setAssetVersion, plural, fmtDate } from './html.js';
import { summarize, monthlyTrend, mapImport, parseScore, parseDate, clip, toCsv, group, GROUPS } from './nps.js';
import { slackMessage, postToSlack, validSlackWebhook } from './slack.js';
import { landing } from './views/landing.js';
import { signupPage, loginPage } from './views/auth.js';
import * as views from './views/app.js';
import { surveyPage, thanksPage, widgetPreviewPage } from './views/survey.js';

const SESSION_COOKIE = 'tp_session';
const PER_PAGE = 25;
// 8 MB of CSV can take up to three times that once it is form-encoded.
const IMPORT_FORM_LIMIT = 26 * 1024 * 1024;
// The browser sends big imports in parts, each well under Vercel's 4.5 MB request limit.
const IMPORT_PART_LIMIT = 3 * 1024 * 1024;
const IMPORT_PART_ROWS = 2000;
const NOINDEX = { 'X-Robots-Tag': 'noindex' };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
// On a long-running server, answers that arrive score-first (email clicks, the widget) wait this long
// for a comment before going to Slack, so the channel gets one message instead of two.
const SLACK_HOLD_MS = 90 * 1000;

const ASSETS = ['styles.css', 'boot.js', 'app.js', 'landing.js', 'survey.js', 'share.js', 'import.js', 'widget.js', 'icons.svg'];

export function createApp({
  db, publicDir, srcDir, baseUrl = '', secureCookies = false, trustProxy = false, fetchImpl = fetch, log = console,
  rateLimits = {}, serverless = false,
}) {
  const serveStatic = staticFiles(publicDir);
  const serveLib = staticFiles(srcDir);
  setAssetVersion(fileVersion(...ASSETS.map((f) => readFileSync(join(publicDir, f))), readFileSync(join(srcDir, 'nps.js')), readFileSync(join(srcDir, 'snippet.js'))));

  const limits = {
    signup: { limit: 10, windowMs: 60 * 60 * 1000, ...rateLimits.signup },
    login: { limit: 10, windowMs: 10 * 60 * 1000, ...rateLimits.login },
    respond: { limit: 30, windowMs: 10 * 60 * 1000, ...rateLimits.respond },
  };
  const allowed = (name, key) => store.hitRateLimit(db, `${name}|${key}`, limits[name]);
  const pendingSlack = new Map();

  const origin = (req) => {
    const proto = trustProxy && req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).split(',')[0].trim() : (secureCookies ? 'https' : 'http');
    return `${proto}://${req.headers.host}`;
  };
  const base = (req) => (baseUrl || origin(req)).replace(/\/+$/, '');

  // Cookie-authenticated POSTs must come from our own pages.
  function sameOrigin(req) {
    const o = req.headers.origin;
    if (o) return o === origin(req) || Boolean(baseUrl && o === new URL(baseUrl).origin);
    const site = req.headers['sec-fetch-site'];
    return !site || site === 'same-origin' || site === 'none';
  }

  function sessionCookie(value, maxAge) {
    return cookie(SESSION_COOKIE, value, { maxAge, secure: secureCookies });
  }

  function currentUser(req) {
    return auth.sessionUser(db, parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  }

  // Posts to Slack. A serverless function can be frozen once it has answered, so there the post finishes first.
  async function notify(survey, response, kind, link) {
    if (!survey.slack_webhook) return;
    const ok = await postToSlack(survey.slack_webhook, slackMessage(survey, response, { kind, link: `${link}/app/surveys/${survey.id}` }), { fetchImpl });
    if (!ok) log.warn?.(`Slack post failed for survey ${survey.id}`);
  }
  const send = (promise) => (serverless ? promise : (promise.catch(() => {}), undefined));

  function scoreFirst(survey, response, req) {
    if (!survey.slack_webhook) return undefined;
    const link = base(req);
    if (serverless) return notify(survey, response, 'new', link);
    const t = setTimeout(() => {
      pendingSlack.delete(response.id);
      notify(survey, response, 'new', link).catch(() => {});
    }, SLACK_HOLD_MS);
    t.unref?.();
    pendingSlack.set(response.id, t);
    return undefined;
  }

  function commentAdded(survey, response, req) {
    const t = pendingSlack.get(response.id);
    if (t) {
      clearTimeout(t);
      pendingSlack.delete(response.id);
      return send(notify(survey, response, 'new', base(req)));
    }
    if (response.comment && response.comment !== response.previousComment) {
      return send(notify(survey, response, 'comment', base(req)));
    }
    return undefined;
  }

  function flashFrom(url) {
    const q = url.searchParams;
    const n = Number(q.get('n') || 0);
    const skipped = Number(q.get('s') || 0);
    switch (q.get('m')) {
      case 'created': return { text: 'Survey created. Share it with the options below.' };
      case 'saved': return { text: 'Changes saved.' };
      case 'imported': return { text: `Imported ${plural(n, 'answer')}.${skipped ? ` Skipped ${plural(skipped, 'row')} without a score from 0 to 10.` : ''}` };
      case 'undone': return { text: 'Import removed.' };
      case 'slack-ok': return { text: 'Test message sent to Slack.' };
      case 'slack-fail': return { kind: 'error', text: "Slack didn't accept the test message. Check the webhook URL." };
      case 'deleted': return { text: 'Survey deleted.' };
      default: return null;
    }
  }

  async function ownedSurvey(user, id) {
    const s = await store.surveyForUser(db, user.id, Number(id));
    if (!s) throw new HttpError(404, 'Not found');
    s.totalAll = Number(s.total_all);
    return s;
  }

  function validateSurvey(form) {
    const v = {
      name: clip(form.name, 80),
      brand: clip(form.brand, 60),
      question: clip(form.question, 200),
      followUp: clip(form.followUp, 140),
      color: String(form.color || '').trim().toLowerCase(),
      slackWebhook: String(form.slackWebhook || '').trim(),
    };
    if (!v.name) return { v, error: 'Give the survey a name.' };
    if (!v.question) return { v, error: 'The question cannot be empty.' };
    if (!v.followUp) return { v, error: 'The follow-up question cannot be empty.' };
    if (!/^#[0-9a-f]{6}$/.test(v.color)) return { v, error: 'Pick a colour, or type it as a hex code like #1d7a50.' };
    if (v.slackWebhook && !validSlackWebhook(v.slackWebhook)) return { v, error: 'That is not a Slack webhook URL. It should start with https://hooks.slack.com/services/.' };
    return { v };
  }

  // Rows sent by the browser during an import are checked again here.
  function cleanImportRows(rows) {
    if (!Array.isArray(rows) || rows.length > IMPORT_PART_ROWS) return null;
    const nowIso = new Date().toISOString();
    const out = [];
    for (const r of rows) {
      if (!r || typeof r !== 'object' || !Number.isInteger(r.score) || r.score < 0 || r.score > 10) return null;
      const date = parseDate(r.created_at);
      const email = clip(r.email, 254);
      out.push({
        score: r.score,
        comment: clip(r.comment, 2000),
        email: auth.validEmail(email) ? email : '',
        created_at: date && date.toISOString() <= nowIso ? date.toISOString() : nowIso,
      });
    }
    return out;
  }

  // Routes

  const routes = [];
  const on = (method, pattern, handler, opts = {}) => routes.push({ method, pattern, handler, ...opts });

  on('GET', /^\/$/, async ({ req, res }) => sendHtml(res, 200, landing({ user: await currentUser(req) })));
  on('GET', /^\/healthz$/, ({ res }) => { res.writeHead(200, baseHeaders({ 'Content-Type': 'text/plain' })); res.end('ok'); });

  on('GET', /^\/signup$/, async ({ req, res }) => ((await currentUser(req)) ? redirect(res, '/app') : sendHtml(res, 200, signupPage(), NOINDEX)));
  on('POST', /^\/signup$/, async ({ req, res }) => {
    const form = await readForm(req);
    const email = clip(form.email, 254).toLowerCase();
    const password = String(form.password || '');
    const fail = (error, status = 422) => sendHtml(res, status, signupPage({ values: { email }, error }), NOINDEX);
    if (!(await allowed('signup', clientIp(req, trustProxy)))) return fail('Too many sign-ups from this network. Try again in an hour.', 429);
    if (!auth.validEmail(email)) return fail('Enter a valid email address.');
    if (password.length < 8) return fail('Use a password of at least 8 characters.');
    if (password.length > 200) return fail('Use a password of 200 characters or fewer.');
    if (await store.userByEmail(db, email)) return fail('An account with this email already exists. Log in instead.');
    const userId = await store.createUser(db, email, auth.hashPassword(password));
    const s = await auth.createSession(db, userId);
    redirect(res, '/app', { 'Set-Cookie': sessionCookie(s.raw, s.maxAge) });
  }, { csrf: true });

  on('GET', /^\/login$/, async ({ req, res }) => ((await currentUser(req)) ? redirect(res, '/app') : sendHtml(res, 200, loginPage(), NOINDEX)));
  on('POST', /^\/login$/, async ({ req, res }) => {
    const form = await readForm(req);
    const email = clip(form.email, 254).toLowerCase();
    const password = String(form.password || '');
    const fail = (error, status = 422) => sendHtml(res, status, loginPage({ values: { email }, error }), NOINDEX);
    if (!(await allowed('login', `${clientIp(req, trustProxy)}|${email}`))) return fail('Too many attempts. Wait 10 minutes and try again.', 429);
    const user = await store.userByEmail(db, email);
    if (!user) {
      auth.burnPasswordCheck(password);
      return fail("That email and password don't match.");
    }
    if (!auth.verifyPassword(password, user.password_hash)) return fail("That email and password don't match.");
    await store.deleteExpiredSessions(db);
    const s = await auth.createSession(db, user.id);
    redirect(res, '/app', { 'Set-Cookie': sessionCookie(s.raw, s.maxAge) });
  }, { csrf: true });

  on('POST', /^\/logout$/, async ({ req, res }) => {
    await auth.endSession(db, parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    redirect(res, '/', { 'Set-Cookie': sessionCookie('', 0) });
  }, { csrf: true });

  // The app

  on('GET', /^\/app$/, async ({ res, user, url }) => {
    sendHtml(res, 200, views.overviewPage({ user, surveys: await store.surveysWithStats(db, user.id), flash: flashFrom(url) }), NOINDEX);
  }, { auth: true });

  on('POST', /^\/app\/surveys$/, async ({ req, res, user }) => {
    const form = await readForm(req);
    const name = clip(form.name, 80) || 'Customer NPS';
    const brandName = clip(form.brand, 60);
    const id = await store.createSurvey(db, user.id, { name, brand: brandName });
    redirect(res, `/app/surveys/${id}/share?m=created`);
  }, { auth: true, csrf: true });

  on('GET', /^\/app\/surveys\/(\d+)$/, async ({ req, res, user, url, params }) => {
    const survey = await ownedSurvey(user, params[0]);
    const q = url.searchParams;
    const range = ['30', '90', '365', 'all'].includes(q.get('range')) ? q.get('range') : '90';
    const filters = {
      range,
      group: GROUPS.includes(q.get('group')) ? q.get('group') : '',
      source: store.SOURCES.includes(q.get('source')) ? q.get('source') : '',
      withComment: q.get('comments') === '1',
    };
    const pg = Math.max(1, Math.min(10000, Number.parseInt(q.get('page') || '1', 10) || 1));
    const nowMs = Date.now();
    const start = store.rangeStart(range, nowMs);
    const prevStart = start ? new Date(2 * Date.parse(start) - nowMs).toISOString() : null;
    const now = new Date(nowMs);
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString();
    const data = await store.resultsData(db, survey.id, {
      start, prevStart, yearStart, ...filters, limit: PER_PAGE, offset: (pg - 1) * PER_PAGE,
    });
    const stats = summarize(data.inRange.map((r) => r.score));
    const counts = Array(11).fill(0);
    for (const r of data.inRange) counts[r.score]++;
    sendHtml(res, 200, views.resultsPage({
      user, survey, base: base(req), stats, prev: data.prev, trend: monthlyTrend(data.year, 12, now), counts,
      list: data.list, filters, page: pg, perPage: PER_PAGE, flash: flashFrom(url),
    }), NOINDEX);
  }, { auth: true });

  on('GET', /^\/app\/surveys\/(\d+)\/share$/, async ({ req, res, user, params, url }) => {
    const survey = await ownedSurvey(user, params[0]);
    sendHtml(res, 200, views.sharePage({ user, survey, base: base(req), flash: flashFrom(url) }), NOINDEX);
  }, { auth: true });

  on('GET', /^\/app\/surveys\/(\d+)\/import$/, async ({ req, res, user, params, url }) => {
    const survey = await ownedSurvey(user, params[0]);
    sendHtml(res, 200, views.importPage({ user, survey, base: base(req), imports: await store.listImports(db, survey.id), flash: flashFrom(url) }), NOINDEX);
  }, { auth: true });

  // Import from a form post: used when JavaScript is off. The page's script uses the JSON routes below.
  on('POST', /^\/app\/surveys\/(\d+)\/import$/, async ({ req, res, user, params }) => {
    const survey = await ownedSurvey(user, params[0]);
    const fail = async (error) => sendHtml(res, 422, views.importPage({ user, survey, base: base(req), imports: await store.listImports(db, survey.id), error }), NOINDEX);
    let form;
    try {
      form = await readForm(req, IMPORT_FORM_LIMIT);
    } catch (err) {
      if (err.status === 413) return fail('That file is larger than 8 MB. Split it into smaller files and import them one at a time.');
      throw err;
    }
    const csv = String(form.csv || '');
    if (!csv.trim()) return fail('Choose a CSV file, or paste its contents.');
    const result = mapImport(csv);
    if (result.error) return fail(result.error);
    if (!result.rows.length) return fail('No rows had a score from 0 to 10, so nothing was imported.');
    // Line endings are normalised so the same file hashes the same whichever way it was sent.
    const fileHash = auth.sha256(csv.replace(/\r\n?/g, '\n'));
    const dup = await store.importByHash(db, survey.id, fileHash);
    if (dup) return fail(`This file was already imported on ${fmtDate(dup.created_at)}.`);
    const id = await store.importResponses(db, survey.id, { rows: result.rows, fileHash, fileName: clip(form.file_name, 120) });
    if (!id) return fail('This file was already imported.');
    redirect(res, `/app/surveys/${survey.id}?range=all&m=imported&n=${result.rows.length}&s=${result.skipped}`);
  }, { auth: true, csrf: true });

  on('POST', /^\/app\/surveys\/(\d+)\/imports$/, async ({ req, res, user, params }) => {
    const survey = await ownedSurvey(user, params[0]);
    const body = await readForm(req, 16 * 1024);
    const fileHash = String(body.fileHash || '');
    const total = Number(body.total);
    if (!/^[0-9a-f]{64}$/.test(fileHash) || !Number.isInteger(total) || total < 1) return sendJson(res, 422, { error: 'That import request is not valid.' });
    const dup = await store.importByHash(db, survey.id, fileHash);
    if (dup) return sendJson(res, 409, { error: `This file was already imported on ${fmtDate(dup.created_at)}.` });
    const id = await store.createImport(db, survey.id, { fileHash, fileName: clip(body.fileName, 120), total });
    if (!id) return sendJson(res, 409, { error: 'This file was already imported.' });
    sendJson(res, 201, { id });
  }, { auth: true, csrf: true });

  on('POST', /^\/app\/surveys\/(\d+)\/imports\/(\d+)\/rows$/, async ({ req, res, user, params }) => {
    const survey = await ownedSurvey(user, params[0]);
    const body = await readForm(req, IMPORT_PART_LIMIT);
    const rows = cleanImportRows(body.rows);
    if (!rows) return sendJson(res, 422, { error: 'Some rows in that part are not valid.' });
    const ok = await store.addImportRows(db, survey.id, Number(params[1]), rows);
    if (!ok) return sendJson(res, 404, { error: 'That import no longer exists.' });
    sendJson(res, 200, { inserted: rows.length });
  }, { auth: true, csrf: true });

  on('POST', /^\/app\/surveys\/(\d+)\/imports\/(\d+)\/undo$/, async ({ res, user, params }) => {
    const survey = await ownedSurvey(user, params[0]);
    await store.undoImport(db, survey.id, Number(params[1]));
    redirect(res, `/app/surveys/${survey.id}/import?m=undone`);
  }, { auth: true, csrf: true });

  on('GET', /^\/app\/surveys\/(\d+)\/settings$/, async ({ req, res, user, params, url }) => {
    const survey = await ownedSurvey(user, params[0]);
    sendHtml(res, 200, views.settingsPage({ user, survey, base: base(req), flash: flashFrom(url) }), NOINDEX);
  }, { auth: true });

  on('POST', /^\/app\/surveys\/(\d+)\/settings$/, async ({ req, res, user, params }) => {
    const survey = await ownedSurvey(user, params[0]);
    const { v, error } = validateSurvey(await readForm(req));
    if (error) return sendHtml(res, 422, views.settingsPage({ user, survey, base: base(req), values: v, error }), NOINDEX);
    await store.updateSurvey(db, survey.id, v);
    redirect(res, `/app/surveys/${survey.id}/settings?m=saved`);
  }, { auth: true, csrf: true });

  on('POST', /^\/app\/surveys\/(\d+)\/slack-test$/, async ({ req, res, user, params }) => {
    const survey = await ownedSurvey(user, params[0]);
    const sample = { score: 9, comment: 'This is a test message from Tenpoint.', email: '' };
    const ok = await postToSlack(survey.slack_webhook, slackMessage(survey, sample, { link: `${base(req)}/app/surveys/${survey.id}` }), { fetchImpl });
    redirect(res, `/app/surveys/${survey.id}/settings?m=${ok ? 'slack-ok' : 'slack-fail'}`);
  }, { auth: true, csrf: true });

  on('POST', /^\/app\/surveys\/(\d+)\/delete$/, async ({ req, res, user, params }) => {
    const survey = await ownedSurvey(user, params[0]);
    const form = await readForm(req);
    if (form.confirm !== 'yes') return redirect(res, `/app/surveys/${survey.id}/settings`);
    await store.deleteSurvey(db, survey.id);
    redirect(res, '/app?m=deleted');
  }, { auth: true, csrf: true });

  // Written in pieces so a big export streams instead of building one large response.
  on('GET', /^\/app\/surveys\/(\d+)\/export\.csv$/, async ({ res, user, params }) => {
    const survey = await ownedSurvey(user, params[0]);
    const rows = await store.allResponses(db, survey.id);
    const slug = survey.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'survey';
    res.writeHead(200, baseHeaders({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-answers.csv"`,
      'Cache-Control': 'no-store',
    }));
    res.write('﻿' + toCsv([['date', 'score', 'group', 'comment', 'email', 'source']]));
    for (let i = 0; i < rows.length; i += 1000) {
      res.write(toCsv(rows.slice(i, i + 1000).map((r) => [r.created_at, r.score, group(r.score), r.comment, r.email, r.source])));
    }
    res.end();
  }, { auth: true });

  on('GET', /^\/app\/account$/, ({ res, user }) => sendHtml(res, 200, views.accountPage({ user }), NOINDEX), { auth: true });

  on('POST', /^\/app\/account\/delete$/, async ({ req, res, user }) => {
    const form = await readForm(req);
    const full = await store.userById(db, user.id);
    if (!auth.verifyPassword(String(form.password || ''), full.password_hash)) {
      return sendHtml(res, 422, views.accountPage({ user, error: "That password isn't right." }), NOINDEX);
    }
    await store.deleteUser(db, user.id);
    redirect(res, '/', { 'Set-Cookie': sessionCookie('', 0) });
  }, { auth: true, csrf: true });

  // Public survey pages

  const publicSurvey = async (pid) => {
    const s = await store.surveyByPublicId(db, pid);
    if (!s) throw new HttpError(404, 'Not found');
    return s;
  };

  on('GET', /^\/s\/([A-Za-z0-9_-]{6,32})$/, async ({ res, url, params }) => {
    const survey = await publicSurvey(params[0]);
    const q = url.searchParams;
    const email = clip(q.get('email'), 254);
    sendHtml(res, 200, surveyPage({
      survey,
      score: parseScore(q.get('score')),
      source: q.get('src') === 'email' ? 'email' : 'link',
      email: auth.validEmail(email) ? email : '',
    }), NOINDEX);
  });

  on('POST', /^\/s\/([A-Za-z0-9_-]{6,32})$/, async ({ req, res, params }) => {
    const survey = await publicSurvey(params[0]);
    const form = await readForm(req, 16 * 1024);
    const score = parseScore(form.score);
    const comment = clip(form.comment, 2000);
    const source = form.src === 'email' ? 'email' : 'link';
    const email = auth.validEmail(clip(form.email, 254)) ? clip(form.email, 254) : '';
    if (form.rid && form.rt) {
      const edited = await store.editResponse(db, survey.id, Number(form.rid), form.rt, { score: score ?? undefined, comment });
      if (edited) {
        await commentAdded(survey, edited, req);
        return redirect(res, `/s/${survey.public_id}/thanks`);
      }
    }
    if (score === null) {
      return sendHtml(res, 422, surveyPage({ survey, score: null, source, email, error: 'Pick a score from 0 to 10.' }), NOINDEX);
    }
    if (!(await allowed('respond', `${clientIp(req, trustProxy)}|${survey.public_id}`))) {
      return sendHtml(res, 429, surveyPage({ survey, score, source, email, error: 'Too many answers from this network. Please try again later.' }), NOINDEX);
    }
    const r = await store.addResponse(db, survey.id, { score, comment, email, source });
    await send(notify(survey, { id: r.id, score, comment, email }, 'new', base(req)));
    redirect(res, `/s/${survey.public_id}/thanks`);
  });

  on('GET', /^\/s\/([A-Za-z0-9_-]{6,32})\/thanks$/, async ({ res, params }) => {
    sendHtml(res, 200, thanksPage({ survey: await publicSurvey(params[0]) }), NOINDEX);
  });

  on('GET', /^\/s\/([A-Za-z0-9_-]{6,32})\/preview$/, async ({ res, params }) => {
    sendHtml(res, 200, widgetPreviewPage({ survey: await publicSurvey(params[0]) }), NOINDEX);
  });

  // JSON API for the widget and for email clicks. Open to any origin, no cookies.

  on('GET', /^\/api\/s\/([A-Za-z0-9_-]{6,32})$/, async ({ res, params }) => {
    const s = await publicSurvey(params[0]);
    sendJson(res, 200, { question: s.question, followUp: s.follow_up, brand: s.brand, color: s.color }, CORS);
  });

  on('POST', /^\/api\/r\/([A-Za-z0-9_-]{6,32})$/, async ({ req, res, params }) => {
    const survey = await publicSurvey(params[0]);
    const body = await readForm(req, 16 * 1024);
    const score = parseScore(body.score);
    if (score === null) return sendJson(res, 422, { error: 'Pick a score from 0 to 10.' }, CORS);
    if (!(await allowed('respond', `${clientIp(req, trustProxy)}|${survey.public_id}`))) return sendJson(res, 429, { error: 'Too many answers. Please try again later.' }, CORS);
    const source = ['widget', 'email', 'link'].includes(body.source) ? body.source : 'link';
    const email = auth.validEmail(clip(body.email, 254)) ? clip(body.email, 254) : '';
    const comment = clip(body.comment, 2000);
    const r = await store.addResponse(db, survey.id, { score, comment, email, source });
    const response = { id: r.id, score, comment, email };
    if (comment) await send(notify(survey, response, 'new', base(req)));
    else await scoreFirst(survey, response, req);
    sendJson(res, 201, { id: r.id, token: r.token }, CORS);
  });

  on('POST', /^\/api\/r\/([A-Za-z0-9_-]{6,32})\/(\d+)$/, async ({ req, res, params }) => {
    const survey = await publicSurvey(params[0]);
    const body = await readForm(req, 16 * 1024);
    const score = body.score === undefined ? undefined : parseScore(body.score);
    if (score === null) return sendJson(res, 422, { error: 'Pick a score from 0 to 10.' }, CORS);
    const edited = await store.editResponse(db, survey.id, Number(params[1]), body.token, {
      score,
      comment: body.comment === undefined ? undefined : clip(body.comment, 2000),
    });
    if (!edited) return sendJson(res, 403, { error: 'This answer can no longer be changed.' }, CORS);
    await commentAdded(survey, edited, req);
    sendJson(res, 200, { ok: true }, CORS);
  });

  // Handler

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const isApi = path.startsWith('/api/');
    try {
      if (req.method === 'OPTIONS' && isApi) {
        res.writeHead(204, baseHeaders(CORS));
        return res.end();
      }
      const method = req.method === 'HEAD' ? 'GET' : req.method;
      for (const route of routes) {
        if (route.method !== method) continue;
        const m = path.match(route.pattern);
        if (!m) continue;
        const ctx = { req, res, url, params: m.slice(1) };
        if (route.csrf && !sameOrigin(req)) throw new HttpError(403, 'Cross-site request blocked.');
        if (route.auth) {
          ctx.user = await currentUser(req);
          if (!ctx.user) {
            const wantsJson = String(req.headers['content-type'] || '').startsWith('application/json');
            return wantsJson ? sendJson(res, 401, { error: 'Please log in again.' }) : redirect(res, '/login');
          }
        }
        return await route.handler(ctx);
      }
      if (method === 'GET') {
        if (path === '/lib/nps.js' || path === '/lib/snippet.js') {
          if (await serveLib(req, res, path.slice(5))) return;
        } else if (path === '/widget.js') {
          if (await serveStatic(req, res, path, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' })) return;
        } else if (await serveStatic(req, res, path)) {
          return;
        }
      }
      throw new HttpError(404, 'Not found');
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) log.error?.(err);
      if (res.headersSent) return res.end();
      if (isApi || String(req.headers['content-type'] || '').startsWith('application/json')) {
        return sendJson(res, status, { error: status === 500 ? 'Something went wrong.' : err.message }, isApi ? CORS : {});
      }
      if (status === 404) return sendHtml(res, 404, views.notFoundPage({ user: await safeUser(req) }), NOINDEX);
      if (status === 500) return sendHtml(res, 500, views.errorPage(), NOINDEX);
      res.writeHead(status, baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
      res.end(err.message);
    }
  };

  async function safeUser(req) {
    try { return await currentUser(req); } catch { return null; }
  }
}
