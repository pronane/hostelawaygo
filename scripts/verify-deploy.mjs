#!/usr/bin/env node
/**
 * Is the thing you just deployed actually up, and is it the right thing?
 *
 *   node scripts/verify-deploy.mjs https://away.onrender.com
 *
 * Nine checks over HTTP, no dependencies, no session: the health endpoint, the
 * public pages, the guards that must redirect, and one warning if the deployment
 * still has demo sign-in switched on.
 */
const target = (process.argv[2] ?? process.env.AWAY_URL ?? "").replace(/\/$/, "");

if (!target || !/^https?:\/\//.test(target)) {
  console.error("Usage: node scripts/verify-deploy.mjs https://your-app.example.com");
  process.exit(1);
}

const results = [];
let failed = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
}

async function get(path, init = {}) {
  const started = Date.now();
  const response = await fetch(target + path, { redirect: "manual", ...init });
  return { response, ms: Date.now() - started, text: await response.text().catch(() => "") };
}

const run = async () => {
  console.log(`\n  ${target}\n`);

  // 1. health
  try {
    const { response, text, ms } = await get("/api/health");
    let body = {};
    try {
      body = JSON.parse(text);
    } catch {
      /* not json */
    }
    record(
      "health endpoint",
      response.status === 200 && body.ok === true,
      `${response.status} · schema ${body.schema ?? "?"} · ${body.cities ?? "?"} cities · ${body.events ?? "?"} events · ${body.payments ?? "?"} payments · ${ms}ms`
    );
    if (body.storage === "ephemeral") {
      console.log(
        `  !  the database is ephemeral (${body.storageWhy ?? "no disk"}) — every restart loses accounts, bookings and messages\n`
      );
    }
    if (body.demo) {
      console.log(
        `  !  demo mode is on (logins: ${body.demo.logins}, accounts: ${body.demo.accounts}) — fine for a demo, wrong for real people\n`
      );
    }
  } catch (error) {
    record("health endpoint", false, error.message);
  }

  // 2-4. the pages a stranger lands on
  for (const [name, path, expect] of [
    ["the HERE feed", "/", /Lisbon/],
    ["explore", "/explore", /hostel/i],
    ["login", "/login", /Sign in/i],
    ["a hostel page", "/hostel/home-lisbon", /Home Lisbon/i],
  ]) {
    try {
      const { response, text, ms } = await get(path);
      record(name, response.status === 200 && expect.test(text), `${response.status} · ${ms}ms`);
    } catch (error) {
      record(name, false, error.message);
    }
  }

  // 5. a guard: signed-out users are sent to the login page, not shown the page
  try {
    const { response } = await get("/safe");
    const location = response.headers.get("location") ?? "";
    record(
      "the auth guard redirects",
      [302, 303, 307, 308].includes(response.status) && location.includes("/login"),
      `${response.status} → ${location}`
    );
  } catch (error) {
    record("the auth guard redirects", false, error.message);
  }

  // 6. an API that must not be open
  try {
    const { response } = await get("/api/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: 1 }),
    });
    record("/api/join refuses a stranger", response.status === 401, String(response.status));
  } catch (error) {
    record("/api/join refuses a stranger", false, error.message);
  }

  // 7. is it serving a real build? Next fingerprints its own assets
  try {
    const { response, text } = await get("/");
    const fingerprinted = /\/_next\/static\/[^"]+\.js/.test(text);
    record("static assets are served", fingerprinted, fingerprinted ? "fingerprinted JS found" : "no /_next/static assets in the page");
  } catch (error) {
    record("static assets are served", false, error.message);
  }

  // 8. HTTPS — required in public, expected to be absent on a laptop
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/.test(target);
  const secure = target.startsWith("https://");
  record("HTTPS", secure || local, secure ? "https" : local ? "http on this machine — fine here" : "plain http — not for real people");

  console.log("");
  for (const { name, ok, detail } of results) {
    console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(28)} ${detail}`);
  }
  console.log("");

  if (failed) {
    console.error(`  ${failed} of ${results.length} checks failed\n`);
    process.exit(1);
  }
  console.log(`  all ${results.length} checks passed\n`);
};

run().catch((error) => {
  console.error(`\n  could not reach ${target}: ${error.message}\n`);
  process.exit(1);
});
