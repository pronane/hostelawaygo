import { expect, test, type Page } from "@playwright/test";
import { dayFromNow, localDateTimeIn } from "./helpers";

/**
 * The whole walk-through, in one test, in the order a real person lives it:
 *
 *   a stranger lands → signs up → joins something → talks in the chat →
 *   books a bed and pays for it → shares the night with a friend →
 *   runs out of traveller → applies as a hostel in a city Away has never
 *   heard of → ops approves them → they post tonight → they try the screen
 *   (locked) → they start paying for Pro → it unlocks → they cancel.
 *
 * Every other spec in this folder proves one room of the house. This one is
 * the corridor: it is the test to run before a deploy, and the one to read when
 * asking "does the business actually work end to end".
 *
 * It creates its own account, its own city and its own hostel, so it is safe to
 * run against the reset databases the Playwright config boots, and its names
 * carry a timestamp so runs never collide.
 */

const STAMP = Date.now();

const TRAVELLER = {
  name: "Weronika Nowak",
  email: `journey-traveller-${STAMP}@away.test`,
  password: "walkthrough-123",
};
/** Same transform the app uses on a hostel's name, so the slug is known up front. */
const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// A city Away has not listed yet: applying has to create it.
const CITY = { name: "Sines", slug: "sines", country: "Portugal", tz: "Europe/Lisbon" };
const HOSTEL = {
  name: `Maré Alta Hostel ${STAMP}`,
  area: "Meia Praia",
  beds: "42",
  price: "23",
  contact: "Duarte Silva",
  email: `journey-hostel-${STAMP}@away.test`,
  password: "walkthrough-123",
  /** Filled in below: the slug the app will derive from the name above. */
  slug: "",
};
HOSTEL.slug = slugify(HOSTEL.name);

