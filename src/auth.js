import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1 };
const SESSION_DAYS = 30;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [kind, salt, key] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length, SCRYPT);
  return timingSafeEqual(actual, expected);
}

// A hash of something that always fails, so a login for an unknown email takes as long as a wrong password.
const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'));
export function burnPasswordCheck(password) {
  verifyPassword(password, DUMMY_HASH);
}

export function token(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function createSession(db, userId) {
  const raw = token(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(raw), userId, expires);
  return { raw, maxAge: SESSION_DAYS * 86400 };
}

export function sessionUser(db, raw) {
  if (!raw) return null;
  const row = db.prepare(
    `SELECT u.id, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
  ).get(sha256(raw));
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(raw));
    return null;
  }
  return { id: row.id, email: row.email };
}

export function endSession(db, raw) {
  if (raw) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(raw));
}

export function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
