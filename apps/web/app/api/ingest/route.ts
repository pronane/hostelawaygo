import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { runTicketmasterIngest } from "@/lib/ingest";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // No hard-coded fallback in production: "dev-ingest" is in the repo, so it let
  // anyone trigger ingests (and burn the Ticketmaster quota).
  const expected =
    process.env.INGEST_TOKEN ?? (process.env.NODE_ENV === "production" ? null : "dev-ingest");
  const supplied = request.headers.get("x-ingest-token");
  const user = await getCurrentUser();

  const tokenOk =
    expected !== null &&
    supplied !== null &&
    supplied.length === expected.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  const allowed = tokenOk || user?.role === "admin";
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const summary = await runTicketmasterIngest();

  revalidatePath("/");
  revalidatePath("/next");
  revalidatePath("/explore");
  revalidatePath("/admin/ingest");

  return NextResponse.json(summary);
}
