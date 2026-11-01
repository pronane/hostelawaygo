#!/usr/bin/env node
/**
 * Create the database the honest way.
 *
 * The schema lives in `lib/schema.ts` and is applied by the app itself: the
 * first HTTP request runs migrations, seeds Lisbon, the demo hostels, events
 * and the demo accounts. So the reliable way to "build all tables from the src
 * config" is to boot the built server, ask it for one page, and stop it again.
 *
 * Then this script opens the resulting file with the same SQLite build the app
 * uses (`node:sqlite`) and prints what is actually in it — a table list read
 * from `sqlite_master`, not from a migration file that might not have run.
 *
 *   node scripts/db-init.mjs            # create/refresh, report, exit
 *   node scripts/db-init.mjs --quiet    # create if needed, print one line
 */
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const quiet = process.argv.includes("--quiet");
const dbPath = process.env.AWAY_DB_PATH
  ? resolve(web, process.env.AWAY_DB_PATH)
  : join(web, "data", "away.db");

const say = (line = "") => {
  if (!quiet) console.log(line);
};

/** A port nothing else is using, so this can run next to a dev server. */
function freePort() {
  return new Promise((ok, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => ok(port));
    });
  });
}

async function waitForHttp(url, deadlineMs) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function createDatabase() {
  if (!existsSync(join(web, "node_modules", "next", "dist", "bin", "next"))) {
    console.error("db-init: apps/web has no dependencies installed — run `npm install` there first.");
    process.exit(1);
  }
  if (!existsSync(join(web, ".next", "BUILD_ID"))) {
    console.error("db-init: apps/web is not built — run `npm run build` there first.");
    process.exit(1);
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  const port = await freePort();
  say(`db-init: asking the app to build its schema on port ${port}`);

  const child = spawn(
    process.execPath,
    [join(web, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: web,
      env: { ...process.env, NODE_ENV: "production", AWAY_DB_PATH: dbPath, DEMO_LOGIN: "1" },
      stdio: quiet ? "ignore" : ["ignore", "ignore", "pipe"],
    }
  );

  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const ready = await waitForHttp(`http://127.0.0.1:${port}/`, 90_000);
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));

  if (!ready) {
    console.error("db-init: the app never answered, so the schema was not applied.");
    if (stderr.trim()) console.error(stderr.trim().split("\n").slice(-12).join("\n"));
    process.exit(1);
  }
}

function report() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);

  const counted = [
    "travellers",
    "cities",
    "hostels",
    "rooms",
    "events",
    "joins",
    "messages",
    "bookings",
    "trips",
    "identities",
    "safe_nights",
  ];
  const counts = {};
  for (const table of counted) {
    if (!tables.includes(table)) continue;
    counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  }

  const accounts = tables.includes("travellers")
    ? db.prepare("SELECT email, role FROM travellers WHERE email IS NOT NULL ORDER BY id LIMIT 6").all()
    : [];
  const schemaVersion = tables.includes("meta")
    ? db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()?.value
    : null;

  db.close();

  say("");
  say(`  database   ${dbPath}`);
  say(`  schema     ${schemaVersion ? `v${schemaVersion}` : "applied"}`);
  say(`  tables     ${tables.length} — ${tables.join(", ")}`);
  const tally = Object.entries(counts)
    .map(([table, n]) => `${table} ${n}`)
    .join(" · ");
  if (tally) say(`  rows       ${tally}`);
  if (accounts.length) say(`  accounts   ${accounts.map((a) => `${a.email} (${a.role})`).join(", ")}`);
  say("");

  if (!tables.length) {
    console.error("db-init: the database exists but has no tables — something is wrong with the schema.");
    process.exit(1);
  }

  return { tables, counts };
}

if (existsSync(dbPath)) {
  say(`db-init: ${dbPath} already exists, checking it rather than starting over`);
} else {
  await createDatabase();
}

const { tables } = report();

if (quiet) {
  console.log(`db-init: ${tables.length} tables in ${dbPath}`);
}
