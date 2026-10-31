import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { runTicketmasterIngest } from "@/lib/ingest";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.INGEST_TOKEN ?? "dev-ingest";
  const supplied = request.headers.get("x-ingest-token");
  const user = await getCurrentUser();

  const allowed = supplied === expected || user?.role === "admin";
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
