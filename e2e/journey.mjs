#!/usr/bin/env node
/**
 * The whole walk-through, one run, over plain HTTP.
 *
 * `tests/30-full-journey.spec.ts` does the same thing with a real browser. This
 * script exists because a browser is not always available (CI containers, thin
 * sandboxes, review boxes), and a journey you cannot run is a journey nobody
 * trusts. It drives the same app the same way — real forms, real cookies, real
 * server actions — and prints one line per step so a failure says exactly where
 * the walk stopped.
 *
 * What it proves, in order:
 *   landing → signup → join a night → chat is gated on a confirmed email →
 *   confirm → chat → book a bed → pay in the sandbox → trips → safe night →
 *   apply as a hostel in a new city → pending → ops approves → hostel signs in →
 *   posts tonight → reception screen is locked → start Pro → checkout confirm →
 *   screen unlocked → cancel Pro → the city page counts the partner →
 *   another traveller books, pays, then cancels and is refunded.
 *
 * Usage:
 *   node journey.mjs                       # against http://localhost:3210
 *   BASE_URL=http://localhost:3000 node journey.mjs
 *
 * The server must be started the way `playwright.config.ts` starts it (blank
 * database, DEMO_LOGIN=1, OAUTH_MOCK=1, VERIFY_DEV_LINK=1, no STRIPE_SECRET_KEY
 * so billing falls back to the sandbox). `npm run journey` does that for you.
 */

const BASE = (process.env.BASE_URL ?? "http://localhost:3210").replace(/\/+$/, "");
const STAMP = Date.now();
const PASSWORD = "walkthrough-123";

const TRAVELLER = { name: "Weronika Nowak", email: `journey-traveller-${STAMP}@away.test` };
const SECOND = { name: "Marta K." }; // seeded, already confirmed
// A city Away has not listed yet, so the application has to create it.
const CITY = { name: "Sines", slug: "sines", country: "Portugal", tz: "Europe/Lisbon" };
const HOSTEL = {
  name: `Maré Alta Hostel ${STAMP}`,
  area: "Meia Praia",
  beds: "42",
  price: "23",
  contact: "Duarte Silva",
  email: `journey-hostel-${STAMP}@away.test`,
};

/** Same transform the app uses, so the slug is known before the hostel exists. */
const slugify = (value) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
HOSTEL.slug = slugify(HOSTEL.name);

// ---------------------------------------------------------------- tiny harness

let stepNo = 0;
const t0 = Date.now();

function step(label) {
  stepNo += 1;
  console.log(`  ${String(stepNo).padStart(2, "0")}. ${label}`);
}

function check(condition, message, detail) {
  if (condition) return;
  const extra = detail ? `\n     ${String(detail).slice(0, 900)}` : "";
  throw new Error(`${message}${extra}`);
}

const decode = (value) =>
  value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const strip = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

