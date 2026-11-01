import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { bindParams, type Db, type Param, type RunResult, type Statement } from "./sql";

/**
 * The file-backed driver: Node's built-in `node:sqlite`.
 *
 * This is the one that runs in local development, in `next start`, in Docker
 * and on Render with a disk. It is synchronous underneath — Node's API has no
 * async form — so the promises here resolve immediately. They are promises
 * anyway, because call sites must not care which driver they are talking to
 * (see lib/sql.ts).
 */
export class LocalDb implements Db {
  readonly driver = "sqlite" as const;

  private readonly raw: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();
  private readonly inside = new AsyncLocalStorage<true>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(path: string) {
    this.raw = new DatabaseSync(path);
  }

  async exec(sql: string): Promise<void> {
    this.raw.exec(sql);
  }

  async pragma(statement: string): Promise<void> {
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

  prepare(sql: string): Statement {
    return {
      run: async (...params: Param[]): Promise<RunResult> => {
        const { named, array } = bindParams(params);
        const result = this.statement(sql).run(...((named ? [named] : array) as never[]));
        return {
          changes: Number(result.changes),
          lastInsertRowid: Number(result.lastInsertRowid),
        };
      },
      get: async <T = Record<string, unknown>>(...params: Param[]): Promise<T | undefined> => {
        const { named, array } = bindParams(params);
        const row = this.statement(sql).get(...((named ? [named] : array) as never[]));
        return row ? ({ ...row } as T) : undefined;
      },
      all: async <T = Record<string, unknown>>(...params: Param[]): Promise<T[]> => {
        const { named, array } = bindParams(params);
        const rows = this.statement(sql).all(...((named ? [named] : array) as never[]));
        return rows.map((row) => ({ ...row }) as T);
      },
    };
  }

  /**
   * One transaction at a time per process, and a nested call joins the one
   * already running rather than issuing a second BEGIN. AsyncLocalStorage is
   * what makes "nested" mean "the same request" now that callers await.
   */
  async transaction<R>(fn: () => Promise<R>): Promise<R> {
    if (this.inside.getStore()) return fn();

    const run = async (): Promise<R> => {
      this.raw.exec("BEGIN");
      try {
        const result = await this.inside.run(true, fn);
        this.raw.exec("COMMIT");
        return result;
      } catch (error) {
        this.raw.exec("ROLLBACK");
        throw error;
      }
    };

    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async batch(statements: { sql: string; params?: Param | Param[] }[]): Promise<void> {
    await this.transaction(async () => {
      for (const { sql, params } of statements) {
        const list = params === undefined ? [] : Array.isArray(params) ? params : [params];
        await this.prepare(sql).run(...(list as Param[]));
      }
    });
  }

  close(): void {
    this.statements.clear();
    this.raw.close();
  }
}
