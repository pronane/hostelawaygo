import { expect, test } from "@playwright/test";

/**
 * The outreach tool is a separate Node server with its own password and its own
 * database, so it gets absolute URLs rather than the suite's baseURL.
 * Everything here happens through the UI, including the send — which, with the
 * file transport, writes `.eml` files and is recorded as simulated.
 */
const outreach = `http://localhost:${process.env.AWAY_OUTREACH_PORT ?? 3211}`;
const password = "e2e-password";

test("opens a city, finds hostels, drafts a letter, approves it and sends it", async ({ page }) => {
  await page.goto(`${outreach}/`);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("h1")).toHaveText(/One city at a time/i);

  // 1. A new city to open.
  await page.locator("#name").fill("Seville");
  await page.locator("#country").fill("Spain");
  await page.getByRole("button", { name: "Add city" }).click();
  await expect(page).toHaveURL(/\/cities\/seville/);
  await expect(page.locator("h1")).toHaveText(/Seville/i);

  // 2. Hostels, from the built-in fixture instead of OpenStreetMap — the only
  //    step that would otherwise need the internet.
  await page.getByRole("button", { name: "Load demo hostels" }).click();
  await expect(page.getByText(/\d+ demo hostels added/i)).toBeVisible();
  await expect(page.getByText(/with email/i).first()).toBeVisible();

  // 3. Draft, one letter per hostel with a published address.
  await page.getByRole("button", { name: /^Draft \d+ letters?$/ }).click();
  await expect(page).toHaveURL(/\/review/);
  await expect(page.locator("h1")).toHaveText(/Review/i);
  await expect(page.getByText(/Hi /i).first()).toBeVisible();

  // 4. A human reads it and approves it into the outbox — nothing sends yet.
  await page.getByRole("button", { name: /Approve — add to outbox/i }).click();
  await expect(page.getByText(/Approved for/i)).toBeVisible();

  // 5. The deliberate act: tick the box, press the coral button.
  await page.goto(`${outreach}/queue`);
  await expect(page.locator("h1")).toHaveText(/Outbox/i);
  await page.getByRole("checkbox", { name: /I've read these/i }).check();
  await page.getByRole("button", { name: "Send now" }).click();
  await expect(page.locator("body")).toContainText(/Sent \d+/i, { timeout: 30_000 });

  // 6. There is a record, and with the file transport there is a real .eml.
  await page.goto(`${outreach}/sent`);
  await expect(page.locator("h1")).toHaveText(/Sent/i);
  await expect(page.locator('a[href$=".eml"]').first()).toBeVisible();
});
