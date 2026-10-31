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

export const CITIES = {
  lisbon: { slug: "lisbon", name: "Lisbon", country: "Portugal", tz: "Europe/Lisbon" },
  porto: { slug: "porto", name: "Porto", country: "Portugal", tz: "Europe/Lisbon" },
} as const;

export type CitySlug = keyof typeof CITIES;
