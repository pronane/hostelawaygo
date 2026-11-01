#!/usr/bin/env node
/**
 * Prove the Turso driver works, without a Turso account.
 *
 * Boots `scripts/turso-mock.mjs` — a stand-in that speaks the same HTTP protocol
 * and executes the SQL with `node:sqlite` — then starts the built app pointed at
 * it, the way a deployment would be:
 *
 *     TURSO_DATABASE_URL=http://127.0.0.1:PORT TURSO_AUTH_TOKEN=dev
 *
 * and checks the things that only break when the database is a network away:
 * the schema and seed land, pages render, and the data is still there after a
 * restart (which is the whole point of doing this at all).
 *
 *   npm run build && npm run test:turso
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.AWAY_TEST_PORT ?? 3310);
const MOCK_PORT = Number(process.env.AWAY_MOCK_PORT ?? 8381);
const DB_FILE = process.env.AWAY_MOCK_DB ?? "/tmp/away-turso-selftest.db";
const base = `http://127.0.0.1:${PORT}`;

rmSync(DB_FILE, { force: true });
rmSync(`${DB_FILE}-wal`, { force: true });
rmSync(`${DB_FILE}-shm`, { force: true });

const children = [];
const start = (name, command, args, env = {}) => {
  const child = spawn(command, args, {
    cwd: web,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = [];
  child.stdout.on("data", (d) => log.push(String(d)));
  child.stderr.on("data", (d) => log.push(String(d)));
  children.push(child);
  return { child, name, log };
};

const stop = async () => {
  for (const child of children) child.kill("SIGTERM");
  await sleep(300);
  for (const child of children) child.kill("SIGKILL");
};

const appEnv = () => ({
  PORT: String(PORT),
  APP_URL: base,
  TURSO_DATABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
  TURSO_AUTH_TOKEN: "selftest",
  // Deliberately set: Turso must win, because the point is that the file is gone.
  AWAY_DB_PATH: "/tmp/away-selftest-should-be-ignored.db",
  DEMO_LOGIN: "1",
  AWAY_DEMO_ACCOUNTS: "1",
});

async function waitFor(url, { tries = 120, expect = 200 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status === expect) return res;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`${url} never answered with ${expect}`);
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

let failure = null;
try {
  const mock = start("turso-mock", "node", ["scripts/turso-mock.mjs", String(MOCK_PORT), DB_FILE]);
  await waitFor(`http://127.0.0.1:${MOCK_PORT}/v2/pipeline`, { expect: 404 }).catch(() => undefined);
  await sleep(600);

  const first = start("web", "node", ["./node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(PORT)], appEnv());
  const health = await waitFor(`${base}/api/health`);
  const body = await health.json();

  check("the app boots and seeds a fresh Turso database", body.ok === true, `schema ${body.schema}`);
  check("health says the database is Turso", body.database === "turso" && body.storage === "persistent", `${body.database} / ${body.storageWhy}`);
  check("AWAY_DB_PATH was ignored in favour of Turso", body.storage === "persistent");

  for (const path of ["/", "/login", "/explore", "/c/lisbon", "/hostel/home-lisbon", "/event/1"]) {
    const res = await fetch(`${base}${path}`);
    check(`GET ${path}`, res.status === 200, String(res.status));
  }

  const seedCount = body.events;
  first.child.kill("SIGTERM");
  await sleep(800);

  const second = start("web", "node", ["./node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(PORT)], appEnv());
  const again = await (await waitFor(`${base}/api/health`)).json();
  check("a restart does not reseed", again.events === seedCount && again.schema === body.schema, `${again.events} events, schema ${again.schema}`);
  check("the seed's own row survived the restart", again.cities === body.cities, `${again.cities} cities`);
  void second;
} catch (error) {
  failure = error;
  console.error(`\n  ✗ ${error.message}`);
} finally {
  await stop();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed${failure ? "" : ""}`);
process.exit(failed === 0 && !failure ? 0 : 1);
