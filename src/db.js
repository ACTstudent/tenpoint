// One small async database interface over libSQL.
// Locally it is a SQLite file (or memory, for tests). On Vercel it is a Turso database over HTTPS.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS surveys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    question TEXT NOT NULL,
    follow_up TEXT NOT NULL,
    brand TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#1d7a50',
    slack_webhook TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    file_hash TEXT NOT NULL,
    file_name TEXT NOT NULL DEFAULT '',
    row_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (survey_id, file_hash)
  )`,
  `CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
    comment TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL,
    edit_token_hash TEXT,
    import_id INTEGER REFERENCES imports(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    hits INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS responses_survey_created ON responses(survey_id, created_at)',
  'CREATE INDEX IF NOT EXISTS responses_import ON responses(import_id)',
  'CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS surveys_user ON surveys(user_id)',
];

const isLocal = (url) => url === ':memory:' || url.startsWith('file:');

// Rows come back as plain objects keyed by column name.
function objects(rs) {
  return rs.rows.map((row) => Object.fromEntries(rs.columns.map((c, i) => [c, row[i]])));
}

function stmt(sql, args = []) {
  return { sql, args: args.map((a) => (a === undefined ? null : a)) };
}

export class Db {
  constructor(client, { local }) {
    this.client = client;
    this.local = local;
  }

  async all(sql, args) {
    return objects(await this.client.execute(stmt(sql, args)));
  }

  async get(sql, args) {
    return (await this.all(sql, args))[0];
  }

  async run(sql, args) {
    const rs = await this.client.execute(stmt(sql, args));
    return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid === undefined ? undefined : Number(rs.lastInsertRowid) };
  }

  // Runs several statements in one round trip. "write" runs them in a transaction.
  async batch(statements, mode = 'write') {
    const results = await this.client.batch(statements.map(([sql, args]) => stmt(sql, args)), mode);
    return results.map((rs) => ({ rows: objects(rs), changes: rs.rowsAffected }));
  }

  close() {
    this.client.close();
  }
}

export function databaseUrlFromEnv(env = process.env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.TURSO_DATABASE_URL) return env.TURSO_DATABASE_URL;
  if (env.DATABASE_PATH) return `file:${env.DATABASE_PATH}`;
  return '';
}

export function databaseTokenFromEnv(env = process.env) {
  return env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || undefined;
}

export async function openDb(url = 'file:data/tenpoint.db', authToken) {
  const local = isLocal(url);
  let client;
  if (local) {
    if (url.startsWith('file:')) {
      const path = url.replace(/^file:(\/\/)?/, '');
      if (dirname(path) !== '.') mkdirSync(dirname(path), { recursive: true });
    }
    const { createClient } = await import('@libsql/client');
    // One connection keeps SQLite writes in order and the pragmas below in effect.
    client = createClient({ url, concurrency: 1 });
    if (url !== ':memory:') await client.execute('PRAGMA journal_mode = WAL');
    await client.execute('PRAGMA busy_timeout = 5000');
  } else {
    // The web build talks HTTPS only and loads no native code, which suits serverless hosts.
    const { createClient } = await import('@libsql/client/web');
    client = createClient({ url, authToken });
  }
  await client.batch(SCHEMA.map((sql) => stmt(sql)), 'write');
  return new Db(client, { local });
}
