import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { runDigest } from "@/lib/digest";
import { runHostelWeek } from "@/lib/hostel-week";

export const dynamic = "force-dynamic";

/**
 * Cron entry point for the arrivals digest.
 *
 * Like ingest, there is no fallback token in production: a job that emails real
 * travellers must not be triggerable by anyone who reads this repository.
 */
export async function POST(request: Request) {
  const expected =
    process.env.DIGEST_TOKEN ?? (process.env.NODE_ENV === "production" ? null : "dev-digest");
  const supplied = request.headers.get("x-digest-token");
  const user = await getCurrentUser();

  const tokenOk =
    expected !== null &&
    supplied !== null &&
    supplied.length === expected.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  const allowed = tokenOk || user?.role === "admin";
  if (!allowed) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean; hostels?: boolean };

  // Two audiences, one cron entry point: travellers before they land, hostels
  // after they posted. `{ "hostels": true }` runs the second instead of the first.
  if (body.hostels) {
    const week = await runHostelWeek({ dryRun: Boolean(body.dryRun) });
    revalidatePath("/admin/digest");
    return NextResponse.json(
      {
        scope: "hostels",
        dryRun: Boolean(body.dryRun),
        considered: week.considered,
        sent: week.sent,
        results: week.results.map((r) => ({
          hostel: r.week.name,
          email: r.week.email,
          week: r.week.weekKey,
          status: r.status,
          note: r.note,
          subject: r.subject,
          // A dry run is a preview, so it carries the words. A real send does
          // not: the log already knows what went.
          ...(body.dryRun ? { body: r.text } : {}),
        })),
      },
      { status: week.results.some((r) => r.status === "failed") ? 502 : 200 }
    );
  }

  const result = await runDigest({ dryRun: Boolean(body.dryRun) });

  revalidatePath("/admin/digest");
  return NextResponse.json({
    considered: result.considered,
    sent: result.sent,
    results: result.results.map((r) => ({
      traveller: r.trip.name,
      email: r.trip.email,
      city: r.trip.cityName,
      window: `${r.trip.startsOn} → ${r.trip.endsOn}`,
      status: r.status,
      note: r.note,
    })),
  });
}
