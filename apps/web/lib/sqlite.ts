import { DatabaseSync, type StatementSync } from "node:sqlite";

/**
 * A very small compatibility layer over Node's built-in `node:sqlite`.
 *
 * The app only needs a handful of things — exec, prepare, named/positional
 * binding, and a transaction helper — so wrapping it here keeps `node:sqlite`
 * (and its experimental status) contained to one file instead of leaking
 * through the query layer.
 */

type Param = Record<string, unknown> | number | string | bigint | null | Uint8Array;

export type RunResult = { changes: number; lastInsertRowid: number };

const normalise = (value: unknown): unknown => {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
};

const isNamedBundle = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Uint8Array);

/**
 * Both binding styles are supported, because the call sites use both:
 *   stmt.get({ id, me })   -> named bindings  (@id / :id in the SQL)
 *   stmt.run(1, "hello")   -> positional (?) bindings
 */
function toArgs(params: unknown[]): unknown[] {
  if (params.length === 0) return [];

  if (params.length === 1 && isNamedBundle(params[0])) {
    const named: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params[0])) {
      named[key.replace(/^[@:$]/, "")] = normalise(value);
    }
    return [named];
  }

  return params.map(normalise);
}

export class Db {
  private readonly raw: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();
  private depth = 0;

  constructor(path: string) {
    this.raw = new DatabaseSync(path);
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  pragma(statement: string): void {
    this.raw.exec(`PRAGMA ${statement}`);
  }

  private statement(sql: string): StatementSync {
    let cached = this.statements.get(sql);
    if (!cached) {
      cached = this.raw.prepare(sql);
      this.statements.set(sql, cached);
    }
    return cached;
  }

  prepare(sql: string) {
    const statement = this.statement(sql);
    return {
      run: (...params: Param[]): RunResult => {
        const result = statement.run(...(toArgs(params) as never[]));
        return {
          changes: Number(result.changes),
          lastInsertRowid: Number(result.lastInsertRowid),
        };
      },
      get: <T = Record<string, unknown>>(...params: Param[]): T | undefined => {
        const row = statement.get(...(toArgs(params) as never[]));
        return row ? ({ ...row } as T) : undefined;
      },
      all: <T = Record<string, unknown>>(...params: Param[]): T[] => {
        const rows = statement.all(...(toArgs(params) as never[]));
        return rows.map((row) => ({ ...row }) as T);
      },
    };
  }

  /**
   * Re-entrant: calling a transactional helper from inside another transaction
   * joins the outer one instead of issuing a nested BEGIN (SQLite forbids that).
   * The outermost call owns the commit or rollback.
   */
  transaction<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
    return (...args: Args): R => {
      if (this.depth > 0) return fn(...args);

      this.depth += 1;
      this.raw.exec("BEGIN");
      try {
        const result = fn(...args);
        this.raw.exec("COMMIT");
        return result;
      } catch (error) {
        this.raw.exec("ROLLBACK");
        throw error;
      } finally {
        this.depth -= 1;
      }
    };
  }

  close(): void {
    this.statements.clear();
    this.raw.close();
  }
}
