import { expect, test } from "@playwright/test";
import { signInAsDemo } from "./helpers";

test.describe("the hostel front desk", () => {
  test("a staff member publishes something and it lands in the feed", async ({ page }) => {
    await signInAsDemo(page, "Ana Ribeiro");

    await page.goto("/post");
    const title = `E2E sunset walk ${Date.now()}`;

    await page.locator("#title").fill(title);
    await page.locator("#time").fill("19:30");
    await page.locator("#price").fill("Free");
    await page.locator("#category").selectOption("outdoors");
    await page.locator("#description").fill("Meet in the lobby. Bring a jacket.");

    const publish = page.getByRole("button", { name: /Publish to .* travellers/i });
    await expect(publish).toBeEnabled();
    await publish.click();

    await expect(page).toHaveURL(/\/event\/\d+\?posted=1/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);

    // What the desk publishes is what travellers see.
    await page.goto("/");
    await expect(page.getByText(title).first()).toBeVisible();
  });
});

test.describe("ops", () => {
  test("approves a hostel, previews the digest, and sees the ingest console", async ({ page }) => {
    await signInAsDemo(page, "Away Ops");

    await page.goto("/admin/cities");
    await expect(page.locator("h1.page-title")).toHaveText(/Cities/i);
    await expect(page.getByRole("heading", { name: /Waiting for a decision/i })).toBeVisible();

    // The seeded application from Casa do Sol.
    await page.getByRole("link", { name: /Casa do Sol/i }).first().click();
    await expect(page).toHaveURL(/\/admin\/cities\/lisbon/);

    const approve = page.getByRole("button", { name: "Approve" });
    await expect(approve.first()).toBeVisible();
    await approve.first().click();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

    // The approved hostel is bookable, not just ticked off a list.
    await page.goto("/explore");
    await expect(page.getByText(/Casa do Sol/i).first()).toBeVisible();

    await page.goto("/admin/digest");
    await page.getByRole("link", { name: /Preview the next one/i }).click();
    await expect(page).toHaveURL(/preview=1/);
    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();

    await page.goto("/admin/ingest");
    await expect(page.locator("h1.page-title")).toHaveText(/Ingest/i);
  });
});
