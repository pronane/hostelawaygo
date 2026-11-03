import { DROP_ALL, MIGRATIONS, SCHEMA, SCHEMA_VERSION } from "./schema";
import { seed } from "./seed";
import type { Db, Param, Statement } from "./sql";
import { LocalDb } from "./sqlite";
import { storage } from "./storage";
import { TursoDb } from "./turso";

/**
 * The one place that decides which driver to use, opens it, and makes sure the
 * schema is there before anyone queries it.
 *
 * Opening is asynchronous — Turso is a network round trip per statement, and
 * even a file has to be created, migrated and seeded. `getDb()` stays
 * synchronous anyway: it hands back an object whose methods wait for the open.
 * That keeps the query layer readable (`const db = getDb()`) and means the
 * migration runs once per process rather than once per caller.
 */

/** The tables this app owns — read out of the schema so the list cannot drift. */
const OUR_TABLES = [...SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((match) => match[1]);

/** Tables in the database that this app has never created. */
async function foreignTables(db: Db): Promise<string[]> {
  try {
    const rows = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all<{ name: string }>();
    return rows.map((row) => row.name).filter((name) => !OUR_TABLES.includes(name));
  } catch {
    return [];
  }
}

/**
 * Applies the migration steps between `from` and the current version.
 *
 * Returns false when this code has no path from that version (an old demo
 * database, a rollback) — the caller rebuilds. Duplicate-column errors are the
 * expected shape of "fresh install already has it", so they are not failures.
 */
async function migrate(db: Db, from: string): Promise<boolean> {
  const steps = MIGRATIONS.filter((step) => Number(step.to) > Number(from) && Number(step.to) <= Number(SCHEMA_VERSION));
  if (steps.length === 0) return false;

  for (const step of steps) {
    for (const statement of step.statements) {
      try {
        await db.exec(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/duplicate column name/i.test(message)) continue;
        console.warn(`[db] migration to ${step.to} failed (${step.hint}): ${message} — rebuilding`);
        return false;
      }
    }
    console.log(`[db] migrated to schema ${step.to} (${step.hint})`);
  }

  await db
    .prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(SCHEMA_VERSION);
  return true;
}

async function open(): Promise<Db> {
  const db: Db =
    storage.kind === "turso" ? new TursoDb(storage.path, storage.token) : new LocalDb(storage.path);

  if (db.driver === "sqlite") {
    await db.pragma("journal_mode = WAL");
    await db.pragma("foreign_keys = ON");
  }

  await db.exec(SCHEMA);

  const version = (
    await db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get<{ value: string }>()
  )?.value;

  if (version === undefined) {
    // Nothing has ever been seeded here.
    await seed(db);
  } else if (version !== SCHEMA_VERSION) {
    // Before dropping anything: are we even in the database we think we are?
    // Pointing TURSO_DATABASE_URL at another app's database is an easy mistake
    // and a silent one — this app would happily add its tables next to theirs.
    const strangers = await foreignTables(db);
    if (strangers.length > 0) {
      console.warn(
        `[db] this database already has tables this app did not create: ${strangers
          .slice(0, 6)
          .join(", ")}${strangers.length > 6 ? ", …" : ""}. ` +
          `Check TURSO_DATABASE_URL — you may be pointing at another app's database. ` +
          `Away's own tables are created alongside; nothing of theirs is dropped.`
      );
    }

    // Walk the database forward if we know how. A rebuild throws away real
    // hostels, applications and stays; it is the fallback, not the default.
    const upgraded = await migrate(db, version);
    if (!upgraded) {
      // seed() writes the version row last, so a seed that dies halfway is
      // rebuilt on the next start instead of being mistaken for a finished one.
      await db.exec(DROP_ALL);
      await db.exec(SCHEMA);
      await seed(db);
    }
  }

  return db;
}

/** A `Db` that opens on first use and is the same object every time after. */
class LazyDb implements Db {
  readonly driver: "sqlite" | "turso";
  private opening?: Promise<Db>;

  constructor(driver: "sqlite" | "turso") {
    this.driver = driver;
  }

  private open(): Promise<Db> {
    return (this.opening ??= open());
  }

  exec(sql: string): Promise<void> {
    return this.open().then((db) => db.exec(sql));
  }

  pragma(statement: string): Promise<void> {
    return this.open().then((db) => db.pragma(statement));
  }

  prepare(sql: string): Statement {
    /** One statement handle, bound late — the open happens once, not per call. */
    const on = (): Promise<Db> => this.open();
    return {
      run: (...params: Param[]) => on().then((db) => db.prepare(sql).run(...params)),
      get: <T = Record<string, unknown>>(...params: Param[]) =>
        on().then((db) => db.prepare(sql).get<T>(...params)),
      all: <T = Record<string, unknown>>(...params: Param[]) =>
        on().then((db) => db.prepare(sql).all<T>(...params)),
    };
  }

  transaction<R>(fn: () => Promise<R>): Promise<R> {
    return this.open().then((db) => db.transaction(fn));
  }

  batch(statements: { sql: string; params?: Param | Param[] }[]): Promise<void> {
    return this.open().then((db) => db.batch(statements));
  }
}

const globalForDb = globalThis as unknown as { __awayDb?: LazyDb };

export function getDb(): Db {
  if (!globalForDb.__awayDb) {
    globalForDb.__awayDb = new LazyDb(storage.kind === "turso" ? "turso" : "sqlite");
  }
  return globalForDb.__awayDb;
}

/**
 * What /api/health reports: which database, where, and whether it survives.
 * `path` is a URL for Turso, so no token or password is ever echoed back.
 */
export const dbInfo = {
  driver: storage.kind === "turso" ? ("turso" as const) : ("sqlite" as const),
  target: storage.kind === "turso" ? storage.path.replace(/\/\/[^@]*@/, "//") : storage.path,
  ephemeral: storage.ephemeral,
  reason: storage.reason,
};
