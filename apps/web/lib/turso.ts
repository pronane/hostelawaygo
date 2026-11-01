import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type Client, type ResultSet, type Row, type Transaction } from "@libsql/client/http";
import { bindParams, toNumber, type Db, type Param, type RunResult, type Statement } from "./sql";

/**
 * The cloud driver: Turso, which is SQLite behind an HTTP API.
 *
 * Two things are different from the file driver and both are handled here:
 *
 *  - Everything is a request. There is no connection to keep, so `exec` uses
 *    one `sequence` call and bulk writes use `batch`, which run atomically
 *    server-side instead of costing one round trip per statement.
 *  - A transaction is a server-side stream, not a pair of BEGIN/COMMIT
 *    statements. The client opens one and hands back an object; statements
 *    issued while that transaction is open have to go through *it*, or they
 *    land outside the transaction on the default connection. AsyncLocalStorage
 *    keeps that routing correct per request even though the driver is shared.
 */
export class TursoDb implements Db {
  readonly driver = "turso" as const;

  private readonly client: Client;
  private readonly inside = new AsyncLocalStorage<Transaction>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(url: string, authToken?: string) {
    this.client = createClient({ url, authToken });
  }

  /** Inside a transaction, statements belong to the transaction's stream. */
  private session(): Client | Transaction {
    return this.inside.getStore() ?? this.client;
  }

  async exec(sql: string): Promise<void> {
    await this.client.executeMultiple(sql);
  }

  /**
   * PRAGMAs are per connection. Turso manages its own storage and gives each
   * request a fresh connection, so journal mode is not ours to set and foreign
   * keys are enforced by the server. Nothing to do, and pretending otherwise
   * would be the kind of silent difference that bites in production only.
   */
  async pragma(_statement: string): Promise<void> {
    void _statement;
  }

  prepare(sql: string): Statement {
    const execute = (params: Param[]) => {
      const { named, array } = bindParams(params);
      return this.session().execute({
        sql,
        args: (named ?? array) as never,
      } as never);
    };

    return {
      run: async (...params: Param[]): Promise<RunResult> => {
        const result = await execute(params);
        return {
          changes: toNumber(result.rowsAffected),
          lastInsertRowid: toNumber(result.lastInsertRowid),
        };
      },
      get: async <T = Record<string, unknown>>(...params: Param[]): Promise<T | undefined> => {
        const result = await execute(params);
        const row = result.rows[0];
        return row ? (rowToObject<T>(result, row) as T) : undefined;
      },
      all: async <T = Record<string, unknown>>(...params: Param[]): Promise<T[]> => {
        const result = await execute(params);
        return result.rows.map((row) => rowToObject<T>(result, row) as T);
      },
    };
  }

  async transaction<R>(fn: () => Promise<R>): Promise<R> {
    if (this.inside.getStore()) return fn();

    const run = async (): Promise<R> => {
      const tx = await this.client.transaction("write");
      try {
        const result = await this.inside.run(tx, fn);
        await tx.commit();
        return result;
      } catch (error) {
        await tx.rollback().catch(() => undefined);
        throw error;
      }
    };

    // One write transaction at a time per process; the queue is what keeps two
    // requests from interleaving their statements into each other's stream.
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async batch(statements: { sql: string; params?: Param | Param[] }[]): Promise<void> {
    if (statements.length === 0) return;

    // Inside a transaction the statements belong to that stream; a separate
    // batch call would open its own and wait on the lock the transaction holds.
    const tx = this.inside.getStore();
    if (tx) {
      for (const { sql, params } of statements) {
        const args = params === undefined ? [] : Array.isArray(params) ? params : [params];
        await tx.execute({ sql, args: args as never } as never);
      }
      return;
    }

    await this.client.batch(
      statements.map(({ sql, params }) => ({
        sql,
        args: (params === undefined ? [] : Array.isArray(params) ? params : [params]) as never,
      })) as never,
      "write"
    );
  }

  close(): void {
    this.client.close();
  }
}

/**
 * libSQL hands back bigints for integers and an array-like row that also carries
 * column names. The app compares ids with `===` against numbers, so bigints are
 * converted here rather than leaking into every comparison.
 */
function rowToObject<T>(result: ResultSet, row: Row): T {
  const object: Record<string, unknown> = {};
  result.columns.forEach((column, index) => {
    const value = row[index];
    object[column] = typeof value === "bigint" ? Number(value) : value;
  });
  return object as T;
}
