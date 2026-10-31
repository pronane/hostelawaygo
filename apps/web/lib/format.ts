const SYMBOLS: Record<string, string> = { EUR: "€", GBP: "£", USD: "$", PLN: "zł" };

export function formatPrice(cents: number, currency = "EUR"): string {
  if (!cents) return "Free";
  const symbol = SYMBOLS[currency] ?? "";
  const amount = cents / 100;
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return currency === "PLN" ? `${text} ${symbol}` : `${symbol}${text}`;
}

/** "Free", "€15", or "€15–45" when the house has more than one price band. */
export function formatPriceRange(
  minCents: number,
  maxCents: number | null | undefined,
  currency = "EUR"
): string {
  if (!minCents) return "Free";
  if (!maxCents || maxCents <= minCents) return formatPrice(minCents, currency);
  return `${formatPrice(minCents, currency)}–${formatPrice(maxCents, currency).replace(/^(€|£|\$)/, "")}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function windowLabel(status?: "in" | "before" | "after"): string | null {
  if (status === "in") return "In your window";
  if (status === "after") return "After you leave";
  if (status === "before") return "Before you land";
  return null;
}

/** "at your hostel" / "12 min walk from your hostel" / "8 min walk from the centre". */
export function walkLabel(minutes: number, from: string): string {
  if (minutes === 0) return from === "your hostel" ? "At your hostel" : "In the centre";
  return `${minutes} min walk from ${from}`;
}
