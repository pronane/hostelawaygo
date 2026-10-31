"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { runDigest } from "@/lib/digest";

/** Sends for real. The preview is a GET (`/admin/digest?preview=1`), not a POST. */
export async function sendDigestAction() {
  await requireAdmin("/admin/digest");
  const result = await runDigest({ dryRun: false });
  revalidatePath("/admin/digest");
  redirect(`/admin/digest?sent=${result.sent}&considered=${result.considered}`);
}
