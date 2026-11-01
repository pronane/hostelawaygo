import { expect, test } from "@playwright/test";

/**
 * The browserless prelude.
 *
 * These use Playwright's HTTP client, not a browser, so they still run on a
 * machine where the browser download was blocked — and they answer the first
 * question an install can raise ("did the servers actually come up?") before a
 * single click happens.
 *
 * Run just this file with:  npm run smoke
 */

const outreach = `http://localhost:${process.env.AWAY_OUTREACH_PORT ?? 3211}`;

function inputsFrom(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const pattern = /<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g;
  for (const match of html.matchAll(pattern)) fields[match[1]] = match[2];
  return fields;
}

test("the web app answers and serves the Lisbon feed", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("Lisbon");
  expect(html).toMatch(/\/event\/\d+/);
});

test("the login page is a real login page", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("Continue with Google");
  // The demo accounts the installer promises are there.
  expect(html).toContain("marta@away.app");
});

test("a provider sign-in completes over HTTP and lands on /you", async ({ request }) => {
  const start = await request.get("/auth/google?next=/you", { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(start.status());

  // Playwright resolves a path-only Location against the configured baseURL,
  // and passes an absolute one through untouched — either shape works.
  const authorize = start.headers()["location"];
  const consent = await request.get(authorize);
  expect(consent.status()).toBe(200);

  const fields = inputsFrom(await consent.text());
  expect(fields.state, "the consent screen must carry the state").toBeTruthy();

  const email = `smoke.${Date.now()}@example.com`;
  const allowance = await request.post(authorize, {
    form: { ...fields, email, name: "Smoke Traveller", verified: "1", share_email: "1", decision: "allow" },
    maxRedirects: 0,
  });
  expect([302, 303, 307, 308]).toContain(allowance.status());

  // Follow the callback, which is where the cookie is set.
  let next = allowance.headers()["location"];
  for (let hop = 0; hop < 3 && next; hop += 1) {
    const followed = await request.get(next, { maxRedirects: 0 });
    if (followed.status() === 200) break;
    next = followed.headers()["location"];
  }

  const you = await request.get("/you");
  expect(you.status()).toBe(200);
  expect(await you.text()).toContain(email);
});

test("the outreach tool answers behind its own password", async ({ request }) => {
  const health = await request.get(`${outreach}/healthz`);
  expect(health.status()).toBe(200);

  const login = await request.get(`${outreach}/login`);
  expect(login.status()).toBe(200);
  expect(await login.text()).toContain("Sending is not");

  const signIn = await request.post(`${outreach}/login`, {
    form: { password: "e2e-password" },
    maxRedirects: 0,
  });
  expect([302, 303, 307, 308]).toContain(signIn.status());

  const overview = await request.get(`${outreach}/`);
  expect(overview.status()).toBe(200);
  expect(await overview.text()).toContain("One city at a time");
});
