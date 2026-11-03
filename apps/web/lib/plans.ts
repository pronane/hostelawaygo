import { todayISO } from "./time";

/**
 * What a hostel gets, and what it pays for.
 *
 * The free tier is not a trial. A city with three free hostels that post is
 * worth more than a city with one paying one — density is the product — so the
 * things that spread Away (the listing, posting, the QR kit, the chat) are free
 * forever, and Pro sells what only exists *after* a hostel posts: the numbers
 * that prove the night worked, and the screen that shows tonight from the desk.
 *
 * Nothing here is enforced by a paywall library: `isPro()` is a date check, and
 * each Pro surface asks it.
 */

export type Plan = "free" | "pro";
export type Interval = "month" | "year";

export const PRICE_CENTS: Record<Interval, number> = { month: 1900, year: 19000 };

export const PLAN_COPY = {
  free: {
    name: "Free",
    price: "€0",
    cadence: "forever",
    blurb: "Everything a hostel needs to be findable and to post tonight.",
    features: [
      "Your hostel's page, rooms and nightly price",
      "Post a night in about a minute, from a template",
      "The partner kit: poster, dorm sticker, check-in lines",
      "Guest chat on your nights, moderated by you",
      "Your QR, and how many people scanned it",
    ],
  },
  pro: {
    name: "Pro",
    price: "€19",
    per: "a month",
    cadence: "or €190 a year",
    blurb: "For hostels that post: the receipt, and the screen behind the desk.",
    features: [
      "Everything in Free",
      "The reception screen — tonight, live, on the tablet at the desk",
      "The weekly receipt: nights, joins, scans → joined → beds, by email",
      "Guest-only nights promoted to your own guests first",
      "Cancel yourself, any time, no email to anybody",
    ],
  },
} as const;

export type HostelPlanFields = {
  plan?: string | null;
  plan_interval?: string | null;
  plan_renews_on?: string | null;
  plan_since?: string | null;
  plan_cancelled?: number | null;
};

/**
 * True while the subscription is paid up. A cancelled subscription keeps Pro
 * until the renewal date — nobody loses what they paid for by pressing cancel,
 * and nothing has to run at midnight to take it away.
 */
export function isPro(hostel: HostelPlanFields | null | undefined, today = todayISO()): boolean {
  if (!hostel || hostel.plan !== "pro") return false;
  if (!hostel.plan_renews_on) return true;
  return hostel.plan_renews_on >= today;
}

export function planLabel(hostel: HostelPlanFields | null | undefined): string {
  if (isPro(hostel)) return hostel?.plan_cancelled ? "Pro · ending" : "Pro";
  return "Free";
}

/** The date a renewal would land on, from today. */
export function renewalDate(interval: Interval, from = new Date()): string {
  const d = new Date(from.getTime());
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
