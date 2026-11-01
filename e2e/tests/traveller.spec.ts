import { expect, test } from "@playwright/test";
import { dayFromNow, firstEventCard, localDateTimeIn, signInAsDemo } from "./helpers";

test.describe("a traveller in Lisbon", () => {
  test("the HERE feed loads and a card opens an event", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Away/i);
    await expect(page.locator("h1.page-title")).toBeVisible();

    const cards = page.locator('a.card[href^="/event/"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);

    await firstEventCard(page).click();
    await expect(page).toHaveURL(/\/event\/\d+/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("signs in, joins an event, and says something in the chat", async ({ page }) => {
    await signInAsDemo(page, "Marta K.");

    await page.goto("/");
    await firstEventCard(page).click();
    await expect(page).toHaveURL(/\/event\/\d+/);

    // The join button is a client component talking to /api/join.
    const join = page.getByRole("button", { name: /^(Join|You're in) · \d+ going$/ });
    await expect(join).toBeVisible();
    if (/^Join/.test((await join.textContent()) ?? "")) {
      await join.click();
    }
    await expect(page.getByRole("button", { name: /^You're in · \d+ going$/ })).toBeVisible();

    const message = `Anyone else heading to the miradouro? ${Date.now()}`;
    await page.locator('input[name="body"]').fill(message);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(message)).toBeVisible();
  });

  test("books a bed and pays for it in the sandbox", async ({ page }) => {
    await signInAsDemo(page, "Marta K.");

    await page.goto("/explore");
    await expect(page.locator("h1.page-title")).toHaveText(/Explore/i);
    const hostels = page.locator("a.hostel-row");
    const hostelCount = await hostels.count();
    expect(hostelCount).toBeGreaterThan(0);

    // Not every hostel has rooms open yet, so try a few rather than betting on
    // whichever one the city happens to list first.
    let booked = false;
    for (let i = 0; i < Math.min(hostelCount, 4) && !booked; i += 1) {
      await page.goto("/explore");
      await page.locator("a.hostel-row").nth(i).click();
      await expect(page).toHaveURL(/\/hostel\//);

      await page.locator('input[name="in"]').fill(dayFromNow(20));
      await page.locator('input[name="out"]').fill(dayFromNow(23));
      await page.getByRole("button", { name: /Update availability/i }).click();

      const book = page.getByRole("button", { name: /^Book · / }).first();
      if ((await book.count()) === 0) continue;
      if (!(await book.isEnabled())) continue;
      await book.click();
      booked = true;
    }
    expect(booked, "no hostel had a bed free to book").toBe(true);

    await expect(page).toHaveURL(/\/booking\//);
    await expect(page.getByText(/Check in/i).first()).toBeVisible();

    await page.getByRole("button", { name: /^Pay .*\(sandbox\)$/ }).click();
    await expect(page.getByText(/^Paid · /)).toBeVisible();
  });

  test("the booking shows up in trips, and a night can be shared privately", async ({ page }) => {
    await signInAsDemo(page, "Marta K.");

    await page.goto("/trips");
    await expect(page.locator("h1.page-title")).toHaveText(/Your trips/i);
    await expect(page.locator("h2").first()).toBeVisible();

    await page.goto("/safe");
    await expect(page.locator("h1.page-title")).toHaveText(/Share my night/i);
    await page.locator("#safe-plan").fill("Fado at Tasca do Chico, then Bairro Alto");
    await page.locator("#safe-back").fill(localDateTimeIn(6));
    await page.locator("#safe-friend").fill("Sam");
    await page.getByRole("button", { name: /Create my link/i }).click();

    await expect(page.getByText(/Link ready/i)).toBeVisible();

    // The friend's view is a public link; the owner can still say she got home.
    await page.getByRole("button", { name: /I'm home safe/i }).first().click();
    await expect(page.getByText(/Home safe/i).first()).toBeVisible();
  });
});
