import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Where the SQLite file lives — and whether it will still be there later.
 *
 * The app is a long-running process with a file on disk. A serverless platform
 * makes the deployment directory read-only and hands you `/tmp` for the life of
 * an instance, so on Vercel the app runs with an ephemeral database: every cold
 * start rebuilds and reseeds it, and two instances are two different databases.
 * That is a demo, not a deployment — see docs/deploy.md.
 *
 * The three cases, in order:
 *   1. `AWAY_DB_PATH` — used verbatim. If it cannot be written we stop, because
 *      an explicit path on a server means a mounted disk, and silently writing
 *      somewhere else is how you lose a database without noticing.
 *   2. a serverless runtime — `/tmp`, with a warning in the log.
 *   3. anywhere else — `data/away.db` next to the app, falling back to `/tmp`
 *      if that directory turns out to be read-only.
 */

export type Storage = {
  /** Absolute path of the SQLite file. */
  path: string;
  /** True when the file will not survive the instance. */
  ephemeral: boolean;
  /** Why this path, in three or four words, for /api/health and the logs. */
  reason: string;
};

const SERVERLESS = Boolean(
  process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NETLIFY ||
    process.env.CF_PAGES
);

const tmpPath = () => join(tmpdir(), "away.db");

const errorCode = (error: unknown): string =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : error instanceof Error
      ? error.message
      : String(error);

function writableDirectory(path: string): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/** Several server bundles can import this module; the log line should be one line. */
const warned = globalThis as unknown as { __awayStorageWarned?: boolean };
const warnOnce = (message: string) => {
  if (warned.__awayStorageWarned) return;
  warned.__awayStorageWarned = true;
  console.warn(message);
};

function resolveStorage(): Storage {
  const configured = process.env.AWAY_DB_PATH?.trim();

  if (configured) {
    if (writableDirectory(configured)) {
      return { path: configured, ephemeral: false, reason: "AWAY_DB_PATH" };
    }
    throw new Error(
      `AWAY_DB_PATH is "${configured}" but that directory cannot be created (read-only, or not mounted). ` +
        `On a host with a disk, check the mount. On Vercel, unset AWAY_DB_PATH — the app uses /tmp there.`
    );
  }

  if (SERVERLESS) {
    const path = tmpPath();
    warnOnce(
      `[db] serverless runtime: using ${path}. The database is rebuilt on every cold start ` +
        `and each instance has its own — see docs/deploy.md#vercel`
    );
    return { path, ephemeral: true, reason: "serverless filesystem" };
  }

  const beside = join(process.cwd(), "data", "away.db");
  if (writableDirectory(beside)) {
    return { path: beside, ephemeral: false, reason: "next to the app" };
  }

  const fallback = tmpPath();
  mkdirSync(dirname(fallback), { recursive: true });
  warnOnce(
    `[db] ${dirname(beside)} is not writable here, so the database is ${fallback}. ` +
      `It will not survive this instance — see docs/deploy.md.`
  );
  return { path: fallback, ephemeral: true, reason: "read-only filesystem" };
}

export const storage: Storage = resolveStorage();
