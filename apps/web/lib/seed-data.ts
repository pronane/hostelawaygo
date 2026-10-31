import type { Source } from "./constants";

export type SeedEvent = {
  key: string;
  city: "lisbon" | "porto";
  hostel?: string;
  dayOffset: number;
  time: string;
  durationMin: number;
  title: string;
  description: string;
  source: Source;
  category: string;
  emoji: string;
  cover: [string, string];
  priceCents: number;
  venue: string;
  walkMinutes: number;
  tags: string[];
  lens: string[];
  capacity?: number;
  seated: number; // seeded attendees
};

export const HOSTELS: { city: string; name: string; area: string }[] = [
  { city: "lisbon", name: "Home Lisbon Hostel", area: "Baixa" },
  { city: "lisbon", name: "Sunset Destination Hostel", area: "Cais do Sodré" },
  { city: "lisbon", name: "Yes! Lisbon Hostel", area: "Baixa" },
  { city: "lisbon", name: "Lost Inn Lisbon", area: "Bairro Alto" },
  { city: "porto", name: "Pilot Design Hostel", area: "Aliados" },
  { city: "porto", name: "The Passenger Hostel", area: "São Bento" },
  { city: "porto", name: "Selina Porto", area: "Cedofeita" },
];

export const TRAVELLERS: {
  name: string;
  flag: string;
  colour: string;
  solo: boolean;
  languages: string;
}[] = [
  // id 1 is the demo account
  { name: "Marta K.", flag: "🇵🇱", colour: "#FFD9A0", solo: true, languages: "Polish, English" },
  { name: "Tom R.", flag: "🇬🇧", colour: "#BFE3FF", solo: true, languages: "English" },
  { name: "Aiko O.", flag: "🇯🇵", colour: "#D9F0D0", solo: false, languages: "Japanese, English" },
  { name: "Luis C.", flag: "🇵🇹", colour: "#FFD6E7", solo: true, languages: "Portuguese, English" },
  { name: "Sofia M.", flag: "🇧🇷", colour: "#E7D6FF", solo: true, languages: "Portuguese, Spanish" },
  { name: "Jonas B.", flag: "🇩🇪", colour: "#FFE6B8", solo: true, languages: "German, English" },
  { name: "Nina V.", flag: "🇳🇱", colour: "#C9E9F6", solo: false, languages: "Dutch, English" },
  { name: "Hugo P.", flag: "🇫🇷", colour: "#F7D2C3", solo: true, languages: "French, English" },
  { name: "Ella S.", flag: "🇦🇺", colour: "#D3EBC6", solo: true, languages: "English" },
  { name: "Ravi N.", flag: "🇮🇳", colour: "#F6D9C9", solo: true, languages: "Hindi, English" },
  { name: "Chiara F.", flag: "🇮🇹", colour: "#E9D6F2", solo: true, languages: "Italian, English" },
  { name: "Ben W.", flag: "🇨🇦", colour: "#CDE3FA", solo: true, languages: "English, French" },
  { name: "Yuki T.", flag: "🇯🇵", colour: "#D6EFD9", solo: true, languages: "Japanese, English" },
  { name: "Amara D.", flag: "🇳🇬", colour: "#FAD5BE", solo: true, languages: "English, Yoruba" },
  { name: "Liam O.", flag: "🇮🇪", colour: "#D4EAD9", solo: true, languages: "English" },
  { name: "Elif K.", flag: "🇹🇷", colour: "#F3D3D9", solo: true, languages: "Turkish, English" },
  { name: "Pedro S.", flag: "🇵🇹", colour: "#E5DAC4", solo: false, languages: "Portuguese, English" },
  { name: "Hanna L.", flag: "🇸🇪", colour: "#CFE7F0", solo: true, languages: "Swedish, English" },
  { name: "Noah M.", flag: "🇺🇸", colour: "#D7D9F5", solo: true, languages: "English" },
  { name: "Zoe H.", flag: "🇳🇿", colour: "#F2DDC0", solo: true, languages: "English" },
  { name: "Mateo G.", flag: "🇦🇷", colour: "#D8ECD2", solo: false, languages: "Spanish, English" },
  { name: "Freya J.", flag: "🇩🇰", colour: "#F5D3E2", solo: true, languages: "Danish, English" },
  { name: "Karim A.", flag: "🇲🇦", colour: "#E8DCC8", solo: true, languages: "Arabic, French" },
  { name: "Isla M.", flag: "🇬🇧", colour: "#D3E3F2", solo: true, languages: "English" },
];

