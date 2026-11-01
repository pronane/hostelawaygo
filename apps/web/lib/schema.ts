export const SCHEMA_VERSION = "8";

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cities (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  tz TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📍',
  intro TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL DEFAULT 0,
  lng REAL NOT NULL DEFAULT 0,
  -- planned -> opening -> live. Public surfaces only show 'live'.
  status TEXT NOT NULL DEFAULT 'live',
  launch_on TEXT
);

CREATE TABLE IF NOT EXISTS hostels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL DEFAULT 0,
  price_from_cents INTEGER NOT NULL DEFAULT 0,
  lat REAL NOT NULL DEFAULT 0,
  lng REAL NOT NULL DEFAULT 0,
  -- pending applications are rows here too: one table, one truth. Public
  -- surfaces read status = 'active' only.
  status TEXT NOT NULL DEFAULT 'active',
  contact_email TEXT NOT NULL DEFAULT '',
  applied_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  beds INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS travellers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  flag TEXT NOT NULL DEFAULT '',
  colour TEXT NOT NULL DEFAULT '#FFD9A0',
  solo INTEGER NOT NULL DEFAULT 1,
  languages TEXT NOT NULL DEFAULT '',
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'traveller',
  hostel_id INTEGER,
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  hostel_id INTEGER REFERENCES hostels(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 120,
  price_cents INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📍',
  cover_from TEXT NOT NULL DEFAULT '#FFD9A0',
  cover_to TEXT NOT NULL DEFAULT '#FF9D6B',
  venue TEXT NOT NULL,
  lat REAL,
  lng REAL,
  walk_minutes INTEGER NOT NULL DEFAULT 10,
  price_max_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'EUR',
  ticket_url TEXT,
  capacity INTEGER,
  cancelled INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  lens TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL DEFAULT 'seed',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  external_id TEXT,
  origin TEXT NOT NULL DEFAULT 'seed',
  open_to_all INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external ON events(city, external_id);
CREATE INDEX IF NOT EXISTS idx_events_city_start ON events(city, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_hostel ON events(hostel_id);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  traveller_id INTEGER NOT NULL,
  city TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  hostel_id INTEGER,
  arrival_time TEXT NOT NULL DEFAULT '14:00',
  departure_time TEXT NOT NULL DEFAULT '10:00'
);

CREATE TABLE IF NOT EXISTS joins (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  traveller_id INTEGER NOT NULL REFERENCES travellers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, traveller_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Social sign-in. One row per provider account, tied to exactly one traveller.
-- (provider, subject) is the provider's own user id, which never changes even
-- if someone changes their email address there.
CREATE TABLE IF NOT EXISTS identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  traveller_id INTEGER NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  linked_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_identities_subject ON identities(provider, subject);
CREATE UNIQUE INDEX IF NOT EXISTS idx_identities_traveller ON identities(traveller_id, provider);

-- The handshake between "go to Google" and "Google sent you back": state (CSRF),
-- PKCE verifier, OIDC nonce, and where to land afterwards. Single use.
CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL DEFAULT '',
  next TEXT NOT NULL DEFAULT '/',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  traveller_id INTEGER NOT NULL REFERENCES travellers(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reported INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_event ON messages(event_id, created_at);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hostel_id INTEGER NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'dorm',
  beds INTEGER NOT NULL DEFAULT 1,
  price_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  traveller_id INTEGER NOT NULL REFERENCES travellers(id),
  hostel_id INTEGER NOT NULL REFERENCES hostels(id),
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  guests INTEGER NOT NULL DEFAULT 1,
  nights INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_room ON bookings(room_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(traveller_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'sandbox',
  method TEXT NOT NULL DEFAULT 'card',
  reference TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'requires_payment',
  created_at TEXT NOT NULL,
  expires_at TEXT,
  paid_at TEXT,
  refunded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);

-- One-time email verification links. Only a SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  traveller_id INTEGER NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

-- "Share my night": a link a friend can open to see where you went and
-- whether you've checked in home safe.
CREATE TABLE IF NOT EXISTS safe_nights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  traveller_id INTEGER NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  plan TEXT NOT NULL,
  friend_name TEXT NOT NULL DEFAULT '',
  back_by TEXT NOT NULL,
  tz TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  created_at TEXT NOT NULL,
  home_at TEXT,
  cancelled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_safe_nights_user ON safe_nights(traveller_id);

-- Reception QR / partner links. One row per hostel + browser + day, stamped
-- when that browser joins an event or books a bed, so a hostel can see what
-- its own guests actually did in Away.
CREATE TABLE IF NOT EXISTS arrivals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hostel_id INTEGER NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
  visitor TEXT NOT NULL,
  day TEXT NOT NULL,
  traveller_id INTEGER REFERENCES travellers(id) ON DELETE SET NULL,
  joined_at TEXT,
  booked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (hostel_id, visitor, day)
);
CREATE INDEX IF NOT EXISTS idx_arrivals_hostel ON arrivals(hostel_id, day);

-- One row per trip per traveller, so a re-run of the digest job can't spam
-- anybody. The unique key is the idempotency.
CREATE TABLE IF NOT EXISTS digest_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  traveller_id INTEGER NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
  trip_key TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'sent',
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (traveller_id, trip_key)
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'fixture',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  fetched INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  note TEXT NOT NULL DEFAULT ''
);
`;

/** Dropped in this order so foreign keys stay happy. */
export const DROP_ALL = `
DROP TABLE IF EXISTS digest_sends;
DROP TABLE IF EXISTS oauth_states;
DROP TABLE IF EXISTS identities;
DROP TABLE IF EXISTS arrivals;
DROP TABLE IF EXISTS safe_nights;
DROP TABLE IF EXISTS email_tokens;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS joins;
DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS travellers;
DROP TABLE IF EXISTS hostels;
DROP TABLE IF EXISTS cities;
DROP TABLE IF EXISTS ingest_runs;
DROP TABLE IF EXISTS meta;
`;
