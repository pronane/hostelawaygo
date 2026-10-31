/**
 * Every knob the bot has, in one place, read once at startup.
 *
 * Two of these are not preferences, they are the reason this tool can be handed
 * to someone: OUTREACH_POSTAL_ADDRESS (a commercial email must carry a real
 * postal address) and the daily cap. If the address is missing, real mail is
 * refused rather than sent without it.
 */

const env = process.env;

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: int(env.OUTREACH_PORT, 3100),
  host: env.OUTREACH_HOST ?? "0.0.0.0",
  dbPath: env.OUTREACH_DB_PATH ?? new URL("../data/outreach.db", import.meta.url).pathname,

  /**
   * The product's database, read-only, used to avoid cold-emailing hostels that
   * are already partners or already waiting for approval.
   */
  awayDbPath: env.AWAY_DB_PATH ?? new URL("../../web/data/away.db", import.meta.url).pathname,

  /** Where the product lives, so links in a letter actually work. */
  appUrl: (env.AWAY_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),

  /**
   * Where *this* tool is reachable from the outside. Unsubscribe links are the
   * only public surface it has, and they must work for the person reading the
   * letter, not for us on localhost.
   */
  publicUrl: (env.OUTREACH_PUBLIC_URL ?? `http://localhost:${int(env.OUTREACH_PORT, 3100)}`).replace(/\/$/, ""),

  sender: {
    name: env.OUTREACH_SENDER_NAME ?? "Nuno",
    role: env.OUTREACH_SENDER_ROLE ?? "Away",
    // What lands in the From: header. A person, not a brand — replies work.
    from: env.OUTREACH_FROM ?? "Nuno at Away <nuno@away.app>",
    replyTo: env.OUTREACH_REPLY_TO ?? "nuno@away.app",
    postalAddress: env.OUTREACH_POSTAL_ADDRESS ?? "",
  },

  /** Caps exist so a good week cannot become a spam complaint. */
  limits: {
    dailyCap: int(env.OUTREACH_DAILY_CAP, 25),
    perDomain: 1,
    // Letters go out in working hours, operator's timezone.
    window: { start: int(env.OUTREACH_WINDOW_START, 8), end: int(env.OUTREACH_WINDOW_END, 18) },
    timeZone: env.OUTREACH_TZ ?? "Europe/Lisbon",
  },

  crawl: {
    /** Identifies us and gives a human something to complain to. */
    userAgent:
      env.OUTREACH_UA ??
      "AwayOutreachBot/0.1 (+https://away.app; hello@away.app; human-operated, one page per hostel)",
    timeoutMs: int(env.OUTREACH_TIMEOUT_MS, 10_000),
    maxBytes: int(env.OUTREACH_MAX_BYTES, 600_000),
    maxPagesPerSite: int(env.OUTREACH_MAX_PAGES, 3),
    // Politeness, both in seconds.
    perHostDelayMs: int(env.OUTREACH_HOST_DELAY_MS, 1_200),
    requestSpacingMs: int(env.OUTREACH_SPACING_MS, 800),
    respectRobots: env.OUTREACH_IGNORE_ROBOTS !== "1",
  },

  source: {
    nominatim: env.OUTREACH_NOMINATIM ?? "https://nominatim.openstreetmap.org",
    overpass: env.OUTREACH_OVERPASS ?? "https://overpass-api.de/api/interpreter",
    radiusMeters: int(env.OUTREACH_RADIUS_M, 9_000),
  },

  mail: {
    // file = write .eml to disk (the default, and the demo); resend = real mail;
    // http = POST the payload somewhere (used by the self-test).
    transport: env.OUTREACH_MAIL_TRANSPORT ?? (env.RESEND_API_KEY ? "resend" : "file"),
    resendKey: env.RESEND_API_KEY ?? "",
    captureUrl: env.OUTREACH_MAIL_URL ?? "",
    outbox: env.OUTREACH_OUTBOX ?? new URL("../outbox", import.meta.url).pathname,
  },

  /** Signing key for the unsubscribe links and the ops session cookie. */
  secret: env.OUTREACH_SECRET ?? "",
  password: env.OUTREACH_PASSWORD ?? "",

  isProduction: env.NODE_ENV === "production",
};

/** A dev-only password, so `npm start` works without .env, but never in prod. */
export function opsPassword() {
  if (config.password) return config.password;
  return config.isProduction ? "" : "outreach";
}

/** True when the guard rails a real send depends on are all in place. */
export function readyToSendReal() {
  return Boolean(config.sender.postalAddress && config.mail.transport !== "file" && config.secret);
}

export function missingForRealSend() {
  const missing = [];
  if (!config.sender.postalAddress) missing.push("OUTREACH_POSTAL_ADDRESS");
  if (config.mail.transport === "file") missing.push("OUTREACH_MAIL_TRANSPORT=resend + RESEND_API_KEY");
  if (!config.secret) missing.push("OUTREACH_SECRET");
  // A localhost unsubscribe link is worse than none: it looks compliant and
  // doesn't work. Real mail needs a public URL.
  if (/^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/.test(config.publicUrl)) {
    missing.push("OUTREACH_PUBLIC_URL");
  }
  return missing;
}
