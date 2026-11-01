import { defineConfig } from "@playwright/test";

/**
 * Two servers, one browser, no mocks-on-the-server-side except the OAuth
 * stand-in the app already ships (OAUTH_MOCK=1), which is a real HTTP client
 * round trip through the app's own /auth/mock/* endpoints — same code path as
 * Google, different identity provider.
 *
 * Ports are deliberately not 3000/3100 so this can run next to a dev server.
 * Override with AWAY_PORT / AWAY_OUTREACH_PORT.
 */

const webPort = Number(process.env.AWAY_PORT ?? 3210);
const outreachPort = Number(process.env.AWAY_OUTREACH_PORT ?? 3211);

/** process.env minus undefined, so it satisfies Playwright's Record<string,string>. */
const inherited = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
);

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: `http://localhost:${webPort}`,
    viewport: { width: 1280, height: 900 },
    // Set AWAY_E2E_CHANNEL=chrome|msedge to drive a browser that is already on
    // the machine instead of Playwright's download.
    channel: process.env.AWAY_E2E_CHANNEL || undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  webServer: [
    {
      // reset first, then boot: a letter's state lives on disk, and a re-run
      // should start from an empty city, not someone else's leftovers.
      command: `node reset-dbs.mjs && npm run start --prefix ../apps/web`,
      url: `http://localhost:${webPort}/explore`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...inherited,
        PORT: String(webPort),
        APP_URL: `http://localhost:${webPort}`,
        AWAY_DB_PATH: "../../.away/e2e-away.db",
        DEMO_LOGIN: "1",
        OAUTH_MOCK: "1",
        // `next start` is a production build; the stand-in provider refuses to
        // exist in production unless this is explicit.
        OAUTH_MOCK_ALLOW_PROD: "1",
        STRIPE_SECRET_KEY: "",
        INGEST_TOKEN: "e2e-ingest",
        DIGEST_TOKEN: "e2e-digest",
        PAYMENT_WEBHOOK_SECRET: "e2e-webhook",
      },
    },
    {
      command: `node reset-dbs.mjs --outreach && npm run start --prefix ../apps/outreach`,
      url: `http://localhost:${outreachPort}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...inherited,
        OUTREACH_PORT: String(outreachPort),
        OUTREACH_PASSWORD: "e2e-password",
        OUTREACH_SECRET: "e2e-signing-key-not-a-real-one",
        OUTREACH_DB_PATH: "../../.away/e2e-outreach.db",
        OUTREACH_OUTBOX: "../../.away/e2e-outbox",
        OUTREACH_MAIL_TRANSPORT: "file",
        OUTREACH_POSTAL_ADDRESS: "Away Lda, Rua da Prata 1, 1100-052 Lisboa, Portugal",
        AWAY_DB_PATH: "../../.away/e2e-away.db",
        AWAY_APP_URL: `http://localhost:${webPort}`,
        OUTREACH_PUBLIC_URL: `http://localhost:${outreachPort}`,
        OUTREACH_TZ: "Europe/Lisbon",
        // The tool only sends between 08:00 and 18:00 Lisbon time by design.
        // A test that only passes during office hours is a broken test.
        OUTREACH_WINDOW_START: "0",
        OUTREACH_WINDOW_END: "24",
      },
    },
  ],
});
