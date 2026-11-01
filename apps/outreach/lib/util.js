/** Small shared helpers. No dependencies, no cleverness. */

export const nowIso = () => new Date().toISOString();

export function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** "https://www.hostel.pt/contact" -> "hostel.pt". Lowercase, no www. */
export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function normaliseEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Addresses that cannot belong to a real hostel. Sending to one is recorded as
 * `simulated` — which is what makes the demo honest and the tests safe.
 */
const RESERVED_SUFFIXES = [".example", ".example.com", ".example.net", ".example.org", ".invalid", ".test", ".local", ".localhost"];
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org", "example", "localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function isReservedEmail(email) {
  const domain = normaliseEmail(email).split("@")[1] ?? "";
  if (!domain) return true;
  if (RESERVED_DOMAINS.has(domain)) return true;
  if (RESERVED_SUFFIXES.some((suffix) => domain.endsWith(suffix))) return true;
  // RFC 2606 also reserves anything under example.<tld> and the "invalid" TLD
  // is covered above. Bare IPs are never a hostel.
  return /^\d+\.\d+\.\d+\.\d+$/.test(domain);
}

export function dayInTimeZone(date = new Date(), timeZone = "Europe/Lisbon") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function hourInTimeZone(date = new Date(), timeZone = "Europe/Lisbon") {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(date));
}

/** "Sábado"? No: letters are written in English, as the product is. */
export function formatDate(iso, timeZone = "Europe/Lisbon") {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function truncate(value, length = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/** Collapse whitespace and strip control characters from crawled text. */
export function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
