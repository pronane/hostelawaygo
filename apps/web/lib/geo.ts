/**
 * Coordinates and walking distances.
 *
 * The app used to carry a hand-written `walk_minutes` per event, which is really
 * an opinion pretending to be data. Everything is now a point on a map: hostels,
 * cities and events carry lat/lng, and the distance from wherever the traveller
 * is actually sleeping is computed with a haversine and converted to walking
 * time at a normal human pace.
 */

export type LatLng = { lat: number; lng: number };

export const CITY_CENTRE: Record<string, LatLng> = {
  lisbon: { lat: 38.7075, lng: -9.1364 },
  porto: { lat: 41.1457, lng: -8.6108 },
  krakow: { lat: 50.0614, lng: 19.9372 },
};

export const HOSTEL_COORDS: Record<string, LatLng> = {
  "home-lisbon": { lat: 38.7098, lng: -9.1355 },
  "sunset-lisbon": { lat: 38.706, lng: -9.146 },
  "yes-lisbon": { lat: 38.712, lng: -9.1395 },
  "lost-inn-lisbon": { lat: 38.713, lng: -9.145 },
  "pilot-porto": { lat: 41.1486, lng: -8.611 },
  "passenger-porto": { lat: 41.1456, lng: -8.6107 },
  "selina-porto": { lat: 41.1521, lng: -8.6157 },
  "greg-tom-krakow": { lat: 50.064, lng: 19.941 },
  "mosquito-krakow": { lat: 50.0655, lng: 19.9425 },
};

/** Venue coordinates, keyed by the place name (the part before " · "). */
const VENUE_COORDS: Record<string, LatLng> = {
  "praca do comercio": { lat: 38.7075, lng: -9.1364 },
  "lx factory": { lat: 38.7033, lng: -9.1786 },
  "miradouro da senhora do monte": { lat: 38.719, lng: -9.1325 },
  "clube de fado": { lat: 38.716, lng: -9.131 },
  "ministerium club": { lat: 38.7064, lng: -9.1452 },
  "rua dos remedios": { lat: 38.7135, lng: -9.127 },
  "doca de santo amaro": { lat: 38.7026, lng: -9.1747 },
  "time out market": { lat: 38.7071, lng: -9.1459 },
  "praca da batalha": { lat: 41.1457, lng: -8.6065 },
  "praca da ribeira": { lat: 41.1409, lng: -8.613 },
  "sao bento station": { lat: 41.1456, lng: -8.6106 },
  "maus habitos": { lat: 41.1476, lng: -8.6046 },
  "rua de santa catarina": { lat: 41.1486, lng: -8.6065 },
  "jardim do morro": { lat: 41.1376, lng: -8.6088 },
  "ramos pinto": { lat: 41.1385, lng: -8.612 },
  "vila nova de gaia": { lat: 41.1376, lng: -8.6088 },
  "rynek glowny": { lat: 50.0614, lng: 19.9372 },
  "krakow glowny station": { lat: 50.0683, lng: 19.9475 },
  "u muniaka": { lat: 50.049, lng: 19.9435 },
  "pub kazimierz": { lat: 50.0486, lng: 19.9444 },
};

const normalise = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function coordsForVenue(venue: string, city: string, hostelCoords?: LatLng | null): LatLng {
  // Venues are written "Place, neighbourhood" — try the whole string, then the place.
  const candidates = [venue, ...venue.split(/[,·]/)].map(normalise).filter(Boolean);
  for (const candidate of candidates) {
    if (VENUE_COORDS[candidate]) return VENUE_COORDS[candidate];
  }
  if (candidates.some((c) => c.includes("hostel")) && hostelCoords) return hostelCoords;
  return CITY_CENTRE[city] ?? CITY_CENTRE.lisbon;
}

const R = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** 80 m/min is 4.8 km/h — a normal walking pace with a backpack on. */
export const WALK_METRES_PER_MINUTE = 80;

export function walkMinutes(meters: number): number {
  if (meters < 120) return 0;
  return Math.max(1, Math.round(meters / WALK_METRES_PER_MINUTE));
}
