export const HOME_HOSTEL_NAME = "Home Lisbon Hostel";

export type Source = "hostel" | "city" | "community" | "ticketed";
export type WindowStatus = "in" | "before" | "after";

export const SOURCE_LABEL: Record<Source, string> = {
  hostel: "hostel",
  city: "city",
  community: "community",
  ticketed: "ticketed",
};

export const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "free", label: "Free" },
  { key: "solo", label: "Good solo" },
  { key: "hostels", label: "Hostel socials" },
  { key: "music", label: "Music" },
  { key: "food", label: "Food" },
  { key: "outdoors", label: "Outdoors" },
  { key: "nightlife", label: "Nightlife" },
  { key: "early", label: "Back by midnight" },
];

// Cities live in the `cities` table, not here. Opening a city is an ops action,
// and an ops action that needs a deploy is not repeatable.

/**
 * Canonical origin for links that leave the app: QR codes on posters, the
 * sitemap, share cards. Anything shown to a scanner has to be absolute, so
 * APP_URL is the one setting a deployment must get right.
 */
export function appUrl(): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
