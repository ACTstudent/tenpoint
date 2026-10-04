// Every SQL query the app runs lives here. All of it is async so it works with a local file or Turso.
import { token, sha256 } from './auth.js';
import { summarize, summarizeCounts } from './nps.js';

export const SOURCES = ['link', 'email', 'widget', 'import'];
export const DEFAULT_FOLLOW_UP = "What's the main reason for your score?";
const INSERT_CHUNK = 100;

export function defaultQuestion(brand) {
  return `How likely are you to recommend ${brand.trim() || 'us'} to a friend or colleague?`;
}

const now = () => new Date().toISOString();

// Users

export async function createUser(db, email, passwordHash) {
  const r = await db.run('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)', [email, passwordHash, now()]);
  return r.lastInsertRowid;
}

export function userByEmail(db, email) {
  return db.get('SELECT id, email, password_hash FROM users WHERE email = ?', [email]);
}

export function userById(db, id) {
  return db.get('SELECT id, email, password_hash FROM users WHERE id = ?', [id]);
}

// Deletes are spelled out instead of relying on foreign key cascades, which Turso connections don't enforce.
export async function deleteUser(db, id) {
  const mine = 'SELECT id FROM surveys WHERE user_id = ?';
  await db.batch([
    [`DELETE FROM responses WHERE survey_id IN (${mine})`, [id]],
    [`DELETE FROM imports WHERE survey_id IN (${mine})`, [id]],
    ['DELETE FROM surveys WHERE user_id = ?', [id]],
    ['DELETE FROM sessions WHERE user_id = ?', [id]],
    ['DELETE FROM users WHERE id = ?', [id]],
  ]);
}

// Surveys

