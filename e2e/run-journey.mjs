#!/usr/bin/env node
/**
 * `npm run journey` — the whole walk-through, with no browser.
 *
 * `tests/30-full-journey.spec.ts` is the same journey driven by Playwright. That
 * is the better test when you have Chromium: it exercises clicks, forms and
 * hydration. This runner exists for everywhere else — a fresh clone, a CI box
 * with no browser download, a reviewer's container — because it boots the app
 * exactly as `playwright.config.ts` does and then drives it over HTTP: real
 * cookies, real server actions, the same steps in the same order.
 *
 *   npm run journey                 # build if needed, empty database, port 3210
 *   JOURNEY_PORT=3300 npm run journey
 *   KEEP_SERVER=1 npm run journey   # leave the app running afterwards
 *
 * The database is the throwaway one under `.away/`, cleared before the run, so
 * this never touches a real Turso database.
 */
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, "../apps/web");
const port = Number(process.env.JOURNEY_PORT ?? 3210);
const base = `http://localhost:${port}`;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const shell = process.platform === "win32";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", shell, ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// 1. A production build, because `next start` needs one. Shared with `npm test`.
if (!existsSync(join(web, ".next", "BUILD_ID"))) {
  console.log("journey: building apps/web first (one minute, once)");
  run(npm, ["run", "build"], { cwd: web });
}

// 2. Empty the throwaway database: the walk-through creates a city, a hostel,
//    a booking and a subscription, and each of those has to be new.
run(process.execPath, [join(here, "reset-dbs.mjs")]);

// 3. Boot the app with the same environment the Playwright suite uses.
const server = spawn(npm, ["run", "start", "--prefix", web], {
  cwd: web,
  shell,
  // Own process group, so stopping it stops `next start` too and not just npm.
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PORT: String(port),
    APP_URL: base,
    AWAY_DB_PATH: "../../.away/e2e-away.db",
    DEMO_LOGIN: "1",
    OAUTH_MOCK: "1",
    OAUTH_MOCK_ALLOW_PROD: "1",
    // No mail provider here, so the confirm-your-email link is shown on the page.
    VERIFY_DEV_LINK: "1",
    // No key: billing falls back to the sandbox checkout.
    STRIPE_SECRET_KEY: "",
    INGEST_TOKEN: "e2e-ingest",
    DIGEST_TOKEN: "e2e-digest",
    PAYMENT_WEBHOOK_SECRET: "e2e-webhook",
  },
});

let serverLog = "";
for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    serverLog = (serverLog + chunk).slice(-4000);
    if (process.env.JOURNEY_VERBOSE) process.stdout.write(chunk);
  });
}

let finished = false;
function stop(code) {
  if (finished) return;
  finished = true;
  if (process.env.KEEP_SERVER === "1") {
    console.log(`journey: server left running on ${base}`);
    process.exit(code);
  }
  try {
    if (process.platform === "win32") server.kill("SIGTERM");
    else process.kill(-server.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  setTimeout(() => process.exit(code), 300).unref();
}

process.on("SIGINT", () => stop(130));

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/explore`);
      if (res.ok) return;
    } catch {
      /* not listening yet */
    }
    if (server.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  console.error(`journey: the app did not answer on ${base}\n${serverLog}`);
  stop(1);
  process.exit(1);
}

await waitForServer();

// 4. The journey itself, as a child so its output comes through untouched.
const journey = spawn(process.execPath, [join(here, "journey.mjs")], {
  cwd: here,
  stdio: "inherit",
  env: { ...process.env, BASE_URL: base },
});

journey.on("exit", (code) => stop(code ?? 1));
