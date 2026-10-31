import fixtureData from "./fixtures/ticketmaster.json";
import {
  finishIngestRun,
  getCities,
  startIngestRun,
  upsertIngestedEvent,
  type IngestedEvent,
} from "./queries";
import { addDays, todayISO } from "./time";
import { coordsForVenue, CITY_CENTRE } from "./geo";

type TmEvent = {
  id?: string;
  name?: string;
  description?: string;
  info?: string;
  pleaseNote?: string;
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string; dayOffset?: number };
  };
  url?: string;
  priceRanges?: { type?: string; min?: number; max?: number; currency?: string }[];
  _embedded?: {
    venues?: {
      name?: string;
      city?: { name?: string };
      location?: { latitude?: string; longitude?: string };
    }[];
  };
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
};

export type IngestSummary = {
  runId: number;
  mode: "live" | "fixture";
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  status: string;
  note: string;
};

const normaliseText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

function citySlugFor(name: string | undefined): string | null {
  if (!name) return null;
  const wanted = normaliseText(name);
  const match = getCities().find((c) => normaliseText(c.name) === wanted);
  return match?.slug ?? null;
}

const STYLES: Record<string, { category: string; emoji: string; cover: [string, string] }> = {
  jazz: { category: "music", emoji: "🎷", cover: ["#D8C7FF", "#8A6BFF"] },
  blues: { category: "music", emoji: "🎸", cover: ["#C9C2FF", "#6C5CE7"] },
  fado: { category: "music", emoji: "🎶", cover: ["#C8B8FF", "#7A5BFF"] },
  rock: { category: "music", emoji: "🎸", cover: ["#FFC9B0", "#E05A3A"] },
  classical: { category: "music", emoji: "🎻", cover: ["#E7D6FF", "#9B7BFF"] },
  cultural: { category: "culture", emoji: "🏛️", cover: ["#BFE3FF", "#5AA9F0"] },
  "fine art": { category: "culture", emoji: "🖼️", cover: ["#CFE8C7", "#4E9B5F"] },
  food: { category: "food", emoji: "🍽️", cover: ["#FFE3B8", "#F5B350"] },
  sport: { category: "outdoors", emoji: "🏟️", cover: ["#CFE8C7", "#4E9B5F"] },
};

function styleFor(raw: TmEvent) {
  const genre = normaliseText(raw.classifications?.[0]?.genre?.name ?? "");
  const segment = normaliseText(raw.classifications?.[0]?.segment?.name ?? "");
  return (
    STYLES[genre] ??
    (segment.includes("music")
      ? STYLES.jazz
      : segment.includes("sport")
        ? STYLES.sport
        : STYLES.cultural)
  );
}

function toIngested(raw: TmEvent): IngestedEvent | null {
  if (!raw.id || !raw.name) return null;

  const city = citySlugFor(raw._embedded?.venues?.[0]?.city?.name);
  if (!city) return null;

  const start = raw.dates?.start;
  const date = start?.localDate ?? addDays(todayISO(), start?.dayOffset ?? 0);
  const time = (start?.localTime ?? "20:00:00").slice(0, 5);
  const venueInfo = raw._embedded?.venues?.[0];
  const venue = venueInfo?.name ?? "Venue TBC";
  const style = styleFor(raw);

  // Ticketmaster gives one range per ticket type; keep the real floor and ceiling.
  const ranges = (raw.priceRanges ?? []).filter(
    (range) => typeof range.min === "number" || typeof range.max === "number"
  );
  const lowest = ranges.length ? Math.min(...ranges.map((r) => r.min ?? r.max ?? 0)) : null;
  const highest = ranges.length ? Math.max(...ranges.map((r) => r.max ?? r.min ?? 0)) : null;
  const currency = ranges[0]?.currency ?? "EUR";

  const lat = Number(venueInfo?.location?.latitude);
  const lng = Number(venueInfo?.location?.longitude);
  const centre = coordsForVenue(venue, city, CITY_CENTRE[city] ?? null);
  const point =
    Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
      ? { lat, lng }
      : centre;

  return {
    city,
    externalId: `tm:${raw.id}`,
    title: raw.name.slice(0, 120),
    description:
      (raw.description ?? raw.info ?? raw.pleaseNote ?? "").slice(0, 600) ||
      `Imported from Ticketmaster. Check the venue's own page for doors, support acts and any changes.`,
    startsAt: `${date}T${time}`,
    durationMin: 150,
    priceCents: lowest ? Math.round(lowest * 100) : 0,
    priceMaxCents: highest ? Math.round(highest * 100) : null,
    currency,
    ticketUrl: raw.url ?? null,
    lat: point.lat,
    lng: point.lng,
    venue,
    category: style.category,
    emoji: style.emoji,
    cover: style.cover,
    walkMinutes: 15,
    tags: ["ticketed", "culture"],
    lens: ["Imported from Ticketmaster", "Check the venue page before you go"],
  };
}

async function fetchLive(apiKey: string): Promise<TmEvent[]> {
  const events: TmEvent[] = [];

  for (const city of getCities().slice(0, 3)) {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("city", city.name);
    url.searchParams.set("size", "20");
    url.searchParams.set("sort", "date,asc");
    url.searchParams.set("locale", "*");

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Ticketmaster ${res.status} for ${city.name}`);
    const json = (await res.json()) as { _embedded?: { events?: TmEvent[] } };
    events.push(...(json._embedded?.events ?? []));
  }

  return events;
}

export async function runTicketmasterIngest(): Promise<IngestSummary> {
  const apiKey = process.env.TICKETMASTER_API_KEY?.trim();
  const mode: "live" | "fixture" = apiKey ? "live" : "fixture";
  const runId = startIngestRun("ticketmaster", mode);

  let fetched = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let status = "ok";
  let note = "";

  try {
    const raw = apiKey
      ? await fetchLive(apiKey)
      : ((fixtureData as { _embedded?: { events?: TmEvent[] } })._embedded?.events ?? []);

    fetched = raw.length;

    for (const item of raw) {
      const event = toIngested(item);
      if (!event) {
        skipped += 1;
        continue;
      }
      const outcome = upsertIngestedEvent(event);
      if (outcome === "inserted") inserted += 1;
      else if (outcome === "updated") updated += 1;
      else skipped += 1;
    }

    note = apiKey
      ? "Live Ticketmaster Discovery API"
      : "No TICKETMASTER_API_KEY set — replayed the bundled fixture instead";
  } catch (error) {
    status = "failed";
    note = error instanceof Error ? error.message.slice(0, 200) : "Unknown ingest error";
  }

  finishIngestRun(runId, { fetched, inserted, updated, skipped }, status, note);

  return { runId, mode, fetched, inserted, updated, skipped, status, note };
}
