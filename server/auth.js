import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
export const SESSION_MS = 30 * 86400000;
const sha = (t) => createHash('sha256').update(t).digest('hex');

export async function hashPassword(pwd) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pwd, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(pwd, stored) {
  const [s, k] = stored.split(':');
  const key = await scryptAsync(pwd, Buffer.from(s, 'hex'), 64);
  const expected = Buffer.from(k, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function createSession(db, userId) {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES(?,?,?)')
    .run(sha(token), userId, now + SESSION_MS);
  return token;
}

export function userFromToken(db, token) {
  if (!token) return null;
  return db.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'
  ).get(sha(token), Date.now()) ?? null;
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

export function readCookie(header, name) {
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function makeLimiter() {
  const hits = new Map();
  return (key, max, windowMs) => {
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.reset <= now) {
      e = { n: 0, reset: now + windowMs };
      hits.set(key, e);
    }
    e.n++;
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    return e.n <= max;
  };
}
