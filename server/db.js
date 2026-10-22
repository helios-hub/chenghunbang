import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      pwd_hash TEXT NOT NULL,
      nick TEXT NOT NULL,
      member_until INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions(
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS favorites(
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('shop','rank')),
      ref_id TEXT NOT NULL,
      PRIMARY KEY(user_id, kind, ref_id)
    );
    CREATE TABLE IF NOT EXISTS orders(
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      plan_id TEXT NOT NULL,
      days INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','paid')),
      created_at INTEGER NOT NULL,
      paid_at INTEGER
    );
  `);
  return db;
}
