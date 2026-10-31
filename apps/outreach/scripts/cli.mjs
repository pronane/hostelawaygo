#!/usr/bin/env node
/**
 * The command line: everything the UI does, minus the reading.
 *
 * `send` is deliberately two-step — without `--yes` it prints exactly what it
 * would do and exits. There is no flag that drafts and sends in one go.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { config, missingForRealSend } from "../lib/config.js";
import { audit, openDb, signingSecret } from "../lib/db.js";
import {
  addProspect,
  counts,
  getCity,
  listCities,
  listProspects,
  listQueue,
  listSends,
  saveDraft,
  setProspectEmail,
  upsertCity,
} from "../lib/store.js";
import { crawlSite } from "../lib/crawl.js";
import { readCityFile, discoverCity } from "../lib/discover.js";
import { renderDraft, draftProblems } from "../lib/draft.js";
import { sendApproved, sendWindowState } from "../lib/send.js";
import { isSuppressed } from "../lib/store.js";
import { isPartner, loadPartners } from "../lib/partners.js";
import { slugify } from "../lib/util.js";

const db = openDb(config.dbPath);
const secret = signingSecret(db, config.secret);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    city: { type: "string", short: "c" },
    country: { type: "string" },
    fixture: { type: "string", short: "f" },
    limit: { type: "string", short: "l" },
    radius: { type: "string" },
    "no-guesthouses": { type: "boolean" },
    "dry-run": { type: "boolean" },
    yes: { type: "boolean", short: "y" },
    force: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const command = positionals[0] ?? "status";

const bold = (value) => `\u001b[1m${value}\u001b[0m`;
const dim = (value) => `\u001b[2m${value}\u001b[0m`;
const green = (value) => `\u001b[32m${value}\u001b[0m`;
const red = (value) => `\u001b[31m${value}\u001b[0m`;
const yellow = (value) => `\u001b[33m${value}\u001b[0m`;

function help() {
  console.log(`${bold("Away outreach")} — find hostels in a city, draft them a letter, send nothing on your own.

  ${bold("npm run demo")}                        seed Seville and draft the letters
  ${bold("discover")} --city "Valencia" --country Spain
                                        OpenStreetMap: every hostel in the city box.
  ${bold("discover")} --city valencia --fixture fixtures/sevilla.json
                                        the same pipeline from a file (no network)
  ${bold("enrich")} --city valencia [--limit 8]
                                        fetch each hostel's own site for a published address
  ${bold("draft")} --city valencia      write the letters
  ${bold("send")} [--limit 5] [--dry-run] [--yes]
                                        send what a human approved. Without --yes: print only.
  ${bold("status")}                     where everything stands
  ${bold("doctor")}                     check the guards before a real run
  ${bold("reset")}                      delete the database

The web review queue is ${bold("npm start")} → http://localhost:${config.port}`);
}

function requireCityArg() {
  const input = values.city;
  if (!input) {
    console.error(red("Need --city <name or slug>"));
    process.exit(1);
  }
  const slug = slugify(input);
  const existing = getCity(db, slug);
  return { slug, existing, fallbackName: input };
}

function ensureCity() {
  const { slug, existing } = requireCityArg();
  if (existing) return existing;
  upsertCity(db, { slug, name: values.city, country: values.country ?? "", status: "prospect" });
  audit(db, "cli", "city_added", `city:${slug}`, values.city);
  return getCity(db, slug);
}

async function demo() {
  const file = await readCityFile(join(import.meta.dirname, "..", "fixtures", "sevilla.json"));
  upsertCity(db, file.city);
  let added = 0;
  for (const prospect of file.prospects) {
    if (addProspect(db, file.city.slug, prospect)) added += 1;
  }
  const city = getCity(db, file.city.slug);
  let drafted = 0;
  for (const prospect of listProspects(db, city.slug)) {
    if (!prospect.email || !["new", "enriched"].includes(prospect.status)) continue;
    saveDraft(db, prospect.id, renderDraft({ prospect, city, secret, publicUrl: config.publicUrl }));
    drafted += 1;
  }
  console.log(`${green("Seville ready.")} ${added} hostels from the fixture, ${drafted} letters drafted.`);
  console.log(dim("These are reserved .example addresses: nothing can be delivered to them, ever."));
  console.log(`\nNext: ${bold("npm start")} → http://localhost:${config.port}/review`);
}

async function discover() {
  const { slug } = requireCityArg();
  let city = getCity(db, slug);

  if (values.fixture) {
    const file = await readCityFile(values.fixture);
    upsertCity(db, {
      slug,
      name: city?.name ?? file.city.name ?? values.city,
      country: city?.country ?? file.city.country ?? values.country ?? "",
      status: city?.status ?? file.city.status ?? "prospect",
      lat: city?.lat ?? file.city.lat ?? null,
      lng: city?.lng ?? file.city.lng ?? null,
      launchNote: city?.launch_note ?? file.city.launchNote ?? "",
    });
    city = getCity(db, slug);
    let added = 0;
    for (const prospect of file.prospects) {
      if (addProspect(db, slug, prospect)) added += 1;
    }
    console.log(`${green(`${added} added`)} from ${values.fixture} (${file.prospects.length} in the file).`);
  } else {
    console.log(dim(`Querying OpenStreetMap around ${city?.name ?? values.city}…`));
    const result = await discoverCity({
      mode: "osm",
      city: { name: city?.name ?? values.city, country: city?.country ?? values.country ?? "", lat: city?.lat, lng: city?.lng },
      options: {
        nominatim: config.source.nominatim,
        overpass: config.source.overpass,
        userAgent: config.crawl.userAgent,
        radius: Number(values.radius) || config.source.radiusMeters,
        includeGuesthouses: !values["no-guesthouses"],
      },
    });
    upsertCity(db, {
      slug,
      name: result.city.name ?? values.city,
      country: result.city.country ?? values.country ?? "",
      status: city?.status ?? "prospect",
      lat: result.city.lat,
      lng: result.city.lng,
      launchNote: city?.launch_note ?? "",
    });
    let added = 0;
    for (const prospect of result.prospects) {
      if (addProspect(db, slug, prospect)) added += 1;
    }
    console.log(`${green(`${added} added`)} of ${result.prospects.length} returned by OpenStreetMap.`);
  }

  const found = listProspects(db, slug);
  const withSite = found.filter((p) => p.website).length;
  const withEmail = found.filter((p) => p.email).length;
  console.log(`${found.length} in ${slug}: ${withSite} have a website, ${withEmail} already have an address.`);
  if (withSite) console.log(`\nNext: ${bold(`npm run enrich -- --city ${slug}`)}`);
  else console.log("\nNothing to crawl — these have no website in OpenStreetMap.");
}

async function enrich() {
  const city = ensureCity();
  const limit = Number(values.limit) || 10;
  const targets = listProspects(db, city.slug).filter((p) => p.website && !p.email);
  console.log(`${targets.length} with a site and no address. Trying ${Math.min(limit, targets.length)}.`);

  let found = 0;
  for (const prospect of targets.slice(0, limit)) {
    const result = await crawlSite(prospect.website, {
      userAgent: config.crawl.userAgent,
      timeoutMs: config.crawl.timeoutMs,
      maxBytes: config.crawl.maxBytes,
      maxPages: config.crawl.maxPagesPerSite,
      spacingMs: config.crawl.perHostDelayMs,
      respectRobots: config.crawl.respectRobots,
    });
    if (result.email && isSuppressed(db, result.email)) {
      console.log(`  ${yellow("suppressed")}  ${prospect.name}`);
      continue;
    }
    if (result.email) {
      setProspectEmail(db, prospect.id, {
        email: result.email,
        evidenceUrl: result.evidenceUrl,
        evidenceText: result.evidenceText,
      });
      found += 1;
      console.log(`  ${green("found")}       ${prospect.name} → ${result.email} ${dim(`(${result.evidenceUrl})`)}`);
    } else {
      const { run } = await import("../lib/db.js");
      run(db, "UPDATE prospects SET status = 'no_email', note = ?, updated_at = ? WHERE id = ?", result.reason ?? "", new Date().toISOString(), prospect.id);
      console.log(`  ${dim("none")}        ${prospect.name} — ${result.reason ?? "nothing found"}`);
    }
  }
  console.log(`\n${found} addresses found.`);
  if (found) console.log(`Next: ${bold(`npm run draft -- --city ${city.slug}`)}`);
}

async function draft() {
  const city = ensureCity();
  const partners = loadPartners();
  const targets = listProspects(db, city.slug).filter((p) => p.email && ["new", "enriched", "no_email"].includes(p.status));
  let made = 0;
  for (const prospect of targets) {
    if (isSuppressed(db, prospect.email)) continue;
    if (isPartner(prospect.email, prospect.domain, partners)) {
      const { setProspectStatus } = await import("../lib/store.js");
      setProspectStatus(db, prospect.id, "partner", "already on the platform", "cli");
      continue;
    }
    saveDraft(db, prospect.id, renderDraft({ prospect, city, secret, publicUrl: config.publicUrl }));
    made += 1;
  }
  console.log(`${made} letters drafted in ${city.name}.`);
  console.log(`Next: read them at ${bold(`http://localhost:${config.port}/review`)} and approve the ones you'd send.`);
}

async function send() {
  const queue = listQueue(db);
  if (!queue.length) {
    console.log("Nothing approved. Draft and approve letters first — this command never writes one.");
    return;
  }

  const limit = Number(values.limit) || config.limits.dailyCap;
  const targets = queue.slice(0, limit);
  console.log(`${bold(targets.length)} approved letter${targets.length === 1 ? "" : "s"}:`);
  for (const item of targets) {
    const problems = draftProblems({ prospect: { email: item.email, evidence_url: item.evidence_url } });
    const flag = problems.length ? red(` [${problems.join(", ")}]`) : "";
    console.log(`  ${item.name} ${dim(`<${item.email}>`)} — ${item.subject}${flag}`);
  }

  const window = sendWindowState();
  const missing = missingForRealSend();
  console.log("");
  if (missing.length) console.log(yellow(`Real delivery is off: ${missing.join(", ")}`));
  console.log(dim(`send window ${window.label}: ${window.open ? "open" : "closed"}`));

  if (values["dry-run"] || !values.yes) {
    console.log("");
    console.log(yellow("Nothing sent."), "Re-run with --yes to send these, or approve more in the web queue.");
    return;
  }

  const result = await sendApproved({ db, actor: "cli", limit, force: Boolean(values.force), secret });
  console.log("");
  console.log(`${green(`sent ${result.sent}`)} · simulated ${result.simulated} · skipped ${result.skipped} · refused ${result.refused} · failed ${result.failed}`);
  for (const item of result.results) {
    const colour = item.status === "sent" ? green : item.status === "failed" || item.status === "refused" ? red : dim;
    console.log(`  ${colour(item.status.padEnd(10))} ${item.name} — ${item.note ?? ""}`);
  }
}

function status() {
  const c = counts(db);
  const cities = listCities(db);
  console.log(bold("Away outreach"));
  console.log(`  database      ${config.dbPath}`);
  console.log(`  mail          ${config.mail.transport}${missingForRealSend().length ? yellow(" (simulated only)") : ""}`);
  console.log(`  cap / window  ${config.limits.dailyCap} per day · ${sendWindowState().label}`);
  console.log("");
  console.log(`  ${c.to_draft} to draft · ${c.awaiting_review} awaiting review · ${c.approved} approved · ${c.sent} written to · ${c.suppressed} suppressed`);
  console.log("");
  if (!cities.length) {
    console.log(dim("No cities yet. `npm run demo`, or `npm run discover -- --city \"Valencia\"`."));
    return;
  }
  for (const city of cities) {
    console.log(
      `${bold(city.name.padEnd(12))} ${String(city.found).padStart(3)} found · ${String(city.with_email).padStart(3)} with email · ${String(city.approved).padStart(2)} approved · ${String(city.sent).padStart(2)} sent  ${dim(city.status)}`
    );
  }
  const recent = listSends(db, 5);
  if (recent.length) {
    console.log("\n" + bold("Recent sends"));
    for (const send of recent) {
      console.log(`  ${send.status.padEnd(10)} ${send.name} <${send.to_email}> ${dim(send.sent_at.slice(0, 16).replace("T", " "))}`);
    }
  }
}

function doctor() {
  const checks = [
    ["operator password", Boolean(config.password) || (!config.isProduction && "dev only"), config.password ? "set" : config.isProduction ? "MISSING" : "development default"],
    ["postal address", Boolean(config.sender.postalAddress), config.sender.postalAddress || "MISSING — real mail refused"],
    ["signing secret", Boolean(config.secret), config.secret ? "set" : "generated in the database"],
    ["public url", !/localhost|127\.0\.0\.1/.test(config.publicUrl), config.publicUrl],
    ["mail transport", config.mail.transport !== "file", config.mail.transport],
    ["page product", true, config.appUrl],
    ["crawl politeness", true, `${config.crawl.perHostDelayMs}ms per host, robots ${config.crawl.respectRobots ? "obeyed" : "IGNORED"}`],
  ];
  console.log(bold("Before a real run"));
  for (const [label, ok, detail] of checks) {
    console.log(`  ${ok ? green("ok  ") : yellow("todo")} ${label.padEnd(18)} ${dim(detail)}`);
  }
  const partners = loadPartners();
  console.log(`  ${partners.available ? green("ok  ") : yellow("todo")} ${"partner database".padEnd(18)} ${dim(partners.available ? `${partners.emails.size} partner addresses, so they can't be cold-emailed` : "not found — check AWAY_DB_PATH")}`);
  console.log("");
  console.log(
    missingForRealSend().length
      ? yellow(`Not ready to deliver: ${missingForRealSend().join(", ")}`)
      : green("Ready to deliver.")
  );
  console.log(dim("Reserved addresses (.example, localhost) are always recorded as simulated, whatever this says."));
}

async function reset() {
  if (!values.yes) {
    console.log(`This deletes ${config.dbPath}. Re-run with --yes.`);
    return;
  }
  for (const suffix of ["", "-wal", "-shm"]) await rm(`${config.dbPath}${suffix}`, { force: true });
  console.log(green("Database deleted."));
}

const RUN = { demo, discover, enrich, draft, send, status, doctor, reset, help };

if (!RUN[command]) {
  console.error(red(`Unknown command "${command}".`));
  help();
  process.exit(1);
}

try {
  await RUN[command]();
} catch (error) {
  console.error(red(error?.stack ?? String(error)));
  process.exitCode = 1;
}
