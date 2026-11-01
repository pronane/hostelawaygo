#!/usr/bin/env node
/**
 * End-to-end self-test. Boots four fake hostel websites and a mail capture
 * server, then walks the whole pipeline: discover → crawl → draft → approve →
 * send → unsubscribe, plus the guards that are supposed to say no.
 *
 * Nothing here touches the internet and no real address is ever used: the
 * hostel sites are on 127.0.0.x and the mail transport is the HTTP capture.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workDir = await mkdtemp(join(tmpdir(), "away-outreach-test-"));

/* ------------------------------------------------------------------ fixtures */

const SITES = {
  "127.0.0.2": {
    name: "Casa Uno",
    area: "Centro",
    pages: {
      "/": `<!doctype html><html><body>
        <h1>Casa Uno</h1><p>A hostel in the old town.</p>
        <img src="logo@2x.png"><a href="/contacto">Contacto</a>
        <script src="sentry@wixpress.com"></script>
      </body></html>`,
      "/contacto": `<!doctype html><html><body>
        <h2>Contacto</h2>
        <p>Recepción 24 horas.</p>
        <a href="mailto:reservas@hostel-uno.es?subject=Hola">reservas@hostel-uno.es</a>
      </body></html>`,
    },
    robots: "User-agent: *\nAllow: /\n",
  },
  "127.0.0.3": {
    name: "Casa Dos",
    area: "Triana",
    pages: {
      "/": `<!doctype html><html><body><h1>Casa Dos</h1><a href="/contacto">Contact</a></body></html>`,
      "/contacto": `<html><body><p>info@hostel-dos.es</p></body></html>`,
    },
    // The address exists, but only on a page we are told not to read.
    robots: "User-agent: *\nDisallow: /contacto\n",
  },
  "127.0.0.4": {
    name: "Casa Tres",
    area: "Alameda",
    pages: {
      "/": `<html><body><h1>Casa Tres</h1><p>Write to recepcion (at) hostel-tres.es</p></body></html>`,
    },
    robots: null,
  },
  "127.0.0.5": {
    name: "Casa Cuatro",
    area: "Macarena",
    pages: {
      "/": `<html><body><h1>Casa Cuatro</h1><footer><a href="mailto:info@hostel-cuatro.es">email</a></footer></body></html>`,
    },
    robots: null,
  },
};

const sites = createServer((request, response) => {
  const host = (request.headers.host ?? "").split(":")[0];
  const site = SITES[host];
  if (!site) {
    response.writeHead(404);
    return response.end("no site");
  }
  if (request.url === "/robots.txt") {
    if (!site.robots) {
      response.writeHead(404);
      return response.end();
    }
    response.writeHead(200, { "content-type": "text/plain" });
    return response.end(site.robots);
  }
  const page = site.pages[request.url.split("?")[0]];
  if (!page) {
    response.writeHead(404, { "content-type": "text/html" });
    return response.end("<html><body>not found</body></html>");
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(page);
});
await new Promise((resolve) => sites.listen(0, "0.0.0.0", resolve));
const sitePort = sites.address().port;

const captured = [];
const capture = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  captured.push(payload);
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ id: `capture-${captured.length}` }));
});
await new Promise((resolve) => capture.listen(0, "127.0.0.1", resolve));
const capturePort = capture.address().port;

const serverPort = await new Promise((resolve) => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const port = probe.address().port;
    probe.close(() => resolve(port));
  });
});

/* --------------------------------------------------------------------- env */

Object.assign(process.env, {
  OUTREACH_DB_PATH: join(workDir, "outreach.db"),
  OUTREACH_OUTBOX: join(workDir, "outbox"),
  OUTREACH_SECRET: "test-secret-not-a-real-one",
  OUTREACH_PASSWORD: "test-password",
  // Deliberately not localhost: a localhost unsubscribe link is what the
  // "ready to deliver" guard refuses, and this run should exercise delivery.
  OUTREACH_PUBLIC_URL: "https://outreach.test",
  OUTREACH_PORT: String(serverPort),
  OUTREACH_HOST: "127.0.0.1",
  OUTREACH_MAIL_TRANSPORT: "http",
  OUTREACH_MAIL_URL: `http://127.0.0.1:${capturePort}/capture`,
  OUTREACH_POSTAL_ADDRESS: "Away Lda, Rua da Prata 80, 1100-052 Lisboa, Portugal",
  OUTREACH_SENDER_NAME: "Nuno",
  OUTREACH_DAILY_CAP: "2",
  OUTREACH_WINDOW_START: "0",
  OUTREACH_WINDOW_END: "24",
  OUTREACH_HOST_DELAY_MS: "20",
  OUTREACH_SPACING_MS: "10",
  AWAY_APP_URL: "http://localhost:3000",
});

