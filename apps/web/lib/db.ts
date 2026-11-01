import { DROP_ALL, SCHEMA, SCHEMA_VERSION } from "./schema";
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

  if (version !== SCHEMA_VERSION) {
    // Demo data, not production migrations: rebuild rather than carry old shapes.
    // seed() writes the version row last, so a seed that dies halfway is rebuilt
    // on the next start instead of being mistaken for a finished one.
    await db.exec(DROP_ALL);
    await db.exec(SCHEMA);
    await seed(db);
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
