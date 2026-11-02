import { getDb } from "./db";
import { mailEnabled, sendMail } from "./mail";
import { appUrl } from "./constants";
import { addDays, formatDay, timeOf, todayISO } from "./time";
import { plural } from "./format";

/**
 * The weekly note to a hostel: what it put on, who came, and what the QR did.
 *
 * Travellers get the arrivals digest (`lib/digest.ts`) — one email before you
 * land, because that is the moment a trip is still changeable. Hostels get this
 * one, for the opposite reason: an owner who posted three nights in March and
 * stopped needs to see, in numbers, that the third night worked. Retention here
 * is not a newsletter, it is a receipt.
 *
 * Two rules keep it from becoming noise:
 *   - it only goes to a hostel that did something in the window (posted a night,
 *     or had somebody scan its QR). Silent inboxes stay silent.
 *   - one email per hostel per week, enforced with the same `digest_sends` table
 *     the traveller digest uses, keyed `hostel:<id>:<iso-week>`.
 */

export type HostelNight = {
  id: number;
  title: string;
  startsAt: string;
  going: number;
  cancelled: boolean;
};

export type HostelWeek = {
  hostelId: number;
  name: string;
  slug: string;
  area: string;
  email: string | null;
  staffId: number | null;
  weekKey: string;
  /** Nights that already happened in the last seven days. */
  nights: HostelNight[];
  /** Poster scans, joins and beds booked through the QR in the same window. */
  scans: number;
  joined: number;
  booked: number;
  /** What is already on for the next seven days. */
  upcoming: number;
  upcomingGoing: number;
};

/** `2026-W45` — the unit a hostel email is sent once per. */
export function weekKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function hostelWeek(hostelId: number, now = new Date()): Promise<HostelWeek | null> {
  const db = getDb();
  const hostel = await db
    .prepare("SELECT id, name, slug, area, status FROM hostels WHERE id = ?")
    .get<{ id: number; name: string; slug: string; area: string; status: string }>(hostelId);
  if (!hostel) return null;

  const today = todayISO();
  const from = addDays(today, -7);

  // The person to write to: the front desk account if there is one, otherwise
  // the address the application came from.
  const staff = await db
    .prepare(
      `SELECT t.id, t.email FROM travellers t
       WHERE t.hostel_id = ? AND t.role = 'hostel_staff' AND t.email IS NOT NULL
       ORDER BY t.id LIMIT 1`
    )
    .get<{ id: number; email: string }>(hostelId);

  const nights = await db
    .prepare(
      `SELECT e.id, e.title, e.starts_at AS startsAt, e.cancelled,
         (SELECT COUNT(*) FROM joins j WHERE j.event_id = e.id) AS going
       FROM events e
       WHERE e.hostel_id = @hostelId AND e.starts_at >= @from AND e.starts_at < @until
       ORDER BY e.starts_at ASC`
    )
    .all<{ id: number; title: string; startsAt: string; cancelled: number; going: number }>({
      hostelId,
      from,
      until: `${addDays(today, 1)} 00:00`,
    });

  const arrivals = (await db
    .prepare(
      `SELECT COUNT(*) AS scans,
         COALESCE(SUM(CASE WHEN joined_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS joined,
         COALESCE(SUM(CASE WHEN booked_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS booked
       FROM arrivals WHERE hostel_id = ? AND day >= ?`
    )
    .get<{ scans: number; joined: number; booked: number }>(hostelId, from))!;

  const ahead = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM events
       WHERE hostel_id = @hostelId AND cancelled = 0
         AND starts_at >= @today AND starts_at < @until`
    )
    .get<{ n: number }>({ hostelId, today, until: addDays(today, 7) }))!.n;

  const aheadGoing = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM joins j JOIN events e ON e.id = j.event_id
       WHERE e.hostel_id = @hostelId AND e.cancelled = 0
         AND e.starts_at >= @today AND e.starts_at < @until`
    )
    .get<{ n: number }>({ hostelId, today, until: addDays(today, 7) }))!.n;

  return {
    hostelId,
    name: hostel.name,
    slug: hostel.slug,
    area: hostel.area,
    email: staff?.email ?? null,
    staffId: staff?.id ?? null,
    weekKey: weekKey(now),
    nights: nights.map((n) => ({ ...n, cancelled: Boolean(n.cancelled) })),
    scans: arrivals.scans,
    joined: arrivals.joined,
    booked: arrivals.booked,
    upcoming: ahead,
    upcomingGoing: aheadGoing,
  };
}

/** True when this hostel has nothing to report — no nights, nobody scanned. */
export function isQuiet(week: HostelWeek): boolean {
  return week.nights.length === 0 && week.scans === 0;
}

