export const CITY_TZ = "Europe/Lisbon";

const pad = (n: number) => String(n).padStart(2, "0");

/** Today in the city's own timezone, as YYYY-MM-DD. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CITY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Current wall-clock time in the city, as HH:mm. */
export function nowHHMM(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CITY_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** "Sat 31 Oct" */
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/** "Saturday 31 October" */
export function formatDayLong(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/** "31 Oct" */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

export function dayHeading(iso: string, today = todayISO()): string {
  if (iso === today) return "Tonight";
  if (iso === addDays(today, 1)) return "Tomorrow";
  return formatDay(iso);
}

export function dateOf(startsAt: string): string {
  return startsAt.slice(0, 10);
}

export function timeOf(startsAt: string): string {
  return startsAt.slice(11, 16);
}

export function endTime(startsAt: string, durationMin: number): string {
  const d = new Date(`${startsAt}:00Z`);
  const end = new Date(d.getTime() + durationMin * 60_000);
  return `${pad(end.getUTCHours())}:${pad(end.getUTCMinutes())}`;
}

export function nightsBetween(from: string, to: string): number {
  return Math.max(0, diffDays(from, to));
}

/** SQLite `datetime('now')` values are "YYYY-MM-DD HH:MM:SS" in UTC. */
export function formatSqlTime(value: string): string {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CITY_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
