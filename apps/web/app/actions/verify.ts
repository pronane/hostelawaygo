"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendVerification } from "@/lib/verify";

export async function resendVerificationAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/you");
  if (user.email_verified || !user.email) redirect("/you");

  // One email a minute is plenty; stops the button being used to spam an inbox.
  const recent = await getDb()
    .prepare(
      "SELECT 1 AS x FROM email_tokens WHERE traveller_id = ? AND expires_at > ? AND used_at IS NULL"
    )
    .get<{ x: number }>(user.id, new Date(Date.now() + (48 * 60 - 1) * 60_000).toISOString());
  if (recent) redirect("/you?verify=wait");

  const h = await headers();
  const origin = h.get("origin") ?? undefined;
  const { sent, devLink } = await sendVerification(user.id, user.email, origin);
  if (devLink) redirect(`/you?verify=dev&link=${encodeURIComponent(devLink)}`);
  redirect(`/you?verify=${sent ? "sent" : "failed"}`);
}
