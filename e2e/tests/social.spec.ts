import { expect, test } from "@playwright/test";

/**
 * The provider is the app's own stand-in (OAUTH_MOCK=1): a real HTTP round trip
 * through /auth/google → consent → /auth/google/callback, with the same state,
 * PKCE, nonce and id_token checks the real thing uses. Only the identity
 * provider is fake.
 */
test("signs up with a provider, then sets a password and uses it", async ({ page }) => {
  const email = `browser.traveller.${Date.now()}@example.com`;

  await page.goto("/login");
  await page.getByRole("link", { name: /Continue with Google/i }).click();

  // Consent screen served by the stand-in.
  await expect(page.locator("form")).toBeVisible();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="name"]').fill("Browser Traveller");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page).toHaveURL(/\/you\?welcome=1/, { timeout: 30_000 });
  await expect(page.getByText(/You're in\./)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Browser Traveller");

  // A provider-only account can add a password so it is not locked to Google.
  await page.getByPlaceholder("At least 8 characters").fill("browser-pass-1");
  await page.getByPlaceholder("Same again").fill("browser-pass-1");
  await page.getByRole("button", { name: /Set password/i }).click();
  await expect(page).toHaveURL(/password=set/);
  await expect(page.getByText(/Password added/i)).toBeVisible();

  // Prove it: sign out, then sign in with the password just set.
  await page.getByRole("button", { name: /Sign out/i }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 20_000 });
  await page.goto("/you");
  await expect(page.locator("h1.page-title")).toHaveText(/Not signed in/i);

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("browser-pass-1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/you/, { timeout: 20_000 });
  await expect(page.getByText(email)).toBeVisible();
});
