import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Db } from "./sqlite";
import { DROP_ALL, SCHEMA, SCHEMA_VERSION } from "./schema";
import { seed } from "./seed";

const DB_PATH = process.env.AWAY_DB_PATH ?? join(process.cwd(), "data", "away.db");

const globalForDb = globalThis as unknown as { __awayDb?: Db };

export function getDb(): Db {
  if (globalForDb.__awayDb) return globalForDb.__awayDb;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Db(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const version = db
    .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
    .get<{ value: string }>()?.value;

  if (version !== SCHEMA_VERSION) {
    // Demo data, not production migrations: rebuild rather than carry old shapes.
    db.exec(DROP_ALL);
    db.exec(SCHEMA);
    seed(db);
  }

  globalForDb.__awayDb = db;
  return db;
}
