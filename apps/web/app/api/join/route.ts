import { NextResponse } from "next/server";
import { getEvent, toggleJoin } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  if (!getEvent(eventId)) {
    return NextResponse.json({ error: "Unknown event" }, { status: 404 });
  }

  return NextResponse.json(toggleJoin(eventId));
}