const { config, missingForRealSend } = await import("../lib/config.js");
const { openDb, one, all, signingSecret } = await import("../lib/db.js");
const store = await import("../lib/store.js");
const { crawlSite } = await import("../lib/crawl.js");
const { parseOverpass, buildOverpassQuery } = await import("../lib/discover.js");
const { renderDraft, draftProblems, draftWarnings } = await import("../lib/draft.js");
const { sendApproved } = await import("../lib/send.js");
const { unsubToken } = await import("../lib/tokens.js");
const { loadPartners, isPartner } = await import("../lib/partners.js");
const { DatabaseSync } = await import("node:sqlite");

const db = openDb(config.dbPath);
const secret = signingSecret(db, config.secret);

/* ------------------------------------------------------------------ harness */

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  \u001b[32m✓\u001b[0m ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  \u001b[31m✗\u001b[0m ${name}\n      ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message ?? "not equal"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

/* -------------------------------------------------------------------- tests */

console.log("\nOpenStreetMap parsing");

await test("parses hostels, keeps ways, drops untagged and unrelated places", () => {
  const payload = {
    elements: [
      { type: "node", id: 1, lat: 37.1, lon: -5.1, tags: { tourism: "hostel", name: "Casa Uno", website: "casauno.es" } },
      { type: "way", id: 2, center: { lat: 37.2, lon: -5.2 }, tags: { tourism: "guest_house", name: "Casa Dos" } },
      { type: "node", id: 3, tags: { tourism: "hostel" } },
      { type: "node", id: 4, tags: { tourism: "hotel", name: "Not A Hostel" } },
      { type: "node", id: 5, tags: { tourism: "hostel", name: "Casa Tres", capacity: "40" } },
    ],
  };
  const parsed = parseOverpass(payload);
  equal(parsed.length, 3, "three usable hostels");
  equal(parsed[0].website, "https://casauno.es", "scheme added to a bare domain");
  equal(parsed[0].sourceUrl, "https://www.openstreetmap.org/node/1");
  equal(parsed[1].sourceUrl, "https://www.openstreetmap.org/way/2");
  equal(parsed[2].beds, 40);
});

await test("query asks for hostels and guest houses inside a box", () => {
  const query = buildOverpassQuery({ bbox: { south: 1, west: 2, north: 3, east: 4 } });
  assert(query.includes('tourism"~"^(hostel|guest_house)$"'), "both types");
  assert(query.includes("(1,2,3,4)"), "bbox in south,west,north,east order");
  assert(query.includes("out center tags"), "ways get a centre point");
});

console.log("\nDiscovery and dedupe");

store.upsertCity(db, { slug: "testville", name: "Testville", country: "Testland", status: "prospect", lat: 37.39, lng: -5.98, launchNote: "We're opening Testville in March." });

await test("a second hostel on the same domain is refused", () => {
  const first = store.addProspect(db, "testville", {
    name: "Casa Uno", area: "Centro", website: `http://127.0.0.2:${sitePort}/`, source: "test", sourceUrl: "https://www.openstreetmap.org/node/1",
  });
  const second = store.addProspect(db, "testville", {
    name: "Casa Uno Annex", website: `http://127.0.0.2:${sitePort}/otra`, source: "test",
  });
  assert(first, "first inserted");
  equal(second, null, "same domain is not inserted twice");
});

for (const [ip, site] of Object.entries(SITES).slice(1)) {
  store.addProspect(db, "testville", {
    name: site.name,
    area: site.area,
    website: `http://${ip}:${sitePort}/`,
    source: "test",
    sourceUrl: `https://www.openstreetmap.org/node/${ip}`,
  });
}

console.log("\nCrawling");

const crawlOptions = {
  userAgent: config.crawl.userAgent,
  timeoutMs: config.crawl.timeoutMs,
  maxBytes: config.crawl.maxBytes,
  maxPages: config.crawl.maxPagesPerSite,
  spacingMs: config.crawl.spacingMs,
  respectRobots: config.crawl.respectRobots,
};

await test("follows the contact link and prefers the reservations address", async () => {
  const result = await crawlSite(`http://127.0.0.2:${sitePort}/`, crawlOptions);
  equal(result.email, "reservas@hostel-uno.es");
  assert(result.evidenceUrl.endsWith("/contacto"), `evidence should be the contact page, got ${result.evidenceUrl}`);
  assert(result.tried.length >= 2, "both pages were tried");
  assert(result.evidenceText.toLowerCase().includes("recepción") || result.evidenceText.length > 0, "a snippet is kept");
});

await test("ignores image and platform addresses", async () => {
  const result = await crawlSite(`http://127.0.0.2:${sitePort}/`, crawlOptions);
  assert(!/2x|wixpress|sentry/i.test(result.email), `picked a junk address: ${result.email}`);
});

await test("does not read a page robots.txt disallows", async () => {
  const result = await crawlSite(`http://127.0.0.3:${sitePort}/`, crawlOptions);
  equal(result.email, "", "no address found");
  assert(
    result.tried.some((entry) => entry.error === "disallowed by robots.txt"),
    "the disallowed page is recorded, not fetched"
  );
});

await test("understands an address written as 'name (at) domain'", async () => {
  const result = await crawlSite(`http://127.0.0.4:${sitePort}/`, crawlOptions);
  equal(result.email, "recepcion@hostel-tres.es");
});

await test("finds a mailto in the footer", async () => {
  const result = await crawlSite(`http://127.0.0.5:${sitePort}/`, crawlOptions);
  equal(result.email, "info@hostel-cuatro.es");
});

// Record the addresses the crawler found, the way the UI does.
for (const [ip, site] of Object.entries(SITES)) {
  const prospect = all(db, "SELECT * FROM prospects WHERE website LIKE ?", `http://${ip}:%`)[0];
  const result = await crawlSite(prospect.website, crawlOptions);
  if (result.email) {
    store.setProspectEmail(db, prospect.id, {
      email: result.email,
      evidenceUrl: result.evidenceUrl,
      evidenceText: result.evidenceText,
    });
  } else {
    db.prepare("UPDATE prospects SET status = 'no_email', note = ? WHERE id = ?").run(result.reason ?? "", prospect.id);
  }
}

console.log("\nDrafting");

const city = store.getCity(db, "testville");

await test("a letter names the hostel, carries the postal address and a working way out", () => {
  const prospect = all(db, "SELECT * FROM prospects WHERE name = 'Casa Uno'")[0];
  const draft = renderDraft({ prospect, city, secret, publicUrl: config.publicUrl });
  assert(draft.subject.includes("Casa Uno") || draft.subject.length > 10, "subject is written");
  assert(draft.body.startsWith("Hi Casa Uno,"), "opens with their name");
  assert(draft.body.includes("Rua da Prata 80"), "postal address present");
  assert(draft.body.includes(`${config.publicUrl}/u/`), "unsubscribe link present");
  assert(draft.body.includes("http://localhost:3000/partner"), "self-serve link present");
  assert(draft.body.includes("reservas@hostel-uno.es"), "says which address it used");
  assert(!/unsubscribe:\s*$/m.test(draft.body), "unsubscribe link is not empty");
  assert(draft.body.split(/\s+/).length < 260, `letters should stay short (${draft.body.split(/\s+/).length} words)`);
});

await test("a missing postal address is a warning, and blocks a real send", () => {
  const original = config.sender.postalAddress;
  config.sender.postalAddress = "";
  const warnings = draftWarnings({ secret });
  const missing = missingForRealSend();
  config.sender.postalAddress = original;
  assert(warnings.some((w) => w.includes("OUTREACH_POSTAL_ADDRESS")), "review shows the warning");
  assert(missing.includes("OUTREACH_POSTAL_ADDRESS"), "and the send path refuses");
});

await test("refuses a draft with no source page for the address", () => {
  const problems = draftProblems({ prospect: { email: "a@b.es", evidence_url: "" }, city, secret });
  assert(problems.some((p) => p.includes("source page")), "evidence is required");
});

for (const prospect of store.listProspects(db, "testville").filter((p) => p.email)) {
  store.saveDraft(db, prospect.id, renderDraft({ prospect, city, secret, publicUrl: config.publicUrl }));
}

console.log("\nApproval");

await test("approving records the person, not a bot", () => {
  const draft = all(
    db,
    "SELECT d.* FROM drafts d JOIN prospects p ON p.id = d.prospect_id WHERE p.name = 'Casa Uno'"
  )[0];
  store.approveDraft(db, draft.id, { actor: "test-operator", subject: draft.subject, body: draft.body });
  const prospect = store.getProspect(db, draft.prospect_id);
  equal(prospect.status, "approved");
  const entry = all(db, "SELECT * FROM audit WHERE action = 'approved' ORDER BY id DESC LIMIT 1")[0];
  equal(entry.actor, "test-operator");
});

await test("sending without an actor is refused", async () => {
  let threw = false;
  try {
    await sendApproved({ db, actor: "", secret });
  } catch {
    threw = true;
  }
  assert(threw, "sendApproved must name a person");
});

await test("a dry run reports without writing or sending", async () => {
  const before = all(db, "SELECT COUNT(*) AS n FROM sends")[0].n;
  const result = await sendApproved({ db, actor: "test-operator", secret, dryRun: true });
  equal(result.sent, 0);
  equal(result.wouldSend, 1);
  equal(all(db, "SELECT COUNT(*) AS n FROM sends")[0].n, Number(before), "no send rows written");
  equal(captured.length, 0, "nothing captured");
});

await test("sending delivers through the transport with unsubscribe headers", async () => {
  const result = await sendApproved({ db, actor: "test-operator", secret });
  equal(result.sent, 1, "one letter sent");
  equal(captured.length, 1, "one message captured");
  const message = captured[0];
  assert(message.headers["list-unsubscribe"].includes("/u/"), "List-Unsubscribe points at our page");
  assert(message.headers["list-unsubscribe"].includes("mailto:"), "and at the reply address");
  equal(message.headers["list-unsubscribe-post"], "List-Unsubscribe=One-Click");
  assert(message.text.includes("Rua da Prata 80"), "address in the delivered copy");
  equal(message.to, "reservas@hostel-uno.es");
});

await test("a second run does not write to the same hostel twice", async () => {
  const result = await sendApproved({ db, actor: "test-operator", secret });
  equal(result.sent, 0);
  equal(captured.length, 1);
});

console.log("\nWeb flow");

const child = spawn(process.execPath, ["server.js"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
child.stdout.on("data", (chunk) => (serverLog += chunk));
child.stderr.on("data", (chunk) => (serverLog += chunk));

const base = `http://127.0.0.1:${serverPort}`;
const deadline = Date.now() + 15_000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${base}/healthz`);
    if (response.ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
}

async function request(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const text = await response.text();
  const setCookie = response.headers.getSetCookie?.() ?? [];
  return { status: response.status, location: response.headers.get("location"), text, setCookie };
}

await test("the tool is closed to strangers", async () => {
  const response = await request("/queue");
  equal(response.status, 303);
  equal(response.location, "/login");
  const health = await fetch(`${base}/healthz`);
  equal(health.status, 200);
});

await test("a wrong password does not sign anyone in", async () => {
  const response = await request("/login", { method: "POST", body: { password: "nope" } });
  equal(response.status, 401);
  equal(response.setCookie.length, 0);
});

const login = await request("/login", { method: "POST", body: { password: "test-password" } });
const session = (login.setCookie[0] ?? "").split(";")[0];

await test("signing in with the right password sets a session", async () => {
  equal(login.status, 303);
  assert(session.startsWith("away_outreach="), "session cookie issued");
});

await test("a city can be opened from the overview form", async () => {
  const created = await request("/cities", {
    method: "POST",
    cookie: session,
    body: { name: "Testopolis", country: "Testland", status: "prospect", launchNote: "Opening in April." },
  });
  equal(created.status, 303);
  equal(created.location, "/cities/testopolis");
  assert(store.getCity(db, "testopolis"), "city exists");
  assert(all(db, "SELECT * FROM audit WHERE action = 'city_added'").length > 0, "city creation is audited");
});

const pending = all(
  db,
  "SELECT d.*, p.name FROM drafts d JOIN prospects p ON p.id = d.prospect_id WHERE p.status = 'drafted' AND p.name = 'Casa Cuatro'"
)[0];

await test("the review page shows the letter and its evidence", async () => {
  const response = await request(`/review?id=${pending.prospect_id}`, { cookie: session });
  equal(response.status, 200);
  assert(response.text.includes("Hi Casa Cuatro,"), "letter is rendered");
  assert(response.text.includes("hostel-cuatro.es"), "address shown");
  assert(response.text.includes("127.0.0.5"), "source page shown");
});

await test("approving through the form moves it to the outbox", async () => {
  const response = await request(`/review/${pending.prospect_id}/approve`, {
    method: "POST",
    cookie: session,
    body: { subject: pending.subject, body: `${pending.body}\n\nP.S. Edited by hand before approving.` },
  });
  equal(response.status, 303);
  const prospect = store.getProspect(db, pending.prospect_id);
  equal(prospect.status, "approved");
  const draft = store.getDraft(db, pending.id);
  assert(draft.body.includes("Edited by hand"), "the edit is what will be sent");
});

await test("the outbox sends only with the confirmation ticked", async () => {
  const refused = await request("/queue/send", { method: "POST", cookie: session, body: { limit: "5" } });
  equal(refused.status, 303);
  assert(refused.location.includes("k=bad"), "no confirmation, no send");
  equal(captured.length, 1, "nothing was captured");

  const sent = await request("/queue/send", { method: "POST", cookie: session, body: { limit: "5", confirm: "1" } });
  equal(sent.status, 303);
  assert(sent.location.includes("sent=1"), `expected a send, got ${sent.location}`);
  equal(captured.length, 2);
  assert(captured[1].text.includes("Edited by hand"), "the approved text is what went");
});

await test("the unsubscribe link works without a session and suppresses for good", async () => {
  const competitor = store.addProspect(db, "testville", {
    name: "Casa Cinco",
    website: `http://127.0.0.6:${sitePort}/`,
    email: "info@hostel-cinco.es",
    evidenceUrl: "http://127.0.0.6:port/contacto",
  });
  const token = unsubToken(secret, competitor, "info@hostel-cinco.es");
  const page = await request(`/u/${competitor}.${token}`);
  equal(page.status, 200);
  assert(page.text.includes("Stop the emails?"), "asks first");

  const confirmed = await request(`/u/${competitor}.${token}`, { method: "POST" });
  equal(confirmed.status, 200);
  assert(confirmed.text.includes("won't hear from us again"), "confirms");
  assert(store.isSuppressed(db, "info@hostel-cinco.es"), "address is suppressed");
  equal(store.getProspect(db, competitor).status, "blocked");

  const bad = await request(`/u/${competitor}.deadbeefdeadbeefdeadbeef`);
  equal(bad.status, 404, "a forged token does nothing");
});

await test("the daily cap stops the third letter of the day", async () => {
  const id = store.addProspect(db, "testville", {
    name: "Casa Seis",
    website: "https://casa-seis.test",
    email: "info@hostel-seis.es",
    evidenceUrl: "https://casa-seis.test/contacto",
  });
  const prospect = store.getProspect(db, id);
  store.saveDraft(db, prospect.id, renderDraft({ prospect, city, secret, publicUrl: config.publicUrl }));
  const draft = store.getDraftForProspect(db, prospect.id);
  store.approveDraft(db, draft.id, { actor: "test-operator", subject: draft.subject, body: draft.body });
  const result = await sendApproved({ db, actor: "test-operator", secret });
  equal(result.sent, 0);
  assert(
    result.results.some((r) => r.note.includes("daily cap")),
    `expected the cap to stop it, got ${JSON.stringify(result.results)}`
  );
});

await test("a reserved address is recorded as simulated, never delivered", async () => {
  const demo = store.addProspect(db, "testville", {
    name: "Demo Hostel",
    website: "https://demo-hostel.example",
    email: "hello@demo-hostel.example",
    evidenceUrl: "https://demo-hostel.example/contact",
  });
  store.saveDraft(db, demo, renderDraft({ prospect: store.getProspect(db, demo), city, secret, publicUrl: config.publicUrl }));
  const draft = store.getDraftForProspect(db, demo);
  store.approveDraft(db, draft.id, { actor: "test-operator", subject: draft.subject, body: draft.body });
  const before = captured.length;
  const result = await sendApproved({ db, actor: "test-operator", secret });
  equal(result.simulated, 1);
  equal(captured.length, before, "nothing hit the transport");
  const send = all(db, "SELECT * FROM sends ORDER BY id DESC LIMIT 1")[0];
  equal(send.status, "simulated");
});

console.log("\nNever emailing our own partners");

await test("reads the product database read-only and matches on address or domain", () => {
  const awayDb = join(workDir, "away.db");
  const product = new DatabaseSync(awayDb);
  product.exec(`CREATE TABLE hostels (name TEXT, slug TEXT, contact_email TEXT, status TEXT)`);
  product.prepare("INSERT INTO hostels VALUES (?,?,?,?)").run("Home Lisbon", "home-lisbon-hostel", "ana@homelisbon.pt", "active");
  product.prepare("INSERT INTO hostels VALUES (?,?,?,?)").run("Casa do Sol", "casa-do-sol", "rita@casadosol.pt", "pending");
  product.prepare("INSERT INTO hostels VALUES (?,?,?,?)").run("Closed", "closed-hostel", "old@closed.pt", "rejected");
  product.close();

  const index = loadPartners(awayDb);
  assert(index.available, "database found");
  assert(isPartner("ANA@Homelisbon.pt", "", index), "case-insensitive address match");
  assert(isPartner("", "casa-do-sol", index), "domain match");
  assert(!isPartner("someone@else.pt", "else.pt", index), "strangers are not partners");
  assert(!index.emails.has("old@closed.pt"), "rejected applications don't count");
});

await test("a keep-existing-partners guard stops a letter already queued", async () => {
  const awayDb = join(workDir, "away.db");
  const original = config.awayDbPath;
  config.awayDbPath = awayDb;
  const id = store.addProspect(db, "testville", {
    name: "Casa Siete",
    website: "https://casa-siete.test",
    email: "rita@casadosol.pt",
    evidenceUrl: "https://casa-siete.test/contacto",
  });
  const prospect = store.getProspect(db, id);
  store.saveDraft(db, id, renderDraft({ prospect, city, secret, publicUrl: config.publicUrl }));
  const draft = store.getDraftForProspect(db, id);
  store.approveDraft(db, draft.id, { actor: "test-operator", subject: draft.subject, body: draft.body });

  const before = captured.length;
  const result = await sendApproved({ db, actor: "test-operator", secret, force: true });
  config.awayDbPath = original;

  equal(captured.length, before, "nothing was sent");
  assert(
    result.results.some((r) => r.note.includes("already a partner")),
    `expected the partner guard, got ${JSON.stringify(result.results)}`
  );
  equal(store.getProspect(db, id).status, "partner");
});

console.log("\nAudit trail");

await test("every decision is on the record", () => {
  const actions = all(db, "SELECT DISTINCT action FROM audit").map((row) => row.action);
  for (const expected of ["approved", "send_sent", "send_simulated", "suppressed", "city_added"]) {
    assert(actions.includes(expected), `missing audit action: ${expected}`);
  }
});

await test("no letter can be sent twice to the same address", () => {
  const duplicates = all(
    db,
    "SELECT to_email, COUNT(*) n FROM sends WHERE status = 'sent' GROUP BY to_email HAVING n > 1"
  );
  equal(duplicates.length, 0, "one message per address");
});

await test("real delivery is configured in this test, so the guard is live", () => {
  equal(missingForRealSend(), [], "test environment is a complete send setup");
  equal(config.mail.transport, "http");
});

/* --------------------------------------------------------------------- exit */

child.kill("SIGTERM");
sites.close();
capture.close();
db.close?.();

if (failures.length) {
  console.log(`\n\u001b[31m${failures.length} failed\u001b[0m, ${passed} passed`);
  console.log("\n--- server log ---\n" + serverLog.split("\n").slice(-25).join("\n"));
  console.log(`Workspace kept for inspection: ${workDir}`);
  process.exit(1);
}

await rm(workDir, { recursive: true, force: true });
console.log(`\n\u001b[32m${passed} passed\u001b[0m`);
process.exit(0);