export async function createSurvey(db, userId, { name, brand, question, followUp, color }) {
  const r = await db.run(
    `INSERT INTO surveys (user_id, public_id, name, question, follow_up, brand, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, token(9), name, question || defaultQuestion(brand), followUp || DEFAULT_FOLLOW_UP, brand, color || '#1d7a50', now()]
  );
  return r.lastInsertRowid;
}

export function surveyForUser(db, userId, id) {
  return db.get(
    `SELECT s.*, (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) AS total_all
     FROM surveys s WHERE s.id = ? AND s.user_id = ?`,
    [id, userId]
  );
}

export function surveyByPublicId(db, publicId) {
  return db.get('SELECT * FROM surveys WHERE public_id = ?', [publicId]);
}

export async function updateSurvey(db, id, f) {
  await db.run(
    'UPDATE surveys SET name = ?, brand = ?, question = ?, follow_up = ?, color = ?, slack_webhook = ? WHERE id = ?',
    [f.name, f.brand, f.question, f.followUp, f.color, f.slackWebhook, id]
  );
}

export async function deleteSurvey(db, id) {
  await db.batch([
    ['DELETE FROM responses WHERE survey_id = ?', [id]],
    ['DELETE FROM imports WHERE survey_id = ?', [id]],
    ['DELETE FROM surveys WHERE id = ?', [id]],
  ]);
}

// Survey cards on the overview: score for the last 90 days plus all-time totals, in one query.
export async function surveysWithStats(db, userId) {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const rows = await db.all(
    `SELECT s.*,
       COUNT(r.id) AS total,
       MAX(r.created_at) AS last,
       COALESCE(SUM(r.created_at >= ? AND r.score >= 9), 0) AS recent_promoter,
       COALESCE(SUM(r.created_at >= ? AND r.score BETWEEN 7 AND 8), 0) AS recent_passive,
       COALESCE(SUM(r.created_at >= ? AND r.score <= 6), 0) AS recent_detractor
     FROM surveys s LEFT JOIN responses r ON r.survey_id = s.id
     WHERE s.user_id = ?
     GROUP BY s.id`,
    [since, since, since, userId]
  );
  return rows
    .map((s) => ({
      ...s,
      recent: summarizeCounts({ promoter: s.recent_promoter, passive: s.recent_passive, detractor: s.recent_detractor }),
    }))
    .sort((a, b) => (b.last || b.created_at).localeCompare(a.last || a.created_at));
}

// Responses

export async function addResponse(db, surveyId, { score, comment = '', email = '', source }) {
  const raw = token(18);
  const r = await db.run(
    `INSERT INTO responses (survey_id, score, comment, email, source, edit_token_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [surveyId, score, comment, email, source, sha256(raw), now()]
  );
  return { id: r.lastInsertRowid, token: raw };
}

// Lets the person who just answered change their score or add a comment, using the token they were given.
export async function editResponse(db, surveyId, id, raw, { score, comment }) {
  if (!raw || !Number.isInteger(id)) return null;
  const row = await db.get('SELECT * FROM responses WHERE id = ? AND survey_id = ?', [id, surveyId]);
  if (!row || !row.edit_token_hash || row.edit_token_hash !== sha256(String(raw))) return null;
  // Answers stay editable for a day, which covers coming back to add a reason.
  if (Date.now() - Date.parse(row.created_at) > 864e5) return null;
  const next = { score: score ?? row.score, comment: comment ?? row.comment };
  await db.run('UPDATE responses SET score = ?, comment = ? WHERE id = ?', [next.score, next.comment, id]);
  return { ...row, ...next, previousComment: row.comment };
}

export function rangeStart(range, from = Date.now()) {
  const days = { 30: 30, 90: 90, 365: 365 }[range];
  return days ? new Date(from - days * 864e5).toISOString() : null;
}

const GROUP_SQL = {
  promoter: 'score >= 9',
  passive: 'score BETWEEN 7 AND 8',
  detractor: 'score <= 6',
};

function scoresQuery(surveyId, start, end) {
  const where = ['survey_id = ?'];
  const args = [surveyId];
  if (start) { where.push('created_at >= ?'); args.push(start); }
  if (end) { where.push('created_at < ?'); args.push(end); }
  return [`SELECT score, created_at FROM responses WHERE ${where.join(' AND ')}`, args];
}

// Everything the results page needs, fetched in a single round trip.
export async function resultsData(db, surveyId, { start, prevStart, yearStart, group, source, withComment, limit, offset }) {
  const where = ['survey_id = ?'];
  const args = [surveyId];
  if (start) { where.push('created_at >= ?'); args.push(start); }
  if (GROUP_SQL[group]) where.push(GROUP_SQL[group]);
  if (SOURCES.includes(source)) { where.push('source = ?'); args.push(source); }
  if (withComment) where.push("comment <> ''");
  const clause = where.join(' AND ');
  const queries = [
    scoresQuery(surveyId, start, null),
    scoresQuery(surveyId, yearStart, null),
    [`SELECT COUNT(*) AS n FROM responses WHERE ${clause}`, args],
    [`SELECT id, score, comment, email, source, created_at FROM responses WHERE ${clause}
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...args, limit, offset]],
  ];
  if (start) queries.push(scoresQuery(surveyId, prevStart, start));
  const [inRange, year, count, rows, prev] = await db.batch(queries, 'read');
  return {
    inRange: inRange.rows,
    year: year.rows,
    list: { total: count.rows[0].n, rows: rows.rows },
    prev: prev ? summarize(prev.rows.map((r) => r.score)) : null,
  };
}

export function allResponses(db, surveyId) {
  return db.all(
    'SELECT id, score, comment, email, source, created_at FROM responses WHERE survey_id = ? ORDER BY created_at ASC, id ASC',
    [surveyId]
  );
}

// Imports

function insertRowsStatements(surveyId, importId, rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    out.push([
      `INSERT INTO responses (survey_id, score, comment, email, source, import_id, created_at) VALUES ${chunk.map(() => "(?, ?, ?, ?, 'import', ?, ?)").join(', ')}`,
      chunk.flatMap((r) => [surveyId, r.score, r.comment, r.email, importId, r.created_at]),
    ]);
  }
  return out;
}

// Starts an import. Returns null when this exact file was already imported into the survey.
export async function createImport(db, surveyId, { fileHash, fileName, total }) {
  const r = await db.run(
    `INSERT INTO imports (survey_id, file_hash, file_name, row_count, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (survey_id, file_hash) DO NOTHING`,
    [surveyId, fileHash, fileName, total, now()]
  );
  return r.changes ? r.lastInsertRowid : null;
}

export async function addImportRows(db, surveyId, importId, rows) {
  const imp = await db.get('SELECT id FROM imports WHERE id = ? AND survey_id = ?', [importId, surveyId]);
  if (!imp) return false;
  if (rows.length) await db.batch(insertRowsStatements(surveyId, importId, rows));
  return true;
}

// The whole import in one transaction, for the form that works without JavaScript.
export async function importResponses(db, surveyId, { rows, fileHash, fileName }) {
  const importId = await createImport(db, surveyId, { fileHash, fileName, total: rows.length });
  if (!importId) return null;
  try {
    await addImportRows(db, surveyId, importId, rows);
  } catch (err) {
    await undoImport(db, surveyId, importId);
    throw err;
  }
  return importId;
}

export function importByHash(db, surveyId, fileHash) {
  return db.get('SELECT * FROM imports WHERE survey_id = ? AND file_hash = ?', [surveyId, fileHash]);
}

export function listImports(db, surveyId) {
  return db.all(
    `SELECT i.*, COUNT(r.id) AS imported, MIN(r.created_at) AS first_at, MAX(r.created_at) AS last_at
     FROM imports i LEFT JOIN responses r ON r.import_id = i.id
     WHERE i.survey_id = ? GROUP BY i.id ORDER BY i.created_at DESC`,
    [surveyId]
  );
}

export async function undoImport(db, surveyId, importId) {
  const [, removed] = await db.batch([
    ['DELETE FROM responses WHERE import_id = ? AND survey_id = ?', [importId, surveyId]],
    ['DELETE FROM imports WHERE id = ? AND survey_id = ?', [importId, surveyId]],
  ]);
  return removed.changes > 0;
}

// Rate limits live in the database so they hold across serverless instances.
export async function hitRateLimit(db, key, { limit, windowMs }) {
  const t = Date.now();
  const row = await db.get(
    `INSERT INTO rate_limits (key, window_start, hits) VALUES (?1, ?2, 1)
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN rate_limits.window_start < ?3 THEN 1 ELSE rate_limits.hits + 1 END,
       window_start = CASE WHEN rate_limits.window_start < ?3 THEN ?2 ELSE rate_limits.window_start END
     RETURNING hits`,
    [sha256(key), t, t - windowMs]
  );
  // Now and then, clear out windows that ended long ago.
  if (Math.random() < 0.01) await db.run('DELETE FROM rate_limits WHERE window_start < ?', [t - 864e5]);
  return row.hits <= limit;
}

export async function deleteExpiredSessions(db) {
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [now()]);
}
