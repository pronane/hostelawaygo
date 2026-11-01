/**
 * The weekly arrivals digest.
 *
 * The point of NEXT is that it knows your dates. This is that knowledge
 * arriving on time: a few days before you land — or on day one of a long stay —
 * one email with the things on while you're actually there, at walking distance
 * from the bed you booked.
 *
 * Two rules make it safe to run from cron:
 *   - one send per trip, enforced by a unique key, so a re-run can't spam;
 *   - nothing is sent for a trip where there is nothing on, because an empty
 *     digest is worse than silence.
 */

import { getDb } from "./db";
import { appUrl, sendMail } from "./mail";
import { getCityEvents } from "./queries";
import { addDays, formatDay, timeOf, todayISO } from "./time";
import { formatPrice } from "./format";

export type DigestTrip = {
  travellerId: number;
  name: string;
  email: string;
  tripId: number;
  city: string;
  cityName: string;
  startsOn: string;
  endsOn: string;
  hostelName: string | null;
  key: string;
};

export type DigestItem = {
  id: number;
  title: string;
  day: string;
  time: string;
  venue: string;
  emoji: string;
  price: string;
  walk: string;
  hostelName: string | null;
};

export type Digest = DigestTrip & {
  subject: string;
  text: string;
  html: string;
  items: DigestItem[];
  days: { date: string; items: DigestItem[] }[];
};

/** Only live cities, verified addresses, and trips that haven't finished. */
export async function digestAudience(withinDays = 7): Promise<DigestTrip[]> {
  const today = todayISO();
  return (await getDb()
    .prepare(
      `SELECT t.id AS travellerId, t.name, t.email,
         tr.id AS tripId, tr.city, COALESCE(c.name, tr.city) AS cityName,
         tr.starts_on AS startsOn, tr.ends_on AS endsOn, h.name AS hostelName
       FROM trips tr
       JOIN travellers t ON t.id = tr.traveller_id
       JOIN cities c ON c.slug = tr.city AND c.status = 'live'
       LEFT JOIN hostels h ON h.id = tr.hostel_id
       WHERE t.email IS NOT NULL AND t.email_verified_at IS NOT NULL
         AND tr.ends_on >= @today AND tr.starts_on <= @horizon
       ORDER BY tr.starts_on ASC, t.id ASC`
    )
    .all<Omit<DigestTrip, "key">>({ today, horizon: addDays(today, withinDays) }))
    .map((row) => ({ ...row, key: `${row.city}:${row.startsOn}` }));
}

export function digestAlreadySent(trip: DigestTrip): boolean {
  return Boolean(
    getDb()
      .prepare("SELECT 1 AS x FROM digest_sends WHERE traveller_id = ? AND trip_key = ? AND status = 'sent'")
      .get(trip.travellerId, trip.key)
  );
}

