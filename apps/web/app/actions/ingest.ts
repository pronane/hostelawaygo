"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { runTicketmasterIngest } from "@/lib/ingest";

export async function runIngestAction() {
  await requireAdmin("/admin/ingest");
  const summary = await runTicketmasterIngest();

  revalidatePath("/admin/ingest");
  revalidatePath("/");
  revalidatePath("/next");
  revalidatePath("/explore");

  redirect(`/admin/ingest?ran=${summary.runId}&mode=${summary.mode}`);
}
