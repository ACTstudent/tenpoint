// Every SQL query the app runs lives here.
import { tx } from './db.js';
import { token, sha256 } from './auth.js';
import { summarize } from './nps.js';

export const SOURCES = ['link', 'email', 'widget', 'import'];
export const DEFAULT_FOLLOW_UP = "What's the main reason for your score?";

export function defaultQuestion(brand) {
  return `How likely are you to recommend ${brand.trim() || 'us'} to a friend or colleague?`;
}

const now = () => new Date().toISOString();

// Users

export function createUser(db, email, passwordHash) {
  const r = db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(email, passwordHash, now());
  return Number(r.lastInsertRowid);
}

export function userByEmail(db, email) {
  return db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email);
}

export function userById(db, id) {
  return db.prepare('SELECT id, email, password_hash FROM users WHERE id = ?').get(id);
}

export function deleteUser(db, id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

// Surveys

export function createSurvey(db, userId, { name, brand, question, followUp, color }) {
  const publicId = token(9);
  const r = db.prepare(
    `INSERT INTO surveys (user_id, public_id, name, question, follow_up, brand, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, publicId, name, question || defaultQuestion(brand), followUp || DEFAULT_FOLLOW_UP, brand, color || '#1d7a50', now());
  return Number(r.lastInsertRowid);
}

export function surveyForUser(db, userId, id) {
  return db.prepare('SELECT * FROM surveys WHERE id = ? AND user_id = ?').get(id, userId);
}

export function surveyByPublicId(db, publicId) {
  return db.prepare('SELECT * FROM surveys WHERE public_id = ?').get(publicId);
}

export function updateSurvey(db, id, fields) {
  db.prepare(
    `UPDATE surveys SET name = ?, brand = ?, question = ?, follow_up = ?, color = ?, slack_webhook = ? WHERE id = ?`
  ).run(fields.name, fields.brand, fields.question, fields.followUp, fields.color, fields.slackWebhook, id);
}

export function deleteSurvey(db, id) {
  db.prepare('DELETE FROM surveys WHERE id = ?').run(id);
}

// Survey cards on the overview: score for the last 90 days plus all-time totals.
export function surveysWithStats(db, userId) {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const surveys = db.prepare('SELECT * FROM surveys WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  const scoresStmt = db.prepare('SELECT score FROM responses WHERE survey_id = ? AND created_at >= ?');
  const totalsStmt = db.prepare('SELECT COUNT(*) AS n, MAX(created_at) AS last FROM responses WHERE survey_id = ?');
  return surveys.map((s) => {
    const recent = summarize(scoresStmt.all(s.id, since).map((r) => r.score));
    const totals = totalsStmt.get(s.id);
    return { ...s, recent, total: totals.n, last: totals.last };
  }).sort((a, b) => (b.last || b.created_at).localeCompare(a.last || a.created_at));
}

// Responses

export function addResponse(db, surveyId, { score, comment = '', email = '', source }) {
  const raw = token(18);
  const r = db.prepare(
    `INSERT INTO responses (survey_id, score, comment, email, source, edit_token_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(surveyId, score, comment, email, source, sha256(raw), now());
  return { id: Number(r.lastInsertRowid), token: raw };
}

// Lets the person who just answered change their score or add a comment, using the token they were given.
export function editResponse(db, surveyId, id, raw, { score, comment }) {
  const row = db.prepare('SELECT * FROM responses WHERE id = ? AND survey_id = ?').get(id, surveyId);
  if (!row || !row.edit_token_hash || !raw || row.edit_token_hash !== sha256(String(raw))) return null;
  // Answers stay editable for a day, which covers coming back to add a reason.
  if (Date.now() - Date.parse(row.created_at) > 864e5) return null;
  const next = { score: score ?? row.score, comment: comment ?? row.comment };
  db.prepare('UPDATE responses SET score = ?, comment = ? WHERE id = ?').run(next.score, next.comment, id);
  return { ...row, ...next, previousComment: row.comment };
}

export function rangeStart(range, from = Date.now()) {
  const days = { 30: 30, 90: 90, 365: 365 }[range];
  return days ? new Date(from - days * 864e5).toISOString() : null;
}

export function scoresBetween(db, surveyId, start, end) {
  const where = ['survey_id = ?'];
  const args = [surveyId];
  if (start) { where.push('created_at >= ?'); args.push(start); }
  if (end) { where.push('created_at < ?'); args.push(end); }
  return db.prepare(`SELECT score, created_at FROM responses WHERE ${where.join(' AND ')}`).all(...args);
}

const GROUP_SQL = {
  promoter: 'score >= 9',
  passive: 'score BETWEEN 7 AND 8',
  detractor: 'score <= 6',
};

export function listResponses(db, surveyId, { start, group, source, withComment, limit = 25, offset = 0 } = {}) {
  const where = ['survey_id = ?'];
  const args = [surveyId];
  if (start) { where.push('created_at >= ?'); args.push(start); }
  if (GROUP_SQL[group]) where.push(GROUP_SQL[group]);
  if (SOURCES.includes(source)) { where.push('source = ?'); args.push(source); }
  if (withComment) where.push("comment <> ''");
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM responses WHERE ${clause}`).get(...args).n;
  const rows = db.prepare(
    `SELECT id, score, comment, email, source, created_at FROM responses WHERE ${clause}
     ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);
  return { total, rows };
}

export function allResponses(db, surveyId) {
  return db.prepare(
    'SELECT id, score, comment, email, source, created_at FROM responses WHERE survey_id = ? ORDER BY created_at ASC, id ASC'
  ).all(surveyId);
}

// Imports

export function importResponses(db, surveyId, { rows, fileHash, fileName }) {
  return tx(db, () => {
    const imp = db.prepare(
      'INSERT INTO imports (survey_id, file_hash, file_name, row_count, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(surveyId, fileHash, fileName, rows.length, now());
    const importId = Number(imp.lastInsertRowid);
    const ins = db.prepare(
      `INSERT INTO responses (survey_id, score, comment, email, source, import_id, created_at)
       VALUES (?, ?, ?, ?, 'import', ?, ?)`
    );
    for (const r of rows) ins.run(surveyId, r.score, r.comment, r.email, importId, r.created_at);
    return importId;
  });
}

export function importByHash(db, surveyId, fileHash) {
  return db.prepare('SELECT * FROM imports WHERE survey_id = ? AND file_hash = ?').get(surveyId, fileHash);
}

export function listImports(db, surveyId) {
  return db.prepare(
    `SELECT i.*, MIN(r.created_at) AS first_at, MAX(r.created_at) AS last_at
     FROM imports i LEFT JOIN responses r ON r.import_id = i.id
     WHERE i.survey_id = ? GROUP BY i.id ORDER BY i.created_at DESC`
  ).all(surveyId);
}

export function undoImport(db, surveyId, importId) {
  return tx(db, () => {
    const imp = db.prepare('SELECT id FROM imports WHERE id = ? AND survey_id = ?').get(importId, surveyId);
    if (!imp) return false;
    db.prepare('DELETE FROM responses WHERE import_id = ?').run(importId);
    db.prepare('DELETE FROM imports WHERE id = ?').run(importId);
    return true;
  });
}