export function composeHostelWeek(week: HostelWeek, base: string): { subject: string; text: string } {
  const lived = week.nights.filter((n) => !n.cancelled);
  const people = lived.reduce((sum, n) => sum + n.going, 0);

  const subject =
    lived.length === 0
      ? `${week.name}: your QR got ${plural(week.scans, "scan")} last week`
      : `${week.name}: ${plural(lived.length, "night")}, ${plural(people, "person", "people")} said they'd come`;

  const lines: string[] = [`Hi ${week.name},`, ""];

  if (lived.length === 0) {
    lines.push(
      "You didn't post anything last week — which is fine, but it's the one thing",
      "that decides whether the feed does anything for you. Two minutes tonight:",
      `${base}/post`,
      ""
    );
  } else {
    lines.push("What you put on, and how many said they were coming:");
    for (const night of lived) {
      lines.push(
        `  ${formatDay(night.startsAt.slice(0, 10))} ${timeOf(night.startsAt)} — ${night.title} · ${night.going} going`
      );
    }
    lines.push("");
  }

  if (week.scans > 0) {
    lines.push(
      "The poster at your door, last seven days:",
      `  ${plural(week.scans, "scan")} → ${week.joined} joined → ${week.booked} ${week.booked === 1 ? "bed" : "beds"} booked`,
      ""
    );
  }

  if (week.upcoming > 0) {
    lines.push(
      `Already on for the next seven days: ${plural(week.upcoming, "night")}, ${plural(week.upcomingGoing, "person", "people")} going.`,
      ""
    );
  } else {
    lines.push(
      "Nothing is on for the next seven days. Guests open the feed tonight and see",
      "the city's events, not yours — the whole point is that yours come first.",
      `${base}/post`,
      ""
    );
  }

  lines.push(
    "A guest arriving today sees your nights before anything else in the city.",
    `${base}/hostel/${week.slug}`,
    "",
    "—",
    `You get this because you run ${week.name} on Away. One email a week, and only`,
    "when something happened.",
    `${base}/partner`
  );

  return { subject, text: lines.join("\n") };
}

export type HostelWeekResult = {
  week: HostelWeek;
  status: "sent" | "preview" | "skipped" | "sent-already" | "no-address" | "failed";
  note: string;
  subject: string;
  text: string;
};

/**
 * One pass over every live hostel. `dryRun` composes everything and sends
 * nothing, which is also what a build without `RESEND_API_KEY` does — the words
 * are still written, so an operator can read before a key exists.
 */
export async function runHostelWeek(opts: { dryRun?: boolean } = {}): Promise<{
  considered: number;
  sent: number;
  results: HostelWeekResult[];
}> {
  const db = getDb();
  const base = appUrl();
  const hostels = await db
    .prepare("SELECT id FROM hostels WHERE status = 'active' ORDER BY id")
    .all<{ id: number }>();

  const results: HostelWeekResult[] = [];
  let sent = 0;

  for (const { id } of hostels) {
    const week = await hostelWeek(id);
    if (!week) continue;

    if (!week.staffId || !week.email) {
      results.push({ week, status: "no-address", note: "no front desk account to write to", subject: "", text: "" });
      continue;
    }
    if (isQuiet(week)) {
      results.push({ week, status: "skipped", note: "nothing happened — staying quiet", subject: "", text: "" });
      continue;
    }

    const key = `hostel:${week.hostelId}:${week.weekKey}`;
    if (await db.prepare("SELECT 1 AS x FROM digest_sends WHERE traveller_id = ? AND trip_key = ?").get(week.staffId, key)) {
      results.push({ week, status: "sent-already", note: `already sent for ${week.weekKey}`, subject: "", text: "" });
      continue;
    }

    const { subject, text } = composeHostelWeek(week, base);

    if (opts.dryRun || !mailEnabled()) {
      results.push({
        week,
        status: "preview",
        note: opts.dryRun ? "dry run" : "RESEND_API_KEY is not set",
        subject,
        text,
      });
      continue;
    }

    const result = await sendMail(week.email, subject, text);
    if (!result.sent) {
      results.push({ week, status: "failed", note: "the mail provider refused it", subject, text });
      continue;
    }

    await db
      .prepare("INSERT INTO digest_sends (traveller_id, trip_key, status, note) VALUES (@staff, @key, 'sent', @note)")
      .run({ staff: week.staffId, key, note: `hostel week ${week.weekKey}` });
    sent += 1;
    results.push({ week, status: "sent", note: week.email, subject, text });
  }

  return { considered: hostels.length, sent, results };
}
