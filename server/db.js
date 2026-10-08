import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = [
  // v1
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     role TEXT NOT NULL CHECK (role IN ('student','teacher','parent','admin')),
     email TEXT UNIQUE COLLATE NOCASE,
     username TEXT UNIQUE COLLATE NOCASE,
     display_name TEXT NOT NULL,
     pw_hash TEXT NOT NULL,
     birth_year INTEGER,
     grade INTEGER,
     managed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     effort INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at INTEGER NOT NULL
   );
   CREATE TABLE guardians (
     parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     child_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     PRIMARY KEY (parent_id, child_id)
   );
   CREATE TABLE classes (
     id INTEGER PRIMARY KEY,
     teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     grade INTEGER NOT NULL,
     join_code TEXT NOT NULL UNIQUE,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE enrollments (
     class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
     student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     PRIMARY KEY (class_id, student_id)
   );
   CREATE TABLE assignments (
     id INTEGER PRIMARY KEY,
     class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
     skill_id TEXT NOT NULL,
     due_date TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE mastery (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     skill_id TEXT NOT NULL,
     p REAL NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     correct INTEGER NOT NULL DEFAULT 0,
     sets_with_correct INTEGER NOT NULL DEFAULT 0,
     last_correct_set TEXT,
     level INTEGER NOT NULL DEFAULT 0,
     proficient_at INTEGER,
     mastered_at INTEGER,
     needs_review INTEGER NOT NULL DEFAULT 0,
     last_practiced INTEGER,
     PRIMARY KEY (user_id, skill_id)
   );
   CREATE TABLE items (
     id TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     skill_id TEXT NOT NULL,
     set_id TEXT NOT NULL,
     mode TEXT NOT NULL,
     data TEXT NOT NULL,
     hints_used INTEGER NOT NULL DEFAULT 0,
     tries INTEGER NOT NULL DEFAULT 0,
     done INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX items_user ON items(user_id, created_at);
   CREATE TABLE attempts (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     skill_id TEXT NOT NULL,
     correct INTEGER NOT NULL,
     hinted INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX attempts_user ON attempts(user_id, created_at);
   CREATE TABLE certificates (
     id TEXT PRIMARY KEY,
     user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     title TEXT NOT NULL,
     issued_at INTEGER NOT NULL
   );
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = version; v < SCHEMA.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(SCHEMA[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const DEFAULT_SETTINGS = {
  review_delay_days: 3,
  open_signup: true,
};

export function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : DEFAULT_SETTINGS[key];
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}
