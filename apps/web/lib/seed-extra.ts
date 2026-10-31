import type { SeedEvent } from "./seed-data";

export const CITIES = [
  {
    slug: "lisbon",
    name: "Lisbon",
    country: "Portugal",
    tz: "Europe/Lisbon",
    emoji: "🌇",
    intro: "Seven hills, one long table, and a different party every night.",
  },
  {
    slug: "porto",
    name: "Porto",
    country: "Portugal",
    tz: "Europe/Lisbon",
    emoji: "🍷",
    intro: "Granite, port wine, and the best cheap dinner in Portugal.",
  },
  {
    slug: "krakow",
    name: "Kraków",
    country: "Poland",
    tz: "Europe/Warsaw",
    emoji: "🥟",
    intro: "Old town, cheap beer, and a hostel scene that never really sleeps.",
  },
] as const;

export const ACCOUNTS = [
  {
    email: "marta@away.app",
    password: "away1234",
    name: "Marta K.",
    role: "traveller",
    hostelSlug: null as string | null,
    travellerIndex: 1,
    demoBlurb: "Traveller staying in Lisbon, off to Porto next",
  },
  {
    email: "ana@homelisbon.pt",
    password: "away1234",
    name: "Ana Ribeiro",
    role: "hostel_staff",
    hostelSlug: "home-lisbon",
    travellerIndex: null as number | null,
    flag: "🇵🇹",
    colour: "#FFC9B0",
    languages: "Portuguese, English",
    demoBlurb: "Front desk at Home Lisbon Hostel",
  },
  {
    email: "ops@away.app",
    password: "away1234",
    name: "Away Ops",
    role: "admin",
    hostelSlug: null as string | null,
    travellerIndex: null as number | null,
    flag: "⚙️",
    colour: "#D7DDE8",
    languages: "English",
    demoBlurb: "Runs the city ingest and moderation",
  },
];

export const EXTRA_EVENTS: SeedEvent[] = [
  {
    key: "krak-pierogi", city: "krakow", hostel: "Greg & Tom Hostel", dayOffset: 0, time: "19:00",
    durationMin: 120, source: "hostel", category: "food", emoji: "🥟",
    cover: ["#FFE3B8", "#E8A23C"], priceCents: 0, walkMinutes: 0, seated: 17,
    title: "Pierogi night in the courtyard",
    description:
      "Four kinds of pierogi, one big table, and a rule that you cannot sit next to someone from your own country. Vegetarian half of the table is on the left.",
    venue: "Greg & Tom Hostel · your hostel",
    tags: ["free", "solo", "food", "social", "early"],
    lens: ["You're in this building — 0 min", "Done by 21:00, crawl starts at 21:30"],
  },
  {
    key: "krak-vodka", city: "krakow", hostel: "Greg & Tom Hostel", dayOffset: 0, time: "21:30",
    durationMin: 180, source: "hostel", category: "nightlife", emoji: "🥃",
    cover: ["#FFD6C9", "#E06A4A"], priceCents: 1200, walkMinutes: 5, seated: 19,
    title: "Vodka tasting, then the old town crawl",
    description:
      "Six shots you cannot pronounce, a guide who can, then four bars around the main square. €12 covers the tasting. The crawl is free once you're in it.",
    venue: "Greg & Tom Hostel · 5 min walk",
    tags: ["solo", "nightlife", "social"],
    lens: ["Meet in reception at 21:20", "Finishes late — walkable, no taxi needed"],
  },
  {
    key: "krak-walk", city: "krakow", dayOffset: 1, time: "10:00",
    durationMin: 180, source: "city", category: "culture", emoji: "🚶",
    cover: ["#BFE3FF", "#5AA9F0"], priceCents: 0, walkMinutes: 12, seated: 15,
    title: "Free walking tour: Old Town to Kazimierz",
    description:
      "The best three hours you can spend on your first morning here. Tips-based, ends in Kazimierz with the good zapiekanka place pointed out.",
    venue: "Rynek Główny, by the clock tower · 12 min walk",
    tags: ["free", "solo", "outdoors", "culture"],
    lens: ["Tip-based — budget 20 zł", "Ends near lunch, deliberately"],
  },
  {
    key: "krak-jazz", city: "krakow", dayOffset: 1, time: "20:00",
    durationMin: 120, source: "community", category: "music", emoji: "🎷",
    cover: ["#D8C7FF", "#8A6BFF"], priceCents: 600, walkMinutes: 14, seated: 8,
    title: "Live jazz in a cellar, Kazimierz",
    description:
      "Posted by two people from Mosquito. Tiny brick room, no stage, three players and whoever turns up. €6 at the door, cash.",
    venue: "U Muniaka, Kazimierz · 14 min walk",
    tags: ["music", "early", "culture", "solo"],
    lens: ["Posted by a traveller at Mosquito", "Ends 22:00 — easy walk back"],
  },
  {
    key: "krak-salt", city: "krakow", dayOffset: 2, time: "08:30",
    durationMin: 480, source: "ticketed", category: "outdoors", emoji: "⛏️",
    cover: ["#CFE8C7", "#4E9B5F"], priceCents: 2800, walkMinutes: 18, seated: 5, capacity: 8,
    title: "Day trip: Wieliczka salt mine",
    description:
      "Half a kilometre underground, chapels carved out of salt, and 800 steps. The early bus is the only way to do it without the crowds. €28 covers entry and the train.",
    venue: "Kraków Główny station · 18 min walk",
    tags: ["outdoors", "culture"],
    lens: ["18 min walk to the station, then 20 min train", "Back around 16:00 — the whole day"],
  },
];

export const SEED_MESSAGES: { eventTitle: string; author: string; body: string; minutesAgo: number }[] = [
  {
    eventTitle: "Family dinner: Mozambican curry",
    author: "Tom R.",
    body: "In for dinner tonight — is there a vegetarian option or should I eat before?",
    minutesAgo: 95,
  },
  {
    eventTitle: "Family dinner: Mozambican curry",
    author: "Aiko O.",
    body: "Same question 😅 arriving off the 18:10 bus, will I make it?",
    minutesAgo: 74,
  },
  {
    eventTitle: "Family dinner: Mozambican curry",
    author: "Luis C.",
    body: "There's a veg pot, just tell them at 19:20. And yes, the bus gets in at 18:40, you'll make it.",
    minutesAgo: 61,
  },
  {
    eventTitle: "Pub crawl: Bairro Alto → Cais do Sodré",
    author: "Ella S.",
    body: "Meeting in reception at 22:20, right? Or at the first bar?",
    minutesAgo: 40,
  },
  {
    eventTitle: "Pub crawl: Bairro Alto → Cais do Sodré",
    author: "Hugo P.",
    body: "Reception at 22:20. Bring cash — the first two bars are card-only until 11.",
    minutesAgo: 26,
  },
  {
    eventTitle: "Pierogi night in the courtyard",
    author: "Freya J.",
    body: "First night here, coming on my own — is it weird to turn up solo?",
    minutesAgo: 120,
  },
  {
    eventTitle: "Pierogi night in the courtyard",
    author: "Karim A.",
    body: "Half the table is solo. That is basically the point of it.",
    minutesAgo: 108,
  },
];

export const ROOM_TEMPLATES = (priceFrom: number) => [
  { name: "Mixed dorm · 6 beds", kind: "dorm", beds: 6, price_cents: priceFrom },
  { name: "Female dorm · 6 beds", kind: "dorm", beds: 6, price_cents: priceFrom },
  {
    name: "Private double",
    kind: "private",
    beds: 2,
    price_cents: Math.round((priceFrom * 3.4) / 100) * 100,
  },
];
