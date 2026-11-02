"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { runDigest } from "@/lib/digest";
import { runHostelWeek } from "@/lib/hostel-week";

/** Sends for real. The preview is a GET (`/admin/digest?preview=1`), not a POST. */
export async function sendDigestAction() {
  await requireAdmin("/admin/digest");
  const result = await runDigest({ dryRun: false });
  revalidatePath("/admin/digest");
  redirect(`/admin/digest?sent=${result.sent}&considered=${result.considered}`);
}

/**
 * The other half of the same page: last week, to the hostels.
 *
 * Separate button on purpose. A traveller email is a courtesy before a trip; a
 * hostel email is the retention loop, and one is never sent by accident while
 * firing the other.
 */
export async function sendHostelWeekAction() {
  await requireAdmin("/admin/digest");
  const result = await runHostelWeek({ dryRun: false });
  revalidatePath("/admin/digest");
  redirect(`/admin/digest?hostelSent=${result.sent}&hostelConsidered=${result.considered}`);
}