/** A browser-shaped client: a cookie jar, redirect-following, and form parsing. */
class Client {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
    this.path = "/";
    this.html = "";
    this.url = BASE + "/";
  }

  jar() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  remember(res) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const pair = raw.split(";")[0];
      const at = pair.indexOf("=");
      if (at > 0) this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
  }

  async send(path, init = {}) {
    const url = path.startsWith("http") ? path : BASE + path;
    const headers = { ...(init.headers ?? {}) };
    const jar = this.jar();
    if (jar) headers.cookie = jar;
    // A server action is a POST the framework treats like a cross-site request:
    // send the origin so it looks like the browser it is standing in for.
    if ((init.method ?? "GET") !== "GET") headers.origin = BASE;
    const res = await fetch(url, { ...init, headers, redirect: "manual" });
    this.remember(res);
    return res;
  }

  /** GET, following redirects. Returns the settled page. */
  async open(path, depth = 0) {
    const res = await this.send(path);
    if (res.status >= 300 && res.status < 400) {
      check(depth < 6, `too many redirects from ${path}`);
      return this.open(res.headers.get("location") ?? "/", depth + 1);
    }
    this.path = new URL(path.startsWith("http") ? path : BASE + path).pathname + (path.includes("?") ? `?${path.split("?")[1]}` : "");
    this.html = await res.text();
    this.url = res.url || path;
    check(res.status === 200, `${this.label}: GET ${path} → ${res.status}`, strip(this.html));
    return this;
  }

  /** POST a form body (or JSON) and follow wherever it lands. */
  async post(path, body, headers = {}, depth = 0) {
    const res = await this.send(path, { method: "POST", body, headers });
    if (res.status >= 300 && res.status < 400) {
      check(depth < 6, `too many redirects after POST ${path}`);
      return this.open(res.headers.get("location") ?? "/");
    }
    this.html = await res.text();
    this.url = res.url || path;
    check(res.status === 200, `${this.label}: POST ${path} → ${res.status}`, strip(this.html));
    return this;
  }

  /** Fill in one of this page's forms and submit it like a person would. */
  async submit(marker, fields = {}) {
    const form = this.forms().find((f) => `${f.attrs} ${f.inner}`.includes(marker) || f.text.includes(marker));
    check(form, `${this.label}: no form on ${this.path} mentioning "${marker}"`, this.forms().map((f) => `- ${f.text.slice(0, 120)}`).join("\n     "));
    check(!form.inner.includes("$ACTION_REF_"), `${this.label}: "${marker}" is an inline action and cannot be replayed over HTTP`);

    const data = new FormData();
    for (const input of form.inputs) {
      if (!input.name) continue;
      if (input.type === "submit" || input.type === "button" || input.type === "checkbox" || input.type === "radio") continue;
      if (input.value !== "" || input.name.startsWith("$ACTION")) data.set(input.name, input.value);
    }
    for (const [key, value] of Object.entries(fields)) data.set(key, String(value));

    const action = form.action && form.action.startsWith("/") ? form.action : this.path;
    return this.post(action, data);
  }

  forms() {
    return [...this.html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].map(([, attrs, inner]) => {
      const inputs = [...inner.matchAll(/<input\b([^>]*?)\/?>(?![\s\S]*?<\/form>)/g)].map(([, a]) => ({
        tag: a,
        name: /name="([^"]*)"/.exec(a)?.[1] ?? "",
        value: decode(/value="([^"]*)"/.exec(a)?.[1] ?? ""),
        type: /type="([^"]*)"/.exec(a)?.[1] ?? "text",
        id: /id="([^"]*)"/.exec(a)?.[1] ?? "",
      }));
      const text = strip(inner);
      const label = decode(/class="([^"]*)"/.exec(attrs)?.[1] ?? "");
      return { attrs, inner, text, label, inputs, action: decode(/action="([^"]*)"/.exec(attrs)?.[1] ?? "") };
    });
  }

  sees(pattern) {
    return pattern.test(strip(this.html));
  }

  expect(pattern, what) {
    const text = strip(this.html);
    check(pattern.test(text), `${this.label}: expected ${what} on ${this.path}`, text.slice(0, 900));
    return this;
  }

  expectNot(pattern, what) {
    const text = strip(this.html);
    check(!pattern.test(text), `${this.label}: did not expect ${what} on ${this.path}`, text.slice(0, 900));
    return this;
  }

  async json(path, payload) {
    const res = await this.send(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    check(res.ok, `${this.label}: POST ${path} → ${res.status}`, text);
    return text ? JSON.parse(text) : {};
  }

  /** Sign in with an address and password, the long way round. */
  async signIn(email, password = PASSWORD) {
    await this.open("/login");
    await this.submit("Sign in", { email, password });
    this.expect(/sign out|You're|you/i, "a signed-in page");
    return this;
  }

  /** Sign in with a seeded demo account by clicking the button with its name on it. */
  async signInDemo(who) {
    await this.open("/login");
    await this.submit(who);
    return this;
  }

  async signOut() {
    await this.open("/you");
    if (this.sees(/sign out/i)) await this.submit("Sign out");
    await this.open("/login");
    return this;
  }
}

const first = (pattern, html) => pattern.exec(html)?.[1];

async function main() {
  console.log(`\nAway — full journey over HTTP against ${BASE}\n`);

  // -------------------------------------------------------------- 1. landing
  step("a stranger lands and is told what this is");
  const anon = new Client("stranger");
  await anon.open("/");
  anon.expect(/hostel you're in/i, 'the hero ("the hostel you\'re in")');
  anon.expect(/Find your hostel|Explore/i, "a way into the city guide");
  anon.expect(/I run a hostel|hostel/i, "a way in for hostels");
  anon.expectNot(/Sign out/i, "a sign-out link for a visitor");

  // --------------------------------------------------------------- 2. signup
  step("signs up as a traveller");
  const me = new Client("traveller");
  await me.open("/signup");
  await me.submit("Create account", {
    name: TRAVELLER.name,
    email: TRAVELLER.email,
    password: PASSWORD,
  });
  await me.open("/you");
  me.expect(new RegExp(TRAVELLER.email.replace(/[.+]/g, "\\$&"), "i"), "the new account's address");
  me.expect(/to chat in events/i, "the confirm-your-email prompt");

  // ---------------------------------------------- 3. join a night (and the gate)
  step("joins a night, and the chat asks for a confirmed email first");
  await me.open("/explore");
  const eventHref = first(/href="(\/event\/\d+)"/, me.html);
  check(eventHref, "no event on /explore to join", strip(me.html).slice(0, 600));
  const eventId = Number(eventHref.replace("/event/", ""));
  await me.open(eventHref);
  me.expect(/going/i, "the guest count");
  const joined = await me.json("/api/join", { eventId });
  check(joined.joined === true, `join said ${JSON.stringify(joined)}`);
  await me.open(eventHref);
  me.expect(/You're in/i, "the joined state");

  const chatGate = await me.submit("chat-form", { body: `Too early — ${STAMP}`, eventId });
  chatGate.expect(/Confirm your email to chat/i, "the chat gate");
  check(/chat=verify/.test(chatGate.path), `expected ?chat=verify, got ${chatGate.path}`);

  // ------------------------------------------------ 4. confirm the email
  step("confirms the email from the link on the You page");
  await me.open("/you");
  const afterResend = await me.submit("Send link");
  const link = afterResend.html.match(/href="([^"]*\/verify\?token=[a-f0-9]+)"/)?.[1];
  check(link, "no confirm link on /you after asking for one", strip(afterResend.html).slice(0, 700));
  await me.open(decode(link));
  check(/\/you\?verified=1/.test(me.path), `expected /you?verified=1, landed on ${me.path}`, strip(me.html).slice(0, 400));
  me.expect(/confirm your email|verified/i, "confirmation of the confirmation");
  me.expectNot(/Confirm .* to chat in events/i, "the unconfirmed banner");

  // ------------------------------------------------- 5. talk in the chat
  step("goes back and says something in the chat");
  const message = `Coming to this — ${STAMP}`;
  await me.open(eventHref);
  await me.submit("chat-form", { body: message, eventId });
  await me.open(eventHref);
  me.expect(new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "their own message in the chat");

  // ------------------------------------------- 6. a group, joined by a stranger
  step("makes a group link, and a friend joins it with nothing but a name");
  await me.open(eventHref);
  const group = await me.submit("Make a group link", {
    eventId,
    size: "4",
    plan: `Dorm crew — ${STAMP}`,
  });
  const groupToken = group.path.match(/\/g\/([A-Za-z0-9_-]+)/)?.[1];
  check(groupToken, `no group token: landed on ${group.path}`, strip(group.html).slice(0, 600));
  group.expect(/Group made/i, "the group link being ready");

  const friend2 = new Client("group friend");
  await friend2.open(`/g/${groupToken}`);
  friend2.expect(/Your first name/i, "the one-field join form");
  friend2.expect(/Dorm crew/i, "what the group is called");
  const joinedGroup = await friend2.submit("I'm in", { name: "Iris" });
  joinedGroup.expect(/You're in/i, "the newcomer being counted");
  joinedGroup.expect(/Iris/i, "their name on the list");

  await me.open(eventHref);
  me.expect(/Coming together/i, "the group on the event page");
  me.expect(/2 people in 1 group/i, "two of us counted");

  // --------------------------------------------------------- 7. book a bed
  step("books a bed in a Lisbon hostel");
  // Two nights from now, so the traveller is both a real booking and an
  // "arriving this week" on the event page — the thing the cohort line counts.
  const inDate = isoDay(2);
  const outDate = isoDay(4);
  await me.open("/explore");
  const hostelHref = first(/href="(\/hostel\/[a-z0-9-]+)"/, me.html);
  check(hostelHref, "no hostel on /explore", strip(me.html).slice(0, 600));
  await me.open(`${hostelHref}?in=${inDate}&out=${outDate}`);
  const bookingPage = await me.submit("room-book");
  check(/\/booking\/[a-z0-9-]+/i.test(bookingPage.path), `booking did not open a reference: ${bookingPage.path}`, strip(me.html).slice(0, 600));
  const reference = bookingPage.path.match(/\/booking\/([a-z0-9-]+)/i)?.[1];
  check(reference, "no booking reference");
  bookingPage.expect(/sandbox/i, "the sandbox payment button");

  // ------------------------------------------------------------ 7. pay
  step("pays for it (sandbox, no card)");
  const paid = await me.submit("Pay", {});
  paid.expect(/Paid|Confirmed/i, "the paid state");
  paid.expect(/sandbox/i, "that the payment was a sandbox one");

  // The number that makes "19 going" mean something: they are in town.
  await me.open(eventHref);
  me.expect(/arrives? within the week/i, "the arrival cohort on the event page");

  // ------------------------------------------------------------ 9. trips
  step("the stay shows up in trips");
  await me.open("/trips");
  me.expect(/booking-card|Upcoming|Lisbon/i, "the trip list");
  me.expect(new RegExp(reference.slice(0, 6), "i"), "the booking reference on /trips");

  // ------------------------------------------------------ 9. safe night
  step("tells a friend where they are tonight, and gets home safe");
  await me.open("/safe");
  me.expect(/Share my night/i, "the safe-night page");
  const safe = await me.submit("Where are you going", {
    plan: `Fado night at Tasca do Chico — ${STAMP}`,
    backByIso: new Date(Date.now() + 4 * 3_600_000).toISOString(),
    tz: "Europe/Lisbon",
    friend: "Sam",
  });
  const safeToken = safe.path.match(/created=([A-Za-z0-9_-]+)/)?.[1];
  check(safeToken, `no safe-night token: landed on ${safe.path}`, strip(safe.html).slice(0, 600));

  const friend = new Client("friend");
  await friend.open(`/safe/${safeToken}`);
  friend.expect(/Fado night/i, "the plan a friend sees");
  friend.expect(/Weronika/i, "the first name only");

  await me.open("/safe");
  await me.submit("I'm home safe");
  await friend.open(`/safe/${safeToken}`);
  friend.expect(/Home safe|home safe/i, "the friend's link saying they got home");

  // ------------------------------------------ 10. apply as a hostel (new city)
  step("a hostel applies, in a city Away has never heard of");
  const hostel = new Client("applicant");
  await hostel.open("/partner");
  hostel.expect(/Apply/i, "the application form");
  await hostel.submit("Apply", {
    hostelName: HOSTEL.name,
    city: "other",
    cityName: CITY.name,
    cityCountry: CITY.country,
    cityTz: CITY.tz,
    area: HOSTEL.area,
    description: "Eight rooms, a courtyard and the best breakfast on the Alentejo coast.",
    beds: HOSTEL.beds,
    price: HOSTEL.price,
    contactName: HOSTEL.contact,
    email: HOSTEL.email,
    password: PASSWORD,
  });
  hostel.expect(new RegExp(`${CITY.name} is on the list now`, "i"), "the new city being accepted");
  hostel.expect(/first hostel/i, "that they are the first hostel there");

  // ------------------------------------------------------- 11. pending view
  step("the applicant is pending, and the public city page says so");
  await hostel.open("/hostel-admin");
  hostel.expect(/pending|review|waiting/i, "a pending state instead of a dashboard");
  await hostel.open(`/c/${CITY.slug}`);
  hostel.expect(new RegExp(`${CITY.name} is opening`, "i"), "the opening city page");
  hostel.expect(/apply in two minutes/i, "the way in for their neighbours");
  // Applying is not approval: the count stays where it was until ops says yes.
  const pendingPartners = partnerCount(hostel.html);

  // -------------------------------------------------------- 12. ops approves
  step("ops approves the application");
  const ops = new Client("ops");
  await ops.open("/login");
  const opsRow = ops.forms().find((f) => /Away Ops|admin/i.test(f.text));
  check(opsRow, "no ops demo account on /login", ops.forms().map((f) => f.text.slice(0, 80)).join(" | "));
  await ops.submit("Away Ops");
  await ops.open(`/admin/cities/${CITY.slug}`);
  const rowIndex = ops.html.indexOf(HOSTEL.name);
  check(rowIndex >= 0, `ops cannot see ${HOSTEL.name} on /admin/cities/${CITY.slug}`, strip(ops.html).slice(0, 900));
  await ops.submit("Approve", { hostelId: String(hostelIdFrom(ops.html, HOSTEL.name)) });
  check(/approved=/.test(ops.path), `approving ${HOSTEL.name} did not land on ?approved= (at ${ops.path})`, strip(ops.html).slice(0, 700));
  ops.expect(new RegExp(HOSTEL.name), "the hostel on the admin city page");
  ops.expect(/approved|live now|is live/i, "confirmation from ops");

  // ------------------------------------------- 13. the hostel signs in and posts
  step("the approved hostel signs in and posts tonight");
  await hostel.signIn(HOSTEL.email);
  await hostel.open("/hostel-admin");
  hostel.expect(new RegExp(HOSTEL.name), "their own dashboard");
  const title = `Sunset paddle ${STAMP}`;
  await hostel.open("/post");
  const posted = await hostel.json("/api/events", {
    title,
    startsAt: "20:00",
    priceCents: 500,
    category: "outdoors",
    description: "Boards and a guide, back before dark.",
    openToAll: true,
  });
  check(posted.id, `posting an event returned ${JSON.stringify(posted)}`);
  await hostel.open(`/event/${posted.id}`);
  hostel.expect(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "the new event page");

  // The poster on the wall has to be in the language at the desk, not ours.
  await hostel.open(`/hostel/${HOSTEL.slug}/kit?lang=pt`);
  hostel.expect(/O que há/i, "the poster in Portuguese");
  hostel.expect(/hoje à noite/i, "the Portuguese headline");
  hostel.expectNot(/What's on/i, "the English headline in Portuguese mode");
  await hostel.open(`/hostel/${HOSTEL.slug}/kit?lang=pl`);
  hostel.expect(/Co jest/i, "the poster in Polish");
  await hostel.open(`/hostel/${HOSTEL.slug}/kit`);
  hostel.expect(/What's on/i, "English when no language is asked for");
  hostel.expect(/Print it in their language/i, "the language switcher");

  // ----------------------------------------------- 14. the screen is locked
  step("the reception screen is locked while the hostel is free");
  await hostel.open(`/hostel/${HOSTEL.slug}/kit`);
  hostel.expect(/Reception screen/i, "the kit's link to the screen");
  await hostel.open(`/hostel/${HOSTEL.slug}/board`);
  hostel.expect(/part of Away Pro/i, "the Pro wall");
  hostel.expectNot(/Scan to join in/i, "the live screen before paying");

  // ------------------------------------------------------- 15. start Pro
  step("the hostel starts paying for Pro through the checkout");
  await hostel.open("/hostel-admin");
  const checkout = await hostel.submit("Turn on Pro");
  check(/\/billing\/sandbox\//.test(checkout.path), `expected the sandbox checkout, got ${checkout.path}`, strip(checkout.html).slice(0, 500));
  checkout.expect(/no card/i, "the sandbox explanation");
  const confirmed = await checkout.submit("Confirm");
  check(/billing=activated/.test(confirmed.path), `expected ?billing=activated, got ${confirmed.path}`, strip(confirmed.html).slice(0, 500));
  confirmed.expect(/Pro is on/i, "Pro switched on");

  // -------------------------------------------------- 16. unlocked, then cancel
  step("Pro unlocks the screen, and the hostel can cancel in one click");
  await hostel.open(`/hostel/${HOSTEL.slug}/board`);
  hostel.expect(/Scan to join in/i, "the live screen");
  hostel.expectNot(/part of Away Pro/i, "the Pro wall");
  // Cancelling is a front-desk job, not a screen job.
  // ...and a group at the hostel's own night shows up on that screen, which is
  // the thing the desk actually wants from it.
  await me.open(`/event/${posted.id}`);
  const paddle = await me.submit("Make a group link", { eventId: posted.id, size: "5", plan: "Paddle crew" });
  const paddleToken = paddle.path.match(/\/g\/([A-Za-z0-9_-]+)/)?.[1];
  check(paddleToken, `no group token for the paddle: ${paddle.path}`);
  await friend2.open(`/g/${paddleToken}`);
  await friend2.submit("I'm in", { name: "Iris" });

  await hostel.open(`/hostel/${HOSTEL.slug}/board`);
  hostel.expect(/2 in a group/i, "the group on the reception screen");

  await hostel.open("/hostel-admin");
  const cancelled = await hostel.submit("Cancel Pro");
  cancelled.expect(/Pro · ending|ends on|ending/i, "the ending state");
  cancelled.expectNot(/Pro is on/i, "the active state after cancelling");
  await hostel.open("/hostel-admin");
  hostel.expect(/billing_events|receipt|history|Cancelled|ending/i, "the billing trail");

  // --------------------------------------------- 17. the city counts a partner
  step("the city page now counts one approved partner");
  await anon.open(`/c/${CITY.slug}`);
  anon.expect(new RegExp(HOSTEL.name), "the new hostel on the city page");
  anon.expect(/PARTNER HOSTELS|Partner hostels/i, "the partner list");
  const approvedPartners = partnerCount(anon.html);
  check(
    approvedPartners === pendingPartners + 1,
    `the city counts ${approvedPartners} partners after approval, expected ${pendingPartners + 1}`
  );

  // ------------------------------------------- 18. a second traveller cancels
  step("another traveller books, pays, then cancels and is refunded");
  const other = new Client("second traveller");
  await other.signInDemo(SECOND.name);
  await other.open(`${hostelHref}?in=${isoDay(30)}&out=${isoDay(32)}`);
  const secondBooking = await other.submit("room-book");
  const secondRef = secondBooking.path.match(/\/booking\/([a-z0-9-]+)/i)?.[1];
  check(secondRef, "the second booking has no reference", strip(secondBooking.html).slice(0, 500));
  const secondPaid = await other.submit("Pay", {});
  secondPaid.expect(/Paid|Confirmed/i, "the paid state");
  const refunded = await other.submit("Cancel booking");
  refunded.expect(/Refunded|Cancelled/i, "the cancellation");
  await other.open("/trips");
  other.expect(/Refunded|Cancelled/i, "the cancelled stay on /trips");

  // ------------------------------------------------------------- done
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ ${stepNo} steps, the whole walk-through, in ${seconds}s.\n`);
}

/**
 * The hostel id from the admin row that mentions `name`.
 *
 * A row is a `<div class="admin-row">` whose buttons sit in forms *after* the
 * text, so the id has to be looked for inside the row, not inside the name's
 * own element — and by row, not by "nearest id anywhere", or a second pending
 * application gets approved by mistake.
 */
function hostelIdFrom(html, name) {
  for (const row of html.split("admin-row").slice(1)) {
    if (!strip(row).includes(name)) continue;
    const id = /name="hostelId"[^>]*value="(\d+)"/.exec(row)?.[1];
    if (id) return id;
  }
  check(false, `no admin row for ${name}`, strip(html).slice(0, 900));
}

/** "1 / 3 partner hostels" → 1. */
function partnerCount(html) {
  const text = strip(html);
  const match = /(\d+)\s*\/\s*3\s*PARTNER HOSTELS/i.exec(text);
  check(match, "no partner count on the city page", text.slice(0, 600));
  return Number(match[1]);
}

function isoDay(offset) {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}\n`);
  process.exit(1);
});
