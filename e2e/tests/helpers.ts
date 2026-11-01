import { expect, type Page } from "@playwright/test";

/** YYYY-MM-DD, `days` from today, in the browser's own timezone. */
export function dayFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Local datetime suitable for `<input type="datetime-local">`, `hours` ahead. */
export function localDateTimeIn(hours: number): string {
  const date = new Date(Date.now() + hours * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Sign in through the real login page and the real server action.
 * The demo buttons only exist when DEMO_LOGIN is on, which the suite sets.
 */
export async function signInAsDemo(page: Page, who: string): Promise<void> {
  await page.goto("/login");
  const button = page.getByRole("button", { name: new RegExp(who.replace(".", "\\.")) });
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

export async function signOut(page: Page): Promise<void> {
  await page.goto("/you");
  const out = page.getByRole("button", { name: /sign out/i });
  if (await out.count()) {
    await out.first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/you"), { timeout: 20_000 });
  }
}

/** The first event card on the HERE feed. */
export function firstEventCard(page: Page) {
  return page.locator('a.card[href^="/event/"]').first();
}
