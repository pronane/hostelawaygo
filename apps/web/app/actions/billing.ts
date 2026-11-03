"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveStaff } from "@/lib/auth";
import { activateSubscription, cancelSubscription, startSubscription } from "@/lib/billing";
import { getDb } from "@/lib/db";
import { getHostelBySlug, getHostels } from "@/lib/queries";
import type { Interval } from "@/lib/plans";

async function myHostel() {
  const user = await requireActiveStaff("/hostel-admin");
  const hostel = user.hostel_id
    ? (await getHostels()).find((h) => h.id === user.hostel_id) ??
      (await getHostelBySlug("home-lisbon"))
    : null;
  if (!hostel) redirect("/partner");
  return { user, hostel };
}

/**
 * Sends whoever pressed the button to a checkout. In sandbox mode that is a page
 * on this machine that says it is a sandbox; with Stripe configured it is
 * Stripe's. Neither one switches Pro on — that is the webhook's job, so a person
 * who closes the tab at the wrong moment never gets something for free.
 */
export async function startProAction(formData: FormData) {
  const interval: Interval = formData.get("interval") === "year" ? "year" : "month";
  const { hostel } = await myHostel();

  const checkout = await startSubscription(
    { id: hostel.id, name: hostel.name, contact_email: hostel.contact_email },
    interval
  );

  if (!checkout.ok) redirect(`/hostel-admin?billing=error&why=${encodeURIComponent(checkout.error)}`);
  redirect(checkout.url);
}

/** One click, no email, and Pro keeps running until the date already paid for. */
export async function cancelProAction() {
  const { hostel } = await myHostel();
  const result = await cancelSubscription(hostel.id, "the hostel");
  revalidatePath("/hostel-admin");
  redirect(`/hostel-admin?billing=cancelled&note=${encodeURIComponent(result.note)}`);
}

/**
 * The sandbox checkout's one button.
 *
 * It lives here, not inline in the page, so that the flow a browser uses and the
 * flow a test uses are the same flow: a plain form post with a reference.
 */
export async function confirmSandboxAction(formData: FormData) {
  const reference = String(formData.get("reference") ?? "").slice(0, 80);
  const interval: Interval = formData.get("interval") === "year" ? "year" : "month";
  const user = await requireActiveStaff(`/billing/sandbox/${reference}`);

  const checkout = await getDb()
    .prepare("SELECT hostel_id FROM billing_events WHERE reference = ? AND kind = 'checkout'")
    .get<{ hostel_id: number }>(reference);
  if (!checkout) redirect("/pricing?billing=expired");
  if (user.role !== "admin" && user.hostel_id !== checkout.hostel_id) redirect("/hostel-admin");

  const result = await activateSubscription(reference, interval, "sandbox");
  if (!result.ok) redirect(`/hostel-admin?billing=error&why=${encodeURIComponent(result.note)}`);

  revalidatePath("/hostel-admin");
  revalidatePath("/pricing");
  redirect("/hostel-admin?billing=activated");
}
