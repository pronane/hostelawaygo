import { NextResponse } from "next/server";
import { consumeVerification } from "@/lib/verify";

export const dynamic = "force-dynamic";

/** Landing for the link in the verification email. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ok = await consumeVerification(url.searchParams.get("token") ?? "") !== null;
  return NextResponse.redirect(new URL(`/you?verified=${ok ? "1" : "0"}`, url.origin), 303);
}