async function recordSend(trip: DigestTrip, status: "sent" | "unsent" | "empty", note = ""): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO digest_sends (traveller_id, trip_key, sent_at, status, note)
       VALUES (@travellerId, @key, datetime('now'), @status, @note)
       ON CONFLICT (traveller_id, trip_key)
       DO UPDATE SET sent_at = datetime('now'), status = @status, note = @note`
    )
    .run({ travellerId: trip.travellerId, key: trip.key, status, note: note.slice(0, 200) });
}

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The digest for one trip, or null when there is nothing worth sending. */
export async function buildDigest(trip: DigestTrip): Promise<Digest | null> {
  const today = todayISO();
  const from = trip.startsOn > today ? trip.startsOn : today;
  if (from > trip.endsOn) return null;

  const events = (await getCityEvents(trip.city, from, trip.endsOn, trip.travellerId))
    .filter((e) => !e.isJoined && e.open_to_all === 1)
    .slice(0, 8);

  if (events.length === 0) return null;

  const firstName = trip.name.split(" ")[0];
  const nights = Math.max(1, daysBetween(trip.startsOn, trip.endsOn));
  const where = trip.hostelName ?? `your stay in ${trip.cityName}`;

  const items: DigestItem[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    day: event.starts_at.slice(0, 10),
    time: timeOf(event.starts_at),
    venue: event.venue.split(" · ")[0],
    emoji: event.emoji,
    price: event.price_cents === 0 ? "Free" : formatPrice(event.price_cents, event.currency),
    walk: event.walk_minutes === 0 ? "at your hostel" : `${event.walk_minutes} min walk`,
    hostelName: event.hostel_name ?? null,
  }));

  const dayMap = new Map<string, DigestItem[]>();
  for (const item of items) {
    const list = dayMap.get(item.day) ?? [];
    list.push(item);
    dayMap.set(item.day, list);
  }
  const days = [...dayMap.entries()].map(([date, list]) => ({ date, items: list }));

  const subject = `${firstName}, ${items.length === 1 ? "one thing" : `${items.length} things`} on while you're in ${trip.cityName}`;

  const text = [
    `You're at ${where} for ${nights} night${nights === 1 ? "" : "s"} — here's what's on while you're there.`,
    "",
    ...days.flatMap((day) => [
      formatDay(day.date).toUpperCase(),
      ...day.items.map(
        (item) => `  ${item.time} · ${item.title} (${item.venue}, ${item.walk}) — ${item.price}`
      ),
      "",
    ]),
    `Open your trip: ${appUrl()}/next`,
    "",
    "You get one of these per stay. Joining something takes a tap and an account.",
  ].join("\n");

  const esc = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4efe9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#191310">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe9;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #ede3d8;border-radius:18px;padding:26px">
  <tr><td>
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#a8887a;font-weight:700">Away · your trip</p>
    <h1 style="margin:0 0 8px;font-size:26px;line-height:1.1;letter-spacing:-.02em">${esc(trip.cityName)}, ${nights} night${nights === 1 ? "" : "s"}</h1>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#6b5a4d">
      You're at <b>${esc(where)}</b>. Here's ${items.length === 1 ? "the one thing" : `${items.length} things`} on while you're there — ${from === today ? "starting tonight" : `from ${esc(formatDay(from))}`}.
    </p>
    ${days
      .map(
        (day) => `<p style="margin:18px 0 6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#a8887a;font-weight:800">${esc(formatDay(day.date))}</p>
      ${day.items
        .map(
          (item) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f1e9e0"><tr>
        <td style="padding:10px 0;font-size:12px;color:#7b6e64;white-space:nowrap;vertical-align:top">${esc(item.time)}</td>
        <td style="padding:10px 0 10px 12px;font-size:13px;line-height:1.45">
          <b>${item.emoji} ${esc(item.title)}</b><br>
          <span style="color:#7b6e64;font-size:11.5px">${esc(item.venue)} · ${esc(item.walk)} · ${esc(item.price)}</span>
        </td></tr></table>`
        )
        .join("")}`
      )
      .join("")}
    <p style="margin:22px 0 0">
      <a href="${appUrl()}/next" style="display:inline-block;background:#191310;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700">See the whole week</a>
    </p>
    <p style="margin:18px 0 0;font-size:11px;line-height:1.6;color:#a8887a">
      One email per stay, sent a few days before you arrive. Everything here is within walking distance of the bed you booked.
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { ...trip, subject, text, html, items, days };
}

export type DigestResult = {
  trip: DigestTrip;
  status: "sent" | "preview" | "empty" | "sent-already" | "unsent";
  note: string;
  digest: Digest | null;
};

/**
 * Runs the job. `dryRun` builds and returns the digests without sending or
 * recording anything, which is what the console's preview uses.
 */
export async function runDigest({
  dryRun = false,
  withinDays = 7,
}: { dryRun?: boolean; withinDays?: number } = {}): Promise<{
  considered: number;
  sent: number;
  results: DigestResult[];
}> {
  const audience = await digestAudience(withinDays);
  const results: DigestResult[] = [];
  let sent = 0;

  for (const trip of audience) {
    if (digestAlreadySent(trip)) {
      results.push({ trip, status: "sent-already", note: "already sent for this trip", digest: null });
      continue;
    }

    const digest = await buildDigest(trip);
    if (!digest) {
      results.push({ trip, status: "empty", note: "nothing on in the window — staying quiet", digest: null });
      if (!dryRun) await recordSend(trip, "empty", "nothing on in the window");
      continue;
    }

    if (dryRun) {
      results.push({ trip, status: "preview", note: "preview only", digest });
      continue;
    }

    const { sent: ok } = await sendMail(trip.email, digest.subject, digest.text, digest.html);
    await recordSend(trip, ok ? "sent" : "unsent", ok ? digest.subject : "no mail provider configured");
    if (ok) sent += 1;
    results.push({ trip, status: ok ? "sent" : "unsent", note: ok ? digest.subject : "no mail provider", digest });
  }

  return { considered: audience.length, sent, results };
}

export type DigestSendRow = {
  id: number;
  name: string;
  email: string | null;
  trip_key: string;
  sent_at: string;
  status: string;
  note: string;
};

export async function recentDigestSends(limit = 20): Promise<DigestSendRow[]> {
  return getDb()
    .prepare(
      `SELECT d.id, t.name, t.email, d.trip_key, d.sent_at, d.status, d.note
       FROM digest_sends d JOIN travellers t ON t.id = d.traveller_id
       ORDER BY d.sent_at DESC, d.id DESC LIMIT ?`
    )
    .all<DigestSendRow>(limit);
}
