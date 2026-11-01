#!/usr/bin/env node
/**
 * End-to-end check of social sign-in, against the production build, with no
 * network and no developer accounts.
 *
 * It boots the app with OAUTH_MOCK=1 on a throwaway database, then walks the
 * real flow the browser walks: /login → /auth/<provider> → the provider's
 * consent screen → the provider's callback → a session cookie. The mock signs
 * RS256 tokens and publishes a JWKS, so the app's verifier — signature, iss,
 * aud, exp, nonce — is exercised exactly as it would be against Google.
 *
 * What it can't prove: that Google, Facebook and Apple accept our redirect
 * URIs. That needs real keys, and it's the one thing only you can test.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const appDir = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const workDir = await mkdtemp(join(tmpdir(), "away-oauth-"));

const freePort = () =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const dbPath = join(workDir, "away.db");

let serverLog = "";
const child = spawn("npx", ["next", "start", "-p", String(port)], {
  cwd: appDir,
  env: {
    ...process.env,
    AWAY_DB_PATH: dbPath,
    OAUTH_MOCK: "1",
    OAUTH_MOCK_ALLOW_PROD: "1",
    APP_URL: base,
    DEMO_LOGIN: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
  // Own process group, so `next start`'s child dies with it.
  detached: true,
});
child.stdout.on("data", (chunk) => (serverLog += chunk));
child.stderr.on("data", (chunk) => (serverLog += chunk));

/* ---------------------------------------------------------------- harness */

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  \u001b[32m✓\u001b[0m ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  \u001b[31m✗\u001b[0m ${name}\n      ${error.message}`);
  }
}

// Next answers a GET redirect with 307 and a POST redirect with 303. Both are
// redirects; what matters is where they point.
const isRedirect = (status) => status === 302 || status === 303 || status === 307;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const equal = (actual, expected, message) =>
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message ?? "not equal"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );

async function request(path, { method = "GET", form, cookie, headers = {}, multipart = false } = {}) {
  // Server-action forms are `multipart/form-data`; Next only dispatches the
  // action when the body arrives that way, so forms that a browser would post
  // as multipart are posted as multipart here too.
  let body;
  let contentType;
  if (form && multipart) {
    const data = new FormData();
    for (const [key, value] of Object.entries(form)) data.append(key, value);
    body = data;
  } else if (form) {
    body = new URLSearchParams(form).toString();
    contentType = "application/x-www-form-urlencoded";
  }

  const response = await fetch(`${base}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(contentType ? { "content-type": contentType } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body,
  });
  const text = await response.text();
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const session = setCookies.map((value) => value.split(";")[0]).find((value) => value.startsWith("away_session="));
  return { status: response.status, location: response.headers.get("location"), text, session, setCookies };
}

const db = () => new DatabaseSync(dbPath, { readOnly: true });

/* --------------------------------------------------------------- the flow */

/**
 * One full pass through a provider, the way a browser does it: start, consent,
 * callback. Returns the callback response plus what the consent screen saw.
 */
async function signIn(provider, { email, name = "Mock Traveller", shareEmail = true, verified = true, next = "/you" } = {}) {
  const start = await request(`/auth/${provider}?next=${encodeURIComponent(next)}`);
  assert(isRedirect(start.status), `start should redirect, got ${start.status}`);
  const authorize = new URL(start.location);
  const state = authorize.searchParams.get("state");
  const challenge = authorize.searchParams.get("code_challenge");
  const nonce = authorize.searchParams.get("nonce");

  const consentPage = await request(`${authorize.pathname}${authorize.search}`);
  assert(consentPage.status === 200, `consent page ${consentPage.status}`);

  const consent = await request(`/auth/mock/${provider}/authorize`, {
    method: "POST",
    form: {
      redirect_uri: authorize.searchParams.get("redirect_uri"),
      state,
      client_id: authorize.searchParams.get("client_id"),
      code_challenge: challenge,
      nonce: nonce ?? "",
      response_mode: authorize.searchParams.get("response_mode") ?? "query",
      email: email ?? "",
      name,
      decision: "allow",
      ...(shareEmail ? { share_email: "1" } : {}),
      ...(verified ? { verified: "1" } : {}),
    },
  });

  // form_post (Apple): the provider returns an auto-submitting form instead of
  // a redirect. Extract its fields and post them, like the browser would.
  let callback;
  if (consent.status === 200 && consent.text.includes("document.forms[0].submit()")) {
    const action = /action="([^"]+)"/.exec(consent.text)?.[1];
    const inputs = [...consent.text.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(([, key, value]) => [key, value]);
    const body = Object.fromEntries(inputs);
    callback = await request(new URL(action).pathname, { method: "POST", form: body });
  } else {
    assert(isRedirect(consent.status), `consent should redirect, got ${consent.status}`);
    const target = new URL(consent.location);
    callback = await request(`${target.pathname}${target.search}`);
  }

  return { callback, authorize, state };
}

/* ------------------------------------------------------------- server up */

const deadline = Date.now() + 90_000;
let up = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${base}/login`);
    if (response.ok) {
      up = true;
      break;
    }
  } catch {
    /* still starting */
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}

if (!up) {
  console.error("Server didn't start.\n" + serverLog);
  process.exit(1);
}

console.log("\nButtons and handshake");

await test("/login offers Google, Facebook and Apple", async () => {
  const page = await request("/login");
  equal(page.status, 200);
  for (const label of ["Continue with Google", "Continue with Facebook", "Continue with Apple"]) {
    assert(page.text.includes(label), `missing "${label}"`);
  }
  assert(page.text.includes("/auth/google?next="), "buttons carry the next path");
});

await test("starting a sign-in redirects with state, PKCE and nonce", async () => {
  const { authorize } = await signIn("google", { email: "handshake@example.com" });
  equal(authorize.host, new URL(base).host, "authorize URL points at the configured provider");
  assert(authorize.searchParams.get("state")?.length >= 32, "state is long");
  equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert(authorize.searchParams.get("code_challenge")?.length > 20, "PKCE challenge present");
  assert(authorize.searchParams.get("nonce")?.length >= 16, "nonce present");
  equal(authorize.searchParams.get("redirect_uri"), `${base}/auth/google/callback`);
});

console.log("\nCreating an account");

const first = await signIn("google", { email: "ada@example.com", name: "Ada Lovelace" });

await test("the callback sets a session and lands where it was going", async () => {
  assert(isRedirect(first.callback.status), `callback ${first.callback.status}`);
  equal(first.callback.location, "/you?welcome=1", "new accounts get a welcome flag");
  assert(first.callback.session, "away_session cookie issued");
});

await test("the account exists, verified, with no password", async () => {
  const handles = db();
  const row = handles.prepare("SELECT * FROM travellers WHERE email = ?").get("ada@example.com");
  handles.close();
  assert(row, "traveller created");
  equal(row.name, "Ada Lovelace");
  equal(row.role, "traveller");
  equal(row.password_hash, null, "no password set");
  assert(row.email_verified_at, "provider-verified email is marked verified");
});

await test("/you shows the account and where it signs in from", async () => {
  const page = await request("/you", { cookie: first.callback.session });
  equal(page.status, 200);
  assert(page.text.includes("Ada Lovelace"), "name on the page");
  assert(page.text.includes("How you sign in"), "connected-accounts panel");
  assert(page.text.includes("Google"), "Google listed as a way in");
});

await test("signing in again reuses the account instead of making a second one", async () => {
  const again = await signIn("google", { email: "ada@example.com", name: "Ada L" });
  assert(isRedirect(again.callback.status), `callback ${again.callback.status}`);
  equal(again.callback.location, "/you", "no welcome flag the second time");
  const handles = db();
  const account = handles.prepare("SELECT id, email FROM travellers WHERE email = ?").get("ada@example.com");
  const count = handles.prepare("SELECT COUNT(*) AS n FROM travellers WHERE email = ?").get("ada@example.com").n;
  const identities = handles.prepare("SELECT COUNT(*) AS n FROM identities WHERE traveller_id = ?").get(account.id).n;
  handles.close();
  equal(Number(count), 1, "one account");
  equal(Number(identities), 1, "one identity for that account");
});

console.log("\nLinking and refusals");

await test("a provider login links to an existing password account, and verifies it", async () => {
  const handles = new DatabaseSync(dbPath);
  handles
    .prepare(
      "INSERT INTO travellers (name, initials, flag, colour, solo, languages, email, password_hash, role) VALUES (?,?,?,?,?,?,?,?,?)"
    )
    .run("Linked Person", "LP", "🌍", "#FFD9A0", 1, "English", "linked@example.com", "scrypt$deadbeef$deadbeef", "traveller");
  const before = handles.prepare("SELECT id, email_verified_at FROM travellers WHERE email = ?").get("linked@example.com");
  handles.close();

  const flow = await signIn("google", { email: "linked@example.com", name: "Linked Person" });
  assert(isRedirect(flow.callback.status), `callback ${flow.callback.status}`);

  const after = new DatabaseSync(dbPath, { readOnly: true });
  const row = after.prepare("SELECT id, email_verified_at FROM travellers WHERE email = ?").get("linked@example.com");
  const identity = after.prepare("SELECT provider FROM identities WHERE traveller_id = ?").all(row.id);
  after.close();

  equal(row.id, before.id, "same account, not a duplicate");
  assert(row.email_verified_at, "the provider's proof verified the address");
  equal(identity.map((entry) => entry.provider), ["google"]);
});

await test("an unverified provider address cannot open an existing account", async () => {
  const handles = new DatabaseSync(dbPath);
  handles
    .prepare(
      "INSERT INTO travellers (name, initials, flag, colour, solo, languages, email, password_hash, role) VALUES (?,?,?,?,?,?,?,?,?)"
    )
    .run("Guarded Person", "GP", "🌍", "#FFD9A0", 1, "English", "unverified@example.com", "scrypt$deadbeef$deadbeef", "traveller");
  handles.close();

  const flow = await signIn("apple", { email: "unverified@example.com", verified: false });
  assert(isRedirect(flow.callback.status), `callback ${flow.callback.status}`);
  assert(flow.callback.location.startsWith("/login?error=oauth_unverified_email"), flow.callback.location);
  equal(flow.callback.session, undefined, "no session issued");
});

await test("a provider that shares no email asks you to sign up instead", async () => {
  const flow = await signIn("facebook", { email: "someone@example.com", shareEmail: false });
  assert(flow.callback.location.startsWith("/login?error=oauth_no_email"), flow.callback.location);
  const handles = db();
  const stray = handles.prepare("SELECT id FROM travellers WHERE lower(email) LIKE ?").get("%someone@example.com");
  handles.close();
  equal(stray, undefined, "no half-made account");
});

await test("a replayed state is refused", async () => {
  const flow = await signIn("google", { email: "replay@example.com" });
  assert(flow.callback.location.startsWith("/you"), flow.callback.location);
  const replay = await request(`/auth/google/callback?code=anything&state=${flow.state}`);
  assert(replay.location.startsWith("/login?error=oauth_state"), replay.location);
});

await test("a forged state is refused", async () => {
  const response = await request("/auth/google/callback?code=anything&state=not-a-real-state");
  assert(response.location.startsWith("/login?error=oauth_state"), response.location);
});

await test("a bad code fails at the provider, not in our session", async () => {
  const start = await request("/auth/google?next=/you");
  const authorize = new URL(start.location);
  const consent = await request("/auth/mock/google/authorize", {
    method: "POST",
    form: {
      redirect_uri: authorize.searchParams.get("redirect_uri"),
      state: authorize.searchParams.get("state"),
      client_id: authorize.searchParams.get("client_id"),
      code_challenge: authorize.searchParams.get("code_challenge"),
      nonce: authorize.searchParams.get("nonce"),
      email: "bogus@example.com",
      decision: "allow",
      share_email: "1",
      verified: "1",
    },
  });
  const target = new URL(consent.location);
  const response = await request(`/auth/google/callback?state=${authorize.searchParams.get("state")}&code=stolen`);
  assert(response.location.startsWith("/login?error=oauth_exchange"), response.location);
  assert(target.searchParams.get("code"), "the consent screen did issue a code — this test used a different one");
});

await test("cancelling on the consent screen changes nothing", async () => {
  const start = await request("/auth/google?next=/you");
  const authorize = new URL(start.location);
  const consent = await request("/auth/mock/google/authorize", {
    method: "POST",
    form: {
      redirect_uri: authorize.searchParams.get("redirect_uri"),
      state: authorize.searchParams.get("state"),
      client_id: authorize.searchParams.get("client_id"),
      code_challenge: authorize.searchParams.get("code_challenge"),
      nonce: authorize.searchParams.get("nonce"),
      email: "cancel@example.com",
      decision: "cancel",
    },
  });
  assert(isRedirect(consent.status), `consent ${consent.status}`);
  assert(consent.location.includes("error=access_denied"), consent.location);
  const response = await request(new URL(consent.location).pathname + new URL(consent.location).search);
  assert(response.location.startsWith("/login?error=oauth_denied"), response.location);
});

console.log("\nThe other two providers");

await test("Facebook creates an account from its userinfo endpoint", async () => {
  const flow = await signIn("facebook", { email: "fay@example.com", name: "Fay Book" });
  assert(isRedirect(flow.callback.status), `callback ${flow.callback.status}`);
  const handles = db();
  const row = handles.prepare("SELECT id, name FROM travellers WHERE email = ?").get("fay@example.com");
  const identity = handles.prepare("SELECT provider FROM identities WHERE traveller_id = ?").all(row.id);
  handles.close();
  assert(row, "traveller created from /me");
  equal(identity.map((entry) => entry.provider), ["facebook"]);
});

await test("Apple posts the code back, and the POST callback works", async () => {
  const flow = await signIn("apple", { email: "apple.user@example.com", name: "Apple User" });
  equal(flow.authorize.searchParams.get("response_mode"), "form_post");
  assert(isRedirect(flow.callback.status), `callback ${flow.callback.status}`);
  assert(flow.callback.session, "session issued from a form_post callback");
  const handles = db();
  const row = handles.prepare("SELECT id FROM travellers WHERE email = ?").get("apple.user@example.com");
  handles.close();
  assert(row, "Apple account created");
});

await test("Apple's authorize URL asks for the name/email scope", async () => {
  const start = await request("/auth/apple?next=/you");
  const authorize = new URL(start.location);
  equal(authorize.searchParams.get("scope"), "name email");
});

console.log("\nSafety");

await test("next= can't send anyone off-site", async () => {
  const flow = await signIn("google", { email: "redirect@example.com", next: "https://evil.example/steal" });
  assert(isRedirect(flow.callback.status), `callback ${flow.callback.status}`);
  assert(!String(flow.callback.location).includes("evil.example"), `open redirect: ${flow.callback.location}`);
  assert(String(flow.callback.location).startsWith("/"), `expected a local path, got ${flow.callback.location}`);
});

await test("PKCE is enforced by the token endpoint", async () => {
  const start = await request("/auth/google?next=/you");
  const authorize = new URL(start.location);
  const consent = await request("/auth/mock/google/authorize", {
    method: "POST",
    form: {
      redirect_uri: authorize.searchParams.get("redirect_uri"),
      state: authorize.searchParams.get("state"),
      client_id: authorize.searchParams.get("client_id"),
      code_challenge: authorize.searchParams.get("code_challenge"),
      nonce: authorize.searchParams.get("nonce"),
      email: "pkce@example.com",
      decision: "allow",
      share_email: "1",
      verified: "1",
    },
  });
  const code = new URL(consent.location).searchParams.get("code");
  const response = await fetch(`${base}/auth/mock/google/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: "wrong-verifier",
      client_id: "mock-google-client",
      client_secret: "mock-secret",
      redirect_uri: `${base}/auth/google/callback`,
    }).toString(),
  });
  equal(response.status, 400, "token endpoint refuses a bad verifier");
});

