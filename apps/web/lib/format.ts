export function formatPrice(cents: number): string {
  if (!cents) return "Free";
  const euros = cents / 100;
  return `€${Number.isInteger(euros) ? euros : euros.toFixed(2)}`;
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
