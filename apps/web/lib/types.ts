import type { Source, WindowStatus } from "./constants";

export type City = {
  slug: string;
  name: string;
  country: string;
  tz: string;
  emoji: string;
  intro: string;
  lat: number;
  lng: number;
};

export type Hostel = {
  id: number;
  slug: string;
  city: string;
  name: string;
  area: string;
  description: string;
  rating: number;
  price_from_cents: number;
  lat: number;
  lng: number;
};

export type Room = {
  id: number;
  hostel_id: number;
  name: string;
  kind: "dorm" | "private";
  beds: number;
  price_cents: number;
};

export type Traveller = {
  id: number;
  name: string;
  initials: string;
  flag: string;
  colour: string;
  solo: number | boolean;
  languages: string;
};

export type EventRow = {
  id: number;
  city: string;
  hostel_id: number | null;
  hostel_slug: string | null;
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
  lat: number | null;
  lng: number | null;
  walk_minutes: number;
  price_max_cents: number | null;
  currency: string;
  ticket_url: string | null;
  capacity: number | null;
  cancelled: number;
  tags: string;
  lens: string;
  created_by: string;
  origin: string;
  external_id: string | null;
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
  /** Where the walk estimate is measured from: a hostel name, or "the city centre". */
  walkFrom: string;
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

export type Message = {
  id: number;
  event_id: number;
  traveller_id: number;
  body: string;
  created_at: string;
  reported: number;
  mine: number;
  name: string;
  initials: string;
  colour: string;
  flag: string;
};

export type Payment = {
  id: number;
  booking_id: number;
  provider: string;
  method: string;
  reference: string;
  idempotency_key: string;
  amount_cents: number;
  currency: string;
  status: "requires_payment" | "paid" | "refunded" | "expired";
  created_at: string;
  expires_at: string | null;
  paid_at: string | null;
  refunded_at: string | null;
};

export type Booking = {
  id: number;
  code: string;
  traveller_id: number;
  hostel_id: number;
  room_id: number;
  check_in: string;
  check_out: string;
  guests: number;
  nights: number;
  total_cents: number;
  status: "pending" | "confirmed" | "cancelled";
  created_at: string;
};

export type BookingDetail = Booking & {
  hostel_name: string;
  hostel_slug: string;
  hostel_city: string;
  room_name: string;
  room_kind: string;
  payment_status: Payment["status"] | null;
  payment_reference: string | null;
  payment_provider: string | null;
  payment_expires_at: string | null;
  paid_at: string | null;
  refunded_at: string | null;
};

export type IngestRun = {
  id: number;
  source: string;
  mode: string;
  started_at: string;
  finished_at: string | null;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  status: string;
  note: string;
};
