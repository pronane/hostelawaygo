import type { Source, WindowStatus } from "./constants";

export type City = {
  slug: string;
  name: string;
  country: string;
  tz: string;
};

export type Hostel = {
  id: number;
  city: string;
  name: string;
  area: string;
};

export type Traveller = {
  id: number;
  name: string;
  initials: string;
  flag: string;
  colour: string;
  solo: boolean;
  languages: string;
};

export type EventRow = {
  id: number;
  city: string;
  hostel_id: number | null;
  hostel_name: string | null;
  hostel_area: string | null;
  title: string;
  description: string;
  starts_at: string;
  duration_min: number;
  price_cents: number;
  source: Source;
  category: string;
  emoji: string;
  cover_from: string;
  cover_to: string;
  venue: string;
  walk_minutes: number;
  capacity: number | null;
  tags: string;
  lens: string;
  created_by: string;
  going: number;
  solo_going: number;
  is_joined: number;
  avatars: string | null;
};

export type FeedEvent = Omit<
  EventRow,
  "tags" | "lens" | "is_joined" | "going" | "solo_going" | "avatars"
> & {
  tags: string[];
  lens: string[];
  going: number;
  soloGoing: number;
  isJoined: boolean;
  avatars: string[];
  status?: WindowStatus;
};

export type Trip = {
  id: number;
  traveller_id: number;
  city: string;
  starts_on: string;
  ends_on: string;
  hostel_id: number | null;
  hostel_name: string | null;
  arrival_time: string;
  departure_time: string;
};
