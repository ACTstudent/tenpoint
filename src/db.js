import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  follow_up TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#1f3d2b',
  slack_webhook TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  edit_token_hash TEXT,
  import_id INTEGER REFERENCES imports(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  file_hash TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  row_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (survey_id, file_hash)
);
CREATE INDEX IF NOT EXISTS responses_survey_created ON responses(survey_id, created_at);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS responses_import ON responses(import_id);
`;

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

// Runs fn inside a transaction, rolling back if it throws.
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