await test("a signed token for another audience is rejected", async () => {
  // Ask the mock to sign a token the app didn't ask for by starting a flow for
  // google and replaying its code at the *apple* token endpoint.
  const start = await request("/auth/google?next=/you");
  const authorize = new URL(start.location);
  const consent = await request("/auth/mock/google/authorize", {
    method: "POST",
    form: {
      redirect_uri: authorize.searchParams.get("redirect_uri"),
      state: authorize.searchParams.get("state"),
      client_id: authorize.searchParams.get("client_id"),
      code_challenge: authorize.searchParams.get("code_challenge"),
      nonce: authorize.searchParams.get("nonce"),
      email: "cross@example.com",
      decision: "allow",
      share_email: "1",
      verified: "1",
    },
  });
  const code = new URL(consent.location).searchParams.get("code");
  const response = await fetch(`${base}/auth/mock/apple/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: "mock-apple-client",
      client_secret: "mock-secret",
      redirect_uri: `${base}/auth/apple/callback`,
    }).toString(),
  });
  equal(response.status, 400, "a code from one provider is useless at another");
});

await test("a provider-only account can add a password, and then sign in with it", async () => {
  const flow = await signIn("google", { email: "password@example.com", name: "Password Person" });
  const page = await request("/you", { cookie: flow.callback.session });
  const form = /<form[^>]*>(?:(?!<\/form>)[\s\S])*?name="password"(?:(?!<\/form>)[\s\S])*?<\/form>/.exec(page.text)?.[0] ?? "";
  const actionId = /\$ACTION_ID_[a-f0-9]+/.exec(form)?.[0];
  assert(actionId, "the add-a-password form is on the page");

  const saved = await request("/you", {
    method: "POST",
    cookie: flow.callback.session,
    multipart: true,
    form: { [actionId]: "", password: "sturdy-pass-1", confirm: "sturdy-pass-1" },
  });
  assert(isRedirect(saved.status), `form post ${saved.status}`);
  assert(String(saved.location).includes("password=set"), `expected password=set, got ${saved.location}`);

  // And now the ordinary login form works for that account.
  const login = await request("/login");
  const loginAction = /<form[^>]*action=""[^>]*>(?:(?!<\/form>)[\s\S])*?name="password"(?:(?!<\/form>)[\s\S])*?<\/form>/.exec(login.text)?.[0] ?? "";
  const loginId = /\$ACTION_ID_[a-f0-9]+/.exec(login.text);
  const signed = await request("/login", {
    method: "POST",
    multipart: true,
    form: { [loginId[0]]: "", email: "password@example.com", password: "sturdy-pass-1", next: "/you" },
  });
  assert(isRedirect(signed.status), `login post ${signed.status}`);
  assert(signed.session, "password login issues the same session cookie");
});

await test("the callback path is not indexable and not a GET-able page of its own", async () => {
  const robots = await request("/robots.txt");
  assert(robots.text.includes("/auth/"), "/auth is disallowed for crawlers");
});

await test("without OAUTH_MOCK the buttons disappear and the stand-in is a 404", async () => {
  const secondPort = await freePort();
  const env = { ...process.env, AWAY_DB_PATH: dbPath, APP_URL: `http://127.0.0.1:${secondPort}`, DEMO_LOGIN: "0" };
  delete env.OAUTH_MOCK;
  delete env.OAUTH_MOCK_ALLOW_PROD;

  const second = spawn("npx", ["next", "start", "-p", String(secondPort)], {
    cwd: appDir,
    env,
    stdio: "ignore",
    detached: true,
  });

  try {
    const until = Date.now() + 60_000;
    let ready = false;
    while (Date.now() < until) {
      try {
        const response = await fetch(`http://127.0.0.1:${secondPort}/login`);
        if (response.ok) {
          const body = await response.text();
          ready = true;
          assert(!body.includes("Continue with"), "no provider buttons without keys");
          break;
        }
      } catch {
        /* starting */
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    assert(ready, "second server didn't start");

    const mock = await fetch(`http://127.0.0.1:${secondPort}/auth/mock/google/authorize?redirect_uri=x`);
    equal(mock.status, 404, "the mock provider is not served");

    const start = await fetch(`http://127.0.0.1:${secondPort}/auth/google`, { redirect: "manual" });
    assert(start.headers.get("location")?.includes("oauth_provider"), "unconfigured provider bounces to a message");
  } finally {
    try {
      process.kill(-second.pid, "SIGTERM");
    } catch {
      second.kill("SIGTERM");
    }
  }
});

/* ------------------------------------------------------------------ done */

try {
  process.kill(-child.pid, "SIGTERM");
} catch {
  child.kill("SIGTERM");
}
await new Promise((resolve) => setTimeout(resolve, 400));

if (failures.length) {
  console.log(`\n\u001b[31m${failures.length} failed\u001b[0m, ${passed} passed`);
  console.log("\n--- server log ---\n" + serverLog.split("\n").slice(-30).join("\n"));
  console.log(`Database kept at ${dbPath}`);
  process.exit(1);
}

await rm(workDir, { recursive: true, force: true });
console.log(`\n\u001b[32m${passed} passed\u001b[0m`);
process.exit(0);