export const EVENTS: SeedEvent[] = [
  /* ---------------- LISBON ---------------- */
  {
    key: "lis-dinner", city: "lisbon", hostel: "Home Lisbon Hostel", dayOffset: 0, time: "19:30",
    durationMin: 90, source: "hostel", category: "food", emoji: "🍛",
    cover: ["#FFD7A8", "#FF9D6B"], priceCents: 0, walkMinutes: 0, seated: 18,
    title: "Family dinner: Mozambican curry",
    description:
      "The one that started it all. Cooked by staff, eaten at one long table, phones face down. Turn up at 19:25 and sit next to somebody you don't know — that is the whole point. Vegetarian pot on the left.",
    venue: "Home Lisbon Hostel · your hostel",
    tags: ["solo", "food", "early", "social"],
    lens: ["You're in this building — 0 min", "Done by 21:00, plenty of night left"],
  },
  {
    key: "lis-roof", city: "lisbon", hostel: "Sunset Destination Hostel", dayOffset: 0, time: "21:00",
    durationMin: 120, source: "hostel", category: "music", emoji: "🍹",
    cover: ["#FFC9B0", "#F2705B"], priceCents: 800, walkMinutes: 6, seated: 20,
    title: "Sunset sangria on the roof terrace",
    description:
      "Rooftop above the river, a jug of sangria, and someone will have a guitar out by half past. Open to guests from any hostel — €8 gets you a jug and one of the better sunsets in the city.",
    venue: "Sunset Destination Hostel · 6 min walk",
    tags: ["solo", "music", "early", "social"],
    lens: ["6 min walk from your bed", "Ends ~23:00 — metro still running"],
  },
  {
    key: "lis-crawl", city: "lisbon", hostel: "Yes! Lisbon Hostel", dayOffset: 0, time: "22:30",
    durationMin: 210, source: "hostel", category: "nightlife", emoji: "🍻",
    cover: ["#FFE0A3", "#FFB020"], priceCents: 1200, walkMinutes: 9, seated: 22,
    title: "Pub crawl: Bairro Alto → Cais do Sodré",
    description:
      "Four bars, one welcome shot, and about twenty people who also don't know anyone yet. The classic. Bring ID, cash for the bars, and shoes you can actually walk in — the streets are steep and the pavements are slippery.",
    venue: "Yes! Lisbon Hostel · 9 min walk",
    tags: ["solo", "nightlife", "music"],
    lens: ["9 min walk, group meets in reception", "Finishes late — no last metro, share a taxi"],
  },
  {
    key: "lis-fado", city: "lisbon", dayOffset: 0, time: "23:00",
    durationMin: 75, source: "city", category: "music", emoji: "🎶",
    cover: ["#C8B8FF", "#7A5BFF"], priceCents: 0, walkMinutes: 14, seated: 14,
    title: "Fado na rua — Alfama street sessions",
    description:
      "Neighbours pull chairs onto the pavement and sing until somebody complains. Genuinely one of the best free things in this city. Quiet, respectful, no filming and no talking through a verse.",
    venue: "Rua dos Remédios, Alfama · 14 min walk",
    tags: ["free", "music", "culture", "early"],
    lens: ["Locals' night, not a tourist show", "14 min walk, or 6 min by tram"],
  },

  {
    key: "lis-walk", city: "lisbon", dayOffset: 1, time: "10:00",
    durationMin: 180, source: "city", category: "culture", emoji: "🚶",
    cover: ["#BFE3FF", "#5AA9F0"], priceCents: 0, walkMinutes: 18, seated: 16,
    title: "Free walking tour: Baixa & Mouraria",
    description:
      "Three hours, tips-based, and where half the hostel ends up meeting each other. Show up five minutes early — the queue gets long and they cap the group at thirty.",
    venue: "Praça do Comércio · 18 min walk",
    tags: ["free", "solo", "outdoors", "culture"],
    lens: ["Tip-based — budget €10", "Outdoors, wear actual shoes"],
  },
  {
    key: "lis-beer", city: "lisbon", hostel: "Home Lisbon Hostel", dayOffset: 1, time: "20:00",
    durationMin: 150, source: "hostel", category: "social", emoji: "🏆",
    cover: ["#FFD6C9", "#FF7A59"], priceCents: 0, walkMinutes: 0, seated: 12,
    title: "Beer Olympics",
    description:
      "Teams of four, drawn on the night, so you don't need to bring anyone. Winner takes the bar tab, losers take the washing-up. Extremely stupid, extremely good way to meet twelve people in twenty minutes.",
    venue: "Home Lisbon Hostel · your hostel",
    tags: ["free", "solo", "social", "early"],
    lens: ["Teams drawn on the night — come alone", "Done by 22:30"],
  },
  {
    key: "lis-jazz", city: "lisbon", dayOffset: 1, time: "21:30",
    durationMin: 120, source: "community", category: "music", emoji: "🎷",
    cover: ["#D8C7FF", "#8A6BFF"], priceCents: 500, walkMinutes: 12, seated: 9,
    title: "Live jazz + €3 vinho verde",
    description:
      "Tiny room, proper players, tiny prices. Posted by another traveller staying at Yes! Lisbon — she's walking over at 21:15 and happy to take anyone with her. Look for the green tote bag.",
    venue: "Clube de Fado, Graça · 12 min walk",
    tags: ["music", "early", "culture"],
    lens: ["Posted by a traveller, not a promoter", "Ends 23:30 — walkable home"],
  },

  {
    key: "lis-kayak", city: "lisbon", dayOffset: 2, time: "18:00",
    durationMin: 120, source: "ticketed", category: "outdoors", emoji: "🛶",
    cover: ["#A9E5E0", "#2FA9A0"], priceCents: 2500, walkMinutes: 25, seated: 6, capacity: 8,
    title: "Sunset kayak on the Tagus",
    description:
      "Two hours on the water as the light goes orange behind the bridge. Beginner-friendly, all gear included, you will get wet. Only a couple of spots left for this one.",
    venue: "Doca de Santo Amaro · 25 min walk",
    tags: ["outdoors", "solo"],
    lens: ["25 min walk — or the 15E tram", "Book ahead, this sells out"],
  },
  {
    key: "lis-museum", city: "lisbon", dayOffset: 2, time: "11:00",
    durationMin: 150, source: "city", category: "culture", emoji: "🛍️",
    cover: ["#FFE0A3", "#F0A32B"], priceCents: 0, walkMinutes: 30, seated: 8,
    title: "LX Factory makers' market",
    description:
      "Old print works turned row of studios, food stalls and questionable vintage. Free to wander, easy to lose three hours, good coffee. Take the tram or it's a long walk in the heat.",
    venue: "LX Factory, Alcântara · 30 min walk",
    tags: ["free", "culture", "food", "outdoors"],
    lens: ["Free to wander, cash for stalls", "30 min walk — take the 15E"],
  },
  {
    key: "lis-club", city: "lisbon", dayOffset: 2, time: "23:30",
    durationMin: 300, source: "ticketed", category: "nightlife", emoji: "🪩",
    cover: ["#C9C2FF", "#6C5CE7"], priceCents: 1500, walkMinutes: 16, seated: 11,
    title: "Clubbing: Ministerium",
    description:
      "The big room on the waterfront, doors at midnight, sunrise finish. €15 before 1am. Go with the group from the pub crawl or don't go — the walk back alone at 5am is not the fun part.",
    venue: "Ministerium Club, Cais do Sodré · 16 min walk",
    tags: ["nightlife", "music"],
    lens: ["16 min walk, or share a taxi back", "Doors 00:00 — no last metro after"],
  },

  {
    key: "lis-nata", city: "lisbon", hostel: "Home Lisbon Hostel", dayOffset: 3, time: "17:00",
    durationMin: 120, source: "hostel", category: "food", emoji: "🥧",
    cover: ["#FFE3B8", "#F5B350"], priceCents: 1500, walkMinutes: 0, seated: 10, capacity: 12,
    title: "Cooking class: pastéis de nata",
    description:
      "Twelve people, one kitchen, far too much cinnamon. You make them, you eat them warm, you take the recipe home and never make them again. €15 covers ingredients.",
    venue: "Home Lisbon Hostel kitchen · your hostel",
    tags: ["food", "social", "early"],
    lens: ["You're in this building — 0 min", "Two hours, no experience needed"],
  },
  {
    key: "lis-miradouro", city: "lisbon", dayOffset: 3, time: "19:00",
    durationMin: 90, source: "community", category: "outdoors", emoji: "🌅",
    cover: ["#FFD0B0", "#E0705A"], priceCents: 0, walkMinutes: 22, seated: 7,
    title: "Sunset walk to Senhora do Monte",
    description:
      "Someone from Lost Inn posted this: meet at the hostel at 18:40, walk up through Graça, watch the light go, come back down for cheap dinner. Free, low effort, excellent company.",
    venue: "Miradouro da Senhora do Monte · 22 min walk",
    tags: ["free", "outdoors", "solo", "early"],
    lens: ["Posted by a traveller at Lost Inn", "Free — bring a beer from the shop"],
  },

  /* ---------------- PORTO ---------------- */
  {
    key: "por-gaia", city: "porto", hostel: "Pilot Design Hostel", dayOffset: 12, time: "18:30",
    durationMin: 180, source: "hostel", category: "food", emoji: "🍷",
    cover: ["#E7C6C1", "#A5534A"], priceCents: 2000, walkMinutes: 20, seated: 12,
    title: "Porto wine cellar crawl, Gaia",
    description:
      "Three cellars, three tastings, and the bridge walk at golden hour in between. Starts at 18:30 because that's when the last tours go out — and yes, there is a port for people who 'don't like port'.",
    venue: "Vila Nova de Gaia · 20 min walk",
    tags: ["food", "solo", "social"],
    lens: ["You land 14:20 — plenty of time", "Ends 21:30, walkable back"],
  },
  {
    key: "por-francesinha", city: "porto", hostel: "Pilot Design Hostel", dayOffset: 12, time: "21:30",
    durationMin: 120, source: "hostel", category: "food", emoji: "🥪",
    cover: ["#FFD9A0", "#E08A3C"], priceCents: 1400, walkMinutes: 7, seated: 9,
    title: "Francesinha crawl (it's a sandwich, sort of)",
    description:
      "Two of the city's better versions, one plate between two, and a leaderboard nobody asked for. €14 covers both and one drink. Vegetarian option if you ask at the bar.",
    venue: "Rua de Santa Catarina · 7 min walk",
    tags: ["food", "social", "early"],
    lens: ["7 min walk from your hostel", "Ends by 23:30"],
  },
  {
    key: "por-ribeira", city: "porto", dayOffset: 13, time: "10:00",
    durationMin: 180, source: "city", category: "culture", emoji: "🚶",
    cover: ["#BFE3FF", "#5AA9F0"], priceCents: 0, walkMinutes: 12, seated: 11,
    title: "Free walking tour: Ribeira & the bridges",
    description:
      "The one to do on day one in Porto. Two and a bit hours, tips-based, ends with the postcard view from the Gaia side. Arrive ten minutes early or you'll be in the second group.",
    venue: "Praça da Ribeira · 12 min walk",
    tags: ["free", "solo", "outdoors", "culture"],
    lens: ["Tip-based — budget €10", "Ends near the port cellars — useful"],
  },
  {
    key: "por-ramos", city: "porto", dayOffset: 13, time: "16:00",
    durationMin: 75, source: "ticketed", category: "food", emoji: "🧀",
    cover: ["#F3DDC4", "#B98A4E"], priceCents: 1800, walkMinutes: 22, seated: 7, capacity: 10,
    title: "Port tasting + cheese, Ramos Pinto",
    description:
      "The museum tour first, then five ports and a plate of things that go with them. Smaller and calmer than the big names on the front. Book online, it's usually full by the day before.",
    venue: "Ramos Pinto, Gaia · 22 min walk",
    tags: ["food", "culture"],
    lens: ["22 min walk, or 3 min from the bridge", "Book ahead — fills the day before"],
  },
  {
    key: "por-samba", city: "porto", dayOffset: 13, time: "21:00",
    durationMin: 180, source: "ticketed", category: "music", emoji: "🎶",
    cover: ["#C8B8FF", "#7A5BFF"], priceCents: 1000, walkMinutes: 15, seated: 8,
    title: "Live samba at Maus Hábitos",
    description:
      "Art space turned bar on the fourth floor of a car park, which sounds wrong and is completely right. Samba until late, €10 at the door. The kind of night people plan a trip around.",
    venue: "Maus Hábitos, Rua Passos Manuel · 15 min walk",
    tags: ["music", "nightlife"],
    lens: ["15 min walk from your hostel", "Late — pre-book a taxi back"],
  },
  {
    key: "por-douro", city: "porto", dayOffset: 14, time: "09:00",
    durationMin: 600, source: "community", category: "outdoors", emoji: "🚂",
    cover: ["#CFE8C7", "#4E9B5F"], priceCents: 3500, walkMinutes: 10, seated: 5,
    title: "Day trip: Douro valley by train",
    description:
      "Train to Pinhão, two vineyards, back by 19:00. Posted by two travellers looking for two more to split a tasting and a taxi. The best thing you can do in a day from Porto.",
    venue: "São Bento station · 10 min walk",
    tags: ["outdoors", "food", "solo"],
    lens: ["4 of 5 going arrived solo", "Whole day — clear your calendar"],
  },
  {
    key: "por-morro", city: "porto", dayOffset: 14, time: "19:00",
    durationMin: 90, source: "community", category: "outdoors", emoji: "🌅",
    cover: ["#FFD0B0", "#E0705A"], priceCents: 0, walkMinutes: 18, seated: 6,
    title: "Sunset at Jardim do Morro",
    description:
      "Cross the top deck of the bridge, sit on the grass, watch the city go orange. Free, five minutes from the hostel if you take the metro. Bring something to drink and don't bring a speaker.",
    venue: "Jardim do Morro, Gaia · 18 min walk",
    tags: ["free", "outdoors", "solo", "early"],
    lens: ["Free — bring your own drink", "18 min walk over the top deck"],
  },
  {
    key: "por-market", city: "porto", dayOffset: 15, time: "11:00",
    durationMin: 120, source: "city", category: "culture", emoji: "🛍️",
    cover: ["#FFE0A3", "#F0A32B"], priceCents: 0, walkMinutes: 8, seated: 9,
    title: "Flea market, Praça da Batalha",
    description:
      "Old cameras, tiles, and somebody selling their grandmother's records. Right by the station, so it's the obvious last stop before a bus. Cash only and everyone is negotiable.",
    venue: "Praça da Batalha · 8 min walk",
    tags: ["free", "culture"],
    lens: ["8 min walk from your hostel", "Cash only — and no ATM nearby"],
  },
  {
    key: "por-karaoke", city: "porto", hostel: "The Passenger Hostel", dayOffset: 16, time: "20:00",
    durationMin: 180, source: "hostel", category: "social", emoji: "🎤",
    cover: ["#FFD6C9", "#FF7A59"], priceCents: 0, walkMinutes: 11, seated: 8,
    title: "Karaoke night, The Passenger",
    description:
      "Happens the night after your bus leaves. Shown so you can see what you're missing — and re-plan if you feel like staying another day. It happens every week, it is always the same three songs.",
    venue: "The Passenger Hostel, São Bento · 11 min walk",
    tags: ["free", "social", "solo"],
    lens: ["Outside your dates", "11 min walk from your hostel"],
  },
];
