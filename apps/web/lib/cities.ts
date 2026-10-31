/**
 * The city launch bar.
 *
 * Opening a new city is the growth engine, so it has to be repeatable rather
 * than bespoke. Every city sits in one of three states, and the move to `live`
 * is refused unless the data says the city is actually worth visiting:
 *
 *   planned  — on the list, nothing built yet
 *   opening  — a city record exists, hostels and events are being filled in
 *   live     — meets every gate below, and shows up in the app
 *
 * The gates are deliberately about *supply density*, not effort. A city where
 * two hostels each post one night is a directory with two entries; a traveller
 * opens it once and never comes back. Anything less than the bar stays hidden.
 */

import type { City, CityStatus } from "./types";

export const CITY_STATUS: Record<
  CityStatus,
  { label: string; tone: "ok" | "warn" | "muted"; blurb: string; verb: string }
> = {
  planned: {
    label: "Planned",
    tone: "muted",
    blurb: "On the expansion list. No city record, no partners, not visible anywhere.",
    verb: "Start opening",
  },
  opening: {
    label: "Opening",
    tone: "warn",
    blurb: "Being filled in. Visible to ops only — travellers can't land here yet.",
    verb: "Go live",
  },
  live: {
    label: "Live",
    tone: "ok",
    blurb: "In the app: picker, explore, city page, sitemap.",
    verb: "Pull back to opening",
  },
};

/** What "launchable" means. Change it here, and every city is re-scored. */
export const LAUNCH_BAR = {
  /** Partner hostels signed in the city. */
  partners: 3,
  /** Of those, hostels that actually posted something recently. */
  postingHostels: 2,
  /** Events in the next fortnight — hostel nights, city listings, ticketed. */
  events: 7,
  windowDays: 14,
} as const;

export type CitySupply = {
  hostels: number;
  postingHostels: number;
  events: number;
  eventsWeek: number;
  joins: number;
  /** Reception QR scans in the last 30 days, across the city. */
  scans: number;
  nextEvent: string | null;
};

export type Gate = {
  key: "record" | "partners" | "posting" | "calendar" | "launch";
  label: string;
  have: string;
  need: string;
  ok: boolean;
  hint: string;
  /** What "pass" means, for the row when it is green. */
  done: string;
};

export function recordComplete(city: Pick<City, "name" | "country" | "tz" | "intro" | "lat" | "lng">): boolean {
  return Boolean(
    city.name.trim() &&
      city.country.trim() &&
      /^[A-Za-z_]+\/[A-Za-z_]+$/.test(city.tz) &&
      city.intro.trim().length >= 20 &&
      Number.isFinite(city.lat) &&
      Number.isFinite(city.lng) &&
      !(city.lat === 0 && city.lng === 0)
  );
}

export function launchGates(city: City, supply: CitySupply): Gate[] {
  const record = recordComplete(city);
  const missingPartners = Math.max(0, LAUNCH_BAR.partners - supply.hostels);
  const missingPosting = Math.max(0, LAUNCH_BAR.postingHostels - supply.postingHostels);
  const missingEvents = Math.max(0, LAUNCH_BAR.events - supply.events);

  return [
    {
      key: "record",
      label: "City record",
      have: record ? "complete" : "incomplete",
      need: "name, country, timezone, centre, intro",
      ok: record,
      hint: "Fill in the timezone, city centre and a one-line intro before anything else.",
      done: "Timezone, centre and intro set",
    },
    {
      key: "partners",
      label: "Partner hostels",
      have: String(supply.hostels),
      need: String(LAUNCH_BAR.partners),
      ok: supply.hostels >= LAUNCH_BAR.partners,
      hint: `Sign ${missingPartners} more hostel${missingPartners === 1 ? "" : "s"} — a city needs three before it feels alive.`,
      done: `${supply.hostels} partner hostels`,
    },
    {
      key: "posting",
      label: "Hostels posting",
      have: String(supply.postingHostels),
      need: String(LAUNCH_BAR.postingHostels),
      ok: supply.postingHostels >= LAUNCH_BAR.postingHostels,
      hint: `${missingPosting} more hostel${missingPosting === 1 ? " needs" : "s need"} a listing up — log in at the front desk and post one night.`,
      done: `${supply.postingHostels} hostels with a listing this fortnight`,
    },
    {
      key: "calendar",
      label: `Events, next ${LAUNCH_BAR.windowDays} days`,
      have: String(supply.events),
      need: String(LAUNCH_BAR.events),
      ok: supply.events >= LAUNCH_BAR.events,
      hint: `${missingEvents} more event${missingEvents === 1 ? "" : "s"} needed — run the ingest and get each partner to post their week.`,
      done: `${supply.events} things to do in the next ${LAUNCH_BAR.windowDays} days`,
    },
    {
      key: "launch",
      label: "Launch date",
      have: city.launch_on ?? "not set",
      need: "a date",
      ok: Boolean(city.launch_on),
      hint: "Pick the Friday you want to hand the city to travellers.",
      done: `Launching ${city.launch_on}`,
    },
  ];
}

export function launchReadiness(gates: Gate[]) {
  const passed = gates.filter((g) => g.ok).length;
  const next = gates.find((g) => !g.ok);
  return {
    passed,
    total: gates.length,
    percent: Math.round((passed / gates.length) * 100),
    canLaunch: passed === gates.length,
    nextAction: next?.hint ?? "Ready. Hand it to travellers.",
    nextGate: next?.key ?? null,
  };
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

/**
 * Status moves are checked in one place so the console and the server action
 * can never disagree — the action re-checks, because a form post is not a
 * trusted client.
 */
export function checkTransition(city: City, to: CityStatus, gates: Gate[]): TransitionCheck {
  if (city.status === to) return { ok: true };

  if (to === "opening") {
    const record = gates.find((g) => g.key === "record")!;
    if (!record.ok) return { ok: false, reason: "The city record is incomplete — no timezone, centre or intro." };
    return { ok: true };
  }

  if (to === "live") {
    const readiness = launchReadiness(gates);
    if (!readiness.canLaunch) return { ok: false, reason: readiness.nextAction };
    return { ok: true };
  }

  return { ok: true };
}

/** A slug we are willing to put in a URL and a QR code. */
export function citySlugFrom(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
