/**
 * The database interface the app codes against — and the reason every query is
 * `await`ed, even the ones that are not talking to a network.
 *
 * There are two implementations:
 *
 *   LocalDb  (lib/sqlite.ts)  Node's built-in `node:sqlite`, a file on disk.
 *                             Synchronous underneath; wrapped so the call shape
 *                             matches the other driver exactly.
 *   TursoDb  (lib/turso.ts)   Turso, which speaks SQLite over HTTP. Inherently
 *                             asynchronous, and the reason this interface is
 *                             promise-shaped rather than value-shaped.
 *
 * Keeping one async shape for both means `next build`, the query layer and the
 * tests exercise the same code whichever database a deployment is using. It
 * also means a missed `await` is a type error instead of a page that renders
 * "[object Promise]".
 */

export type Param = Record<string, unknown> | number | string | bigint | boolean | null | Uint8Array;

export type RunResult = { changes: number; lastInsertRowid: number };

export type Statement = {
  run(...params: Param[]): Promise<RunResult>;
  get<T = Record<string, unknown>>(...params: Param[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(...params: Param[]): Promise<T[]>;
};

export type Db = {
  /** Which implementation is answering, for /api/health and the logs. */
  readonly driver: "sqlite" | "turso";
  /** Multi-statement SQL (the schema, DROP_ALL). */
  exec(sql: string): Promise<void>;
  /** Connection settings. A no-op where they are not per-connection. */
  pragma(statement: string): Promise<void>;
  prepare(sql: string): Statement;
  /**
   * Re-entrant: calling a transactional helper from inside another transaction
   * joins the outer one instead of opening a second one, which SQLite forbids.
   * The outermost call owns the commit or rollback.
   */
  transaction<R>(fn: () => Promise<R>): Promise<R>;
  /** Several statements in one round trip, for bulk writes. */
  batch(statements: { sql: string; params?: Param | Param[] }[]): Promise<void>;
};

export const normalise = (value: unknown): unknown => {
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
 *
 * `named` is the object for drivers that take named arguments separately
 * (libSQL does), `array` is the flattened positional list for the rest.
 */
export function bindParams(params: Param[]): {
  named: Record<string, unknown> | null;
  array: unknown[];
} {
  if (params.length === 1 && isNamedBundle(params[0])) {
    const named: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params[0])) {
      named[key.replace(/^[@:$]/, "")] = normalise(value);
    }
    return { named, array: [] };
  }

  return { named: null, array: params.map(normalise) };
}

/** libSQL returns bigints; the app counts rows as numbers everywhere. */
export const toNumber = (value: unknown): number => {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return 0;
  return Number(value);
};
