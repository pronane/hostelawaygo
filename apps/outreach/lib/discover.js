/**
 * Finding the hostels.
 *
 * OpenStreetMap is the source: `tourism=hostel` and `tourism=guest_house`
 * inside a city's bounding box. It is free, it is public domain, it has no key
 * to rotate, and — unlike a scraped directory — it comes with a URL you can
 * check. The email is never in OSM; that is what the crawl is for.
 *
 * `--fixture` runs the same pipeline from a file, which is how the demo and the
 * tests work without touching anyone's website.
 */
import { readFile } from "node:fs/promises";
import { slugify } from "./util.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Nominatim asks for one request per second and a real User-Agent. Honour both. */
export async function geocodeCity(name, { nominatim, userAgent, timeoutMs = 15_000 }) {
  const url = new URL("/search", nominatim);
  url.searchParams.set("q", name);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    headers: { "user-agent": userAgent, accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  const results = await response.json();
  const hit = results?.[0];
  if (!hit) throw new Error(`Nominatim found nothing for "${name}"`);

  // boundingbox is [south, north, west, east] as strings.
  const [south, north, west, east] = (hit.boundingbox ?? []).map(Number);
  return {
    name: String(hit.name ?? name),
    country: hit.address?.country ?? "",
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    bbox: Number.isFinite(south) ? { south, north, west, east } : null,
  };
}

export function buildOverpassQuery({ bbox, lat, lng, radius = 9_000, includeGuesthouses = true }) {
  const tourism = includeGuesthouses ? '["tourism"~"^(hostel|guest_house)$"]' : '["tourism"="hostel"]';
  const area = bbox
    ? `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`
    : `around:${Math.round(radius)},${lat},${lng}`;
  return `[out:json][timeout:45];\n(\n  nwr${tourism}(${area});\n);\nout center tags;`;
}

/** Pure parser, so the Overpass shape can be tested without the network. */
export function parseOverpass(payload) {
  const elements = payload?.elements ?? [];
  const hostels = [];
  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = String(tags.name ?? tags["name:en"] ?? "").trim();
    if (!name) continue;
    const tourism = tags.tourism ?? "";
    if (!["hostel", "guest_house"].includes(tourism)) continue;
    const website =
      tags.website ?? tags["contact:website"] ?? tags.url ?? tags["website:en"] ?? "";
    const beds = Number.parseInt(tags.capacity ?? tags["capacity:beds"] ?? "", 10);
    hostels.push({
      name,
      area: tags["addr:suburb"] ?? tags["addr:district"] ?? tags["addr:neighbourhood"] ?? tags["addr:street"] ?? "",
      website: /^https?:\/\//i.test(website) ? website : website ? `https://${website}` : "",
      beds: Number.isFinite(beds) ? beds : 0,
      phone: tags.phone ?? tags["contact:phone"] ?? "",
      source: "openstreetmap",
      sourceUrl: `https://www.openstreetmap.org/${element.type ?? "node"}/${element.id}`,
      lat: Number(element.lat ?? element.center?.lat) || null,
      lng: Number(element.lon ?? element.center?.lon) || null,
    });
  }
  return hostels;
}

export async function findHostelsOsm(city, { overpass, userAgent, radius, includeGuesthouses = true, timeoutMs = 60_000 }) {
  const query = buildOverpassQuery({ bbox: city.bbox, lat: city.lat, lng: city.lng, radius, includeGuesthouses });
  const response = await fetch(overpass, {
    method: "POST",
    headers: {
      "user-agent": userAgent,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Overpass ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const payload = await response.json();
  return parseOverpass(payload);
}

/**
 * A city file: what we know about the place, and optionally hostels we already
 * found. Emails in a fixture are only ever demo addresses.
 */
export async function readCityFile(path) {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  const city = parsed.city ?? parsed;
  return {
    city: {
      slug: city.slug ?? slugify(city.name),
      name: city.name,
      country: city.country ?? "",
      status: city.status ?? "prospect",
      lat: city.lat ?? null,
      lng: city.lng ?? null,
      launchNote: city.launchNote ?? city.launch_note ?? "",
      bbox: city.bbox ?? null,
    },
    prospects: (parsed.prospects ?? []).map((prospect) => ({
      name: prospect.name,
      area: prospect.area ?? "",
      website: prospect.website ?? "",
      beds: prospect.beds ?? 0,
      email: prospect.email ?? "",
      evidenceUrl: prospect.evidenceUrl ?? prospect.evidence_url ?? "",
      evidenceText: prospect.evidenceText ?? prospect.evidence_text ?? "",
      source: prospect.source ?? "fixture",
      sourceUrl: prospect.sourceUrl ?? prospect.source_url ?? "",
    })),
  };
}

/** Convenience for the CLI: `discover` with a fixture file, or live OSM. */
export async function discoverCity({ mode, city, fixturePath, options }) {
  if (mode === "fixture") {
    const file = await readCityFile(fixturePath);
    return { city: { ...file.city, ...city }, prospects: file.prospects, source: "fixture" };
  }

  let resolved = city;
  if (!resolved.lat || !resolved.lng) {
    const geocoded = await geocodeCity(city.name, options);
    resolved = { ...city, ...geocoded };
    await sleep(1_100); // Nominatim: at most one request per second.
  }
  const prospects = await findHostelsOsm(resolved, options);
  return { city: resolved, prospects, source: "openstreetmap" };
}
