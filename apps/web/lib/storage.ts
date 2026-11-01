import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Which database this process is talking to — and whether it will still be
 * there later.
 *
 * The app is a long-running process with a file on disk. A serverless platform
 * makes the deployment directory read-only and hands you `/tmp` for the life of
 * an instance, so on Vercel the app runs with an ephemeral database: every cold
 * start rebuilds and reseeds it, and two instances are two different databases.
 * That is a demo, not a deployment — see docs/deploy.md.
 *
 * The cases, in order:
 *   1. `TURSO_DATABASE_URL` (+ `TURSO_AUTH_TOKEN`) — Turso. Real persistence on
 *      a platform with no disk, which is the only way to keep data on Vercel.
 *   2. `AWAY_DB_PATH` — used verbatim. If it cannot be written we stop, because
 *      an explicit path on a server means a mounted disk, and silently writing
 *      somewhere else is how you lose a database without noticing.
 *   3. a serverless runtime — `/tmp`, with a warning in the log.
 *   4. anywhere else — `data/away.db` next to the app, falling back to `/tmp`
 *      if that directory turns out to be read-only.
 */

export type Storage = {
  /** `turso` for the hosted database, `file` for a SQLite file on disk. */
  kind: "turso" | "file";
  /** The `libsql://` URL, or the absolute path of the SQLite file. */
  path: string;
  /** Auth token, only for `kind: "turso"`. */
  token?: string;
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

const TURSO_SCHEMES = ["libsql:", "https:", "http:", "ws:", "wss:"];

function tursoStorage(): Storage | null {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (!url) return null;

  if (!TURSO_SCHEMES.some((scheme) => url.startsWith(scheme))) {
    throw new Error(
      `TURSO_DATABASE_URL is "${url}". It has to be the libsql:// URL Turso gives you ` +
        `(or an https:// one), not a file path. Copy it from the dashboard or from ` +
        `\`turso db show --url <db>\`.`
    );
  }

  const token = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;
  if (!token && url.startsWith("libsql:")) {
    warnOnce(
      "[db] TURSO_DATABASE_URL is set without TURSO_AUTH_TOKEN. A remote database needs both; " +
        "copy the token with `turso db tokens create <db>`."
    );
  }

  return { kind: "turso", path: url, token, ephemeral: false, reason: "Turso (libSQL)" };
}

function resolveStorage(): Storage {
  const turso = tursoStorage();
  if (turso) {
    if (process.env.AWAY_DB_PATH?.trim()) {
      warnOnce("[db] Turso is configured, so AWAY_DB_PATH is ignored (the database is in Turso).");
    }
    return turso;
  }

  const configured = process.env.AWAY_DB_PATH?.trim();

  if (configured) {
    if (writableDirectory(configured)) {
      return { kind: "file", path: configured, ephemeral: false, reason: "AWAY_DB_PATH" };
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
    return { kind: "file", path, ephemeral: true, reason: "serverless filesystem" };
  }

  const beside = join(process.cwd(), "data", "away.db");
  if (writableDirectory(beside)) {
    return { kind: "file", path: beside, ephemeral: false, reason: "next to the app" };
  }

  const fallback = tmpPath();
  mkdirSync(dirname(fallback), { recursive: true });
  warnOnce(
    `[db] ${dirname(beside)} is not writable here, so the database is ${fallback}. ` +
      `It will not survive this instance — see docs/deploy.md.`
  );
  return { kind: "file", path: fallback, ephemeral: true, reason: "read-only filesystem" };
}

export const storage: Storage = resolveStorage();
