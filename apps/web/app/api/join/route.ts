import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEvent, toggleJoin } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to join" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = Number((body as { eventId?: unknown } | null)?.eventId);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  if (!getEvent(eventId, user.id)) {
    return NextResponse.json({ error: "Unknown event" }, { status: 404 });
  }

  return NextResponse.json(toggleJoin(eventId, user.id));
}