/** Fills a sign-in with a real address and password (not the demo buttons). */
async function signInWithPassword(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

async function signInAsDemo(page: Page, who: string) {
  await page.goto("/login");
  const button = page.getByRole("button", { name: new RegExp(who.replace(".", "\\.")) });
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

async function signOut(page: Page) {
  await page.goto("/you");
  const out = page.getByRole("button", { name: /sign out/i });
  if (await out.count()) {
    await out.first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/you"), { timeout: 20_000 });
  }
}

test.describe("the whole walk-through", () => {
  test("traveller → booking → partner application → approval → posting → paying → cancelling", async ({
    page,
  }) => {
    // ---------------------------------------------------------------- landing
    await test.step("a stranger lands and is told what this is", async () => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/hostel you're in/i);
      await expect(page.getByRole("link", { name: /Find your hostel/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /I run a hostel/i })).toBeVisible();
    });

    // ----------------------------------------------------------------- signup
    await test.step("signs up as a traveller", async () => {
      await page.goto("/signup");
      await page.locator("#name").fill(TRAVELLER.name);
      await page.locator("#email").fill(TRAVELLER.email);
      await page.locator("#password").fill(TRAVELLER.password);
      await page.getByRole("button", { name: "Create account" }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/signup"), { timeout: 20_000 });

      // The hero is for strangers only: a signed-in visitor gets the feed.
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText(/noticeboard the hostel never had/i)).toHaveCount(0);
    });

    // ----------------------------------------------------- join, and the gate
    let eventUrl = "";

    await test.step("joins a night, and chat asks for a confirmed email first", async () => {
      await page.goto("/");
      await page.locator('a.card[href^="/event/"]').first().click();
      await expect(page).toHaveURL(/\/event\/\d+/);
      eventUrl = page.url();

      const join = page.getByRole("button", { name: /^(Join|You're in) · \d+ going$/ });
      await expect(join).toBeVisible();
      if (/^Join/.test((await join.textContent()) ?? "")) await join.click();
      await expect(page.getByRole("button", { name: /^You're in · \d+ going$/ })).toBeVisible();

      // Brand-new accounts can join straight away but cannot talk: the first
      // message bounces back to the chat with the "confirm your email" note.
      await page.locator('input[name="body"]').fill(`Too early — ${STAMP}`);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page).toHaveURL(/chat=verify/);
      await expect(page.getByText(/Confirm your email to chat/i)).toBeVisible();
    });

    // -------------------------------------------------------- confirm the email
    await test.step("confirms the email from the link on the You page", async () => {
      await page.goto("/you");
      await expect(page.getByText(/to chat in events/i)).toBeVisible();
      await page.getByRole("button", { name: "Send link" }).click();

      const confirm = page.getByRole("link", { name: "confirm my email" });
      await expect(confirm).toBeVisible();
      await confirm.click();
      await expect(page).toHaveURL(/\/you\?verified=1/);
      await expect(page.getByText(/to chat in events/i)).toHaveCount(0);
    });

    // ------------------------------------------------------------- join, and talk
    await test.step("goes back and says something in the chat", async () => {
      const message = `Coming to this — ${STAMP}`;
      await page.goto(eventUrl);
      await page.locator('input[name="body"]').fill(message);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.getByText(message)).toBeVisible();
    });

    // ---------------------------------------------------------- money, part 1
    await test.step("books a bed and pays for it (sandbox)", async () => {
      await page.goto("/explore");
      const hostels = page.locator("a.hostel-row");
      const count = await hostels.count();
      expect(count).toBeGreaterThan(0);

      let booked = false;
      for (let i = 0; i < Math.min(count, 5) && !booked; i += 1) {
        await page.goto("/explore");
        await page.locator("a.hostel-row").nth(i).click();
        await expect(page).toHaveURL(/\/hostel\//);

        await page.locator('input[name="in"]').fill(dayFromNow(20));
        await page.locator('input[name="out"]').fill(dayFromNow(23));
        await page.getByRole("button", { name: /Update availability/i }).click();

        const book = page.getByRole("button", { name: /^Book · / }).first();
        if ((await book.count()) === 0 || !(await book.isEnabled())) continue;
        await book.click();
        booked = true;
      }
      expect(booked, "no hostel had a bed free to book").toBe(true);

      await expect(page).toHaveURL(/\/booking\//);
      await page.getByRole("button", { name: /^Pay .*\(sandbox\)$/ }).click();
      await expect(page.getByText(/^Paid · /)).toBeVisible();
    });

    await test.step("the stay shows up in trips", async () => {
      await page.goto("/trips");
      await expect(page.locator("h1.page-title")).toHaveText(/Your trips/i);
      await expect(page.locator(".booking-card").first()).toBeVisible();
    });

    // -------------------------------------------------------------- safety
    await test.step("shares the night with a friend who is not on Away", async () => {
      await page.goto("/safe");
      await page.locator("#safe-plan").fill("Sagres sunset, then the beach bar");
      await page.locator("#safe-back").fill(localDateTimeIn(6));
      await page.locator("#safe-friend").fill("Sam");
      await page.getByRole("button", { name: /Create my link/i }).click();
      await expect(page.getByText(/Link ready/i)).toBeVisible();
      await page.getByRole("button", { name: /I'm home safe/i }).first().click();
      await expect(page.getByText(/Home safe/i).first()).toBeVisible();
    });

    // ------------------------------------------------- applicant, not staff
    await test.step("a hostel applies, in a city Away has never heard of", async () => {
      await signOut(page);
      await page.goto("/partner");

      await page.locator("#hostelName").fill(HOSTEL.name);
      await page.locator("#city").selectOption("other");
      await page.locator("#cityName").fill(CITY.name);
      await page.locator("#cityCountry").fill(CITY.country);
      await page.locator("#cityTz").selectOption(CITY.tz);
      await page.locator("#area").fill(HOSTEL.area);
      await page.locator("#beds").fill(HOSTEL.beds);
      await page
        .locator("#description")
        .fill("Twelve minutes from Meia Praia, roof terrace, breakfast until eleven, kayaks to borrow.");
      await page.locator("#price").fill(HOSTEL.price);
      await page.locator("#contactName").fill(HOSTEL.contact);
      await page.locator("#email").fill(HOSTEL.email);
      await page.locator("#password").fill(HOSTEL.password);
      await page.getByRole("button", { name: "Apply to join" }).click();

      // The confirmation names the city they just created, and the bar it has to clear.
      await expect(page.getByText(new RegExp(`${CITY.name} is on the list now`, "i"))).toBeVisible();
      await expect(page.getByText(/first hostel/i)).toBeVisible();
    });

    await test.step("the applicant is pending, and the public city page says so", async () => {
      await page.goto("/hostel-admin");
      // A pending hostel has no portal yet: it is sent to its application.
      await expect(page.getByText(/still in review|Application received/i).first()).toBeVisible();

      await page.goto(`/c/${CITY.slug}`);
      await expect(page.locator("h1.page-title")).toContainText(new RegExp(`${CITY.name} is opening`, "i"));
      // Applying is not approval: the city still counts nothing as a partner.
      await expect(page.getByText(/PARTNER HOSTELS/i)).toBeVisible();
      await expect(page.getByText(/0\s*\/\s*3/).first()).toBeVisible();
    });

    // ------------------------------------------------------------------ ops
    await test.step("ops approves the application", async () => {
      await signOut(page);
      await signInAsDemo(page, "Away Ops");

      await page.goto("/admin/cities");
      await page.getByRole("link", { name: new RegExp(CITY.name, "i") }).first().click();
      await expect(page).toHaveURL(new RegExp(`/admin/cities/${CITY.slug}`));

      const row = page.locator(".admin-row", { hasText: HOSTEL.name });
      const approve = row.getByRole("button", { name: "Approve" });
      await expect(approve).toBeVisible();
      await approve.click();
      // Approved hostels leave the queue; the row is no longer an application.
      await expect(row.getByRole("button", { name: "Approve" })).toHaveCount(0);
      await expect(page).toHaveURL(/[?&]approved=/);
    });

    // ----------------------------------------------------------- front desk
    await test.step("the approved hostel signs in and posts tonight", async () => {
      await signOut(page);
      await signInWithPassword(page, HOSTEL.email, HOSTEL.password);

      await page.goto("/hostel-admin");
      await expect(page.locator("h1.page-title")).toContainText(HOSTEL.name);
      await expect(page.getByText(/Your plan/i)).toBeVisible();

      await page.goto("/post");
      const title = `Sunset paddle ${STAMP}`;
      await page.locator("#title").fill(title);
      await page.locator("#time").fill("18:30");
      await page.locator("#price").fill("Free");
      await page.locator("#category").selectOption("outdoors");
      await page.locator("#description").fill("Two kayaks, one sunset. Meet at the gate.");
      await page.getByRole("button", { name: /Publish to .* travellers/i }).click();
      await expect(page).toHaveURL(/\/event\/\d+\?posted=1/, { timeout: 20_000 });
      await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    });

    // ----------------------------------------------------- gated, then paid
    await test.step("the reception screen is locked while the hostel is free", async () => {
      // The kit is free for everybody and links to the screen, which is not.
      await page.goto(`/hostel/${HOSTEL.slug}/kit`);
      await expect(page.getByRole("link", { name: /Reception screen/i })).toBeVisible();

      await page.goto(`/hostel/${HOSTEL.slug}/board`);
      await expect(page.getByText(/part of Away Pro/i)).toBeVisible();
      await expect(page.getByRole("link", { name: /See what Pro is/i })).toBeVisible();
    });

    await test.step("the hostel starts paying for Pro through the checkout", async () => {
      await page.goto("/hostel-admin");
      await page.getByRole("button", { name: /Turn on Pro/i }).click();

      // Sandbox provider: the checkout is ours and says so.
      await expect(page.getByText(/no card/i).first()).toBeVisible();
      await page.getByRole("button", { name: /Confirm — start Pro/i }).click();

      await expect(page).toHaveURL(/billing=activated/);
      await expect(page.getByText(/Pro is on/i)).toBeVisible();
      await expect(page.getByText(/renews \d{4}-\d{2}-\d{2}/i)).toBeVisible();
    });

    await test.step("Pro unlocks the screen, and the hostel can cancel in one click", async () => {
      await page.goto(`/hostel/${HOSTEL.slug}/board`);
      await expect(page.getByText(/part of Away Pro/i)).toHaveCount(0);
      await expect(page.getByText(/Scan to join in/i)).toBeVisible();

      await page.goto("/hostel-admin");
      await page.getByRole("button", { name: /Cancel Pro/i }).click();
      await expect(page.getByText(/Cancelled/i).first()).toBeVisible();
      await expect(page.getByText(/Pro · ending|keeps Pro until/i).first()).toBeVisible();
    });

    // ------------------------------------------------------- closing the loop
    await test.step("the city page now counts one approved partner", async () => {
      await signOut(page);
      await page.goto(`/c/${CITY.slug}`);
      await expect(page.getByText(/PARTNER HOSTELS/i)).toBeVisible();
      await expect(page.getByText(/1\/3|1 \/ 3/i).first()).toBeVisible();
    });
  });

  test("a paid booking can be cancelled and the money comes back", async ({ page }) => {
    await signInAsDemo(page, "Marta K.");

    await page.goto("/explore");
    const hostels = page.locator("a.hostel-row");
    const count = await hostels.count();

    let opened = false;
    for (let i = 0; i < Math.min(count, 5) && !opened; i += 1) {
      await page.goto("/explore");
      await page.locator("a.hostel-row").nth(i).click();
      await page.locator('input[name="in"]').fill(dayFromNow(30));
      await page.locator('input[name="out"]').fill(dayFromNow(32));
      await page.getByRole("button", { name: /Update availability/i }).click();
      const book = page.getByRole("button", { name: /^Book · / }).first();
      if ((await book.count()) === 0 || !(await book.isEnabled())) continue;
      await book.click();
      opened = true;
    }
    expect(opened, "no bed was free to book").toBe(true);

    await page.getByRole("button", { name: /^Pay .*\(sandbox\)$/ }).click();
    await expect(page.getByText(/^Paid · /)).toBeVisible();

    await page.getByRole("button", { name: /Cancel booking/i }).click();
    await expect(page.getByText(/Refunded|Cancelled/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
