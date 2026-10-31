/**
 * SQLite via Node's built-in driver, same approach as `apps/web`: no native
 * modules, no ORM, and a database file you can open with `sqlite3` and read.
 *
 * This tool keeps its own file (`data/outreach.db`). It never opens the
 * product's database — outreach is not allowed to write to the thing it is
 * pitching, and the only thing it borrows is the public URL.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cities (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  -- prospect: we want in. opening: a date exists. live: on the product.
  status TEXT NOT NULL DEFAULT 'prospect',
  lat REAL,
  lng REAL,
  launch_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  name TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT '',
  beds INTEGER NOT NULL DEFAULT 0,
  -- Where the hostel came from, so every row is checkable by a human.
  source TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  -- Which page the address was on, and the words around it.
  evidence_url TEXT NOT NULL DEFAULT '',
  evidence_text TEXT NOT NULL DEFAULT '',
  -- new | enriched | no_email | drafted | approved | sent | replied | skipped | blocked
  status TEXT NOT NULL DEFAULT 'new',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (city, name)
);

-- One letter per website, ever. Two hostels on one domain are one conversation.
CREATE UNIQUE INDEX IF NOT EXISTS prospects_domain_unique
  ON prospects (domain) WHERE domain <> '' AND status NOT IN ('skipped', 'blocked');

CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id INTEGER NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'a',
  created_at TEXT NOT NULL,
  edited_at TEXT
);

CREATE TABLE IF NOT EXISTS sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id INTEGER NOT NULL,
  draft_id INTEGER,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  transport TEXT NOT NULL,
  provider_id TEXT NOT NULL DEFAULT '',
  -- sent | simulated | failed. 'simulated' means the address was reserved
  -- (.example, localhost), so nothing could possibly have left the building.
  status TEXT NOT NULL,
  error TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- Who did what, when. Approval is the row that matters: it names a person.
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);
`;

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

/** Small helpers, because node:sqlite returns null-prototype objects. */
export function one(db, sql, ...params) {
  const row = db.prepare(sql).get(...params);
  return row ? { ...row } : undefined;
}

export function all(db, sql, ...params) {
  return db.prepare(sql).all(...params).map((row) => ({ ...row }));
}

export function run(db, sql, ...params) {
  const result = db.prepare(sql).run(...params);
  return { changes: Number(result.changes), id: Number(result.lastInsertRowid) };
}

export function meta(db, key, fallback = "") {
  return one(db, "SELECT value FROM meta WHERE key = ?", key)?.value ?? fallback;
}

export function setMeta(db, key, value) {
  run(db, "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}

export function audit(db, actor, action, subject = "", detail = "") {
  run(
    db,
    "INSERT INTO audit (at, actor, action, subject, detail) VALUES (?, ?, ?, ?, ?)",
    new Date().toISOString(),
    actor,
    action,
    subject,
    detail
  );
}

/** The cookie/session/unsubscribe signing key: env wins, otherwise generated once. */
export function signingSecret(db, fromEnv) {
  if (fromEnv) return fromEnv;
  const existing = meta(db, "session_secret");
  if (existing) return existing;
  const generated = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  setMeta(db, "session_secret", generated);
  return generated;
}
