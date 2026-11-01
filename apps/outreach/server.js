/**
 * Away outreach — the tool that opens a new city.
 *
 * Run it, find hostels, read what the bot wrote, approve it yourself, send.
 * Every page here is a plain form POST: no client JavaScript, no polling, and
 * no background job that could send something nobody looked at.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { config, missingForRealSend } from "./lib/config.js";
import { openDb, signingSecret } from "./lib/db.js";
import { audit, one, run } from "./lib/db.js";
import {
  addProspect,
  addSuppression,
  approveDraft,
  counts,
  getCity,
  getDraft,
  getProspect,
  getSend,
  isSuppressed,
  listCities,
  listForReview,
  listProspects,
  listQueue,
  listSends,
  listSuppressions,
  recentAudit,
  saveDraft,
  setProspectEmail,
  setProspectStatus,
  upsertCity,
} from "./lib/store.js";
import { crawlSite } from "./lib/crawl.js";
import { discoverCity, readCityFile } from "./lib/discover.js";
import { draftProblems, draftWarnings, pickVariant, renderDraft } from "./lib/draft.js";
import { isPartner, loadPartners } from "./lib/partners.js";
import { sendApproved, sendWindowState } from "./lib/send.js";
import { checkPassword, isSignedIn, loginPage, signInCookie, signOutCookie } from "./lib/auth.js";
import { chip, esc, flashNote, layout, stat } from "./lib/html.js";
import { html, json, readBody, redirect, text } from "./lib/http.js";
import { parseUnsubToken, verifyUnsubToken } from "./lib/tokens.js";
import { dayInTimeZone, formatDate, slugify } from "./lib/util.js";

const db = openDb(config.dbPath);
const secret = signingSecret(db, config.secret);
const PUBLIC_PATHS = [/^\/u\/[^/]+$/, /^\/healthz$/, /^\/login$/, /^\/favicon\.ico$/];

/* ------------------------------------------------------------------ pages */

function overviewPage(flash) {
  const cities = listCities(db);
  const c = counts(db, dayInTimeZone());
  const queue = listQueue(db);
  const window = sendWindowState();
  const missing = missingForRealSend();

  const cityCards = cities.length
    ? `<div class="grid">${cities
        .map((city) => {
          const pct = city.found ? Math.round((Number(city.sent) / Number(city.found)) * 100) : 0;
          return `<a class="card" href="/cities/${esc(city.slug)}">
            <div class="between"><b style="font-size:16px">${esc(city.name)}</b>${chip(city.status === "live" ? "replied" : "new")}</div>
            <div class="sub">${esc(city.country || "—")} · ${city.found} found · ${city.with_email} with email</div>
            <div class="sub" style="margin-top:8px">${city.approved} approved · ${city.sent} sent · ${pct}% written to</div>
          </a>`;
        })
        .join("")}</div>`
    : `<div class="card"><p style="margin:0">No cities yet. Add one below, or run <span class="mono">npm run discover -- --city Seville --country ES</span>.</p></div>`;

  const nextStep = !cities.length
    ? "Add a city."
    : Number(c.awaiting_review) > 0
      ? `Read ${c.awaiting_review} draft${c.awaiting_review === 1 ? "" : "s"} and approve or skip them.`
      : Number(c.approved) > 0
        ? `${c.approved} letter${c.approved === 1 ? "" : "s"} approved and waiting in the outbox.`
        : Number(c.to_draft) > 0
          ? "Find emails, then draft the letters."
          : "Nothing waiting. Find more hostels in a city, or open a new one.";

  return layout({
    title: "Overview",
    active: "/",
    user: true,
    flash,
    body: `
      <h1>One city at a time</h1>
      <p class="lede">Find hostels, find the address they publish, write them something short, then approve each letter yourself. The bot never sends on its own.</p>

      <div class="grid">
        ${stat(c.to_draft, "to draft")}
        ${stat(c.awaiting_review, "awaiting review", Number(c.awaiting_review) ? "hot" : "")}
        ${stat(c.approved, "approved")}
        ${stat(c.sent, "written to", "ok")}
        ${stat(c.suppressed, "do not contact")}
      </div>

      <div class="card" style="margin-top:14px">
        <div class="between">
          <div><h3 style="margin-bottom:4px">Do this next</h3><p style="margin:0">${esc(nextStep)}</p></div>
          <div class="pill-row">
            ${Number(c.awaiting_review) ? `<a class="btn coral" href="/review">Review ${c.awaiting_review}</a>` : ""}
            ${queue.length ? `<a class="btn primary" href="/queue">Outbox (${queue.length})</a>` : ""}
          </div>
        </div>
      </div>

      ${missing.length ? `<div class="note">Real mail is off: <b>${esc(missing.join(", "))}</b> missing. Drafts, review and the outbox work; addresses on the reserved list (<span class="mono">.example</span>) are recorded as simulated.</div>` : `<div class="note ok">Mail transport <b>${esc(config.mail.transport)}</b>, cap ${config.limits.dailyCap}/day, send window ${sendWindowState().label} (${sendWindowState().open ? "open" : "closed"}).</div>`}

      <h2>Cities</h2>
      ${cityCards}

      <h2>Open a new city</h2>
      <form class="card" method="post" action="/cities">
        <div class="row" style="align-items:flex-end">
          <div style="flex:2;min-width:180px"><label for="name">City</label><input id="name" type="text" name="name" placeholder="Valencia" required></div>
          <div style="flex:1;min-width:110px"><label for="country">Country</label><input id="country" type="text" name="country" placeholder="Spain"></div>
          <div style="flex:1;min-width:100px"><label for="status">Stage</label>
            <select id="status" name="status"><option value="prospect">prospect</option><option value="opening">opening</option><option value="live">live</option></select>
          </div>
          <button class="btn primary" type="submit">Add city</button>
        </div>
        <div class="field" style="margin:12px 0 0"><label for="launchNote">One line about the launch (goes in the letter)</label>
          <input id="launchNote" type="text" name="launchNote" placeholder="We're opening Valencia in January, starting with a dozen hostels around the old town.">
        </div>
      </form>
    `,
  });
}

function cityPage(city, flash, query) {
  const prospects = listProspects(db, city.slug);
  const partners = loadPartners();
  const alreadyPartners = prospects.filter((p) => isPartner(p.email, p.domain, partners)).length;
  const review = listForReview(db, city.slug);
  const eligible = prospects.filter((p) => !p.email).length;
  const draftable = prospects.filter((p) => p.email && ["new", "enriched", "no_email"].includes(p.status)).length;

  const rows = prospects.length
    ? prospects
        .map((p) => {
          const actions = [];
          if (!p.email && p.website) {
            actions.push(`<form class="inline" method="post" action="/prospects/${p.id}/enrich"><button class="btn sm" type="submit">Find email</button></form>`);
          }
          if (p.email && ["new", "enriched", "no_email"].includes(p.status)) {
            actions.push(`<form class="inline" method="post" action="/prospects/${p.id}/draft"><button class="btn sm" type="submit">Draft</button></form>`);
          }
          if (p.status === "drafted") actions.push(`<a class="btn sm" href="/review?id=${p.id}">Read draft</a>`);
          if (!["sent", "blocked", "skipped"].includes(p.status)) {
            actions.push(`<form class="inline" method="post" action="/prospects/${p.id}/skip"><button class="btn sm ghost" type="submit">Skip</button></form>`);
          }
          if (p.status === "sent") {
            actions.push(`<form class="inline" method="post" action="/prospects/${p.id}/replied"><button class="btn sm" type="submit">They replied</button></form>`);
          }
          actions.push(`<form class="inline" method="post" action="/prospects/${p.id}/block" onsubmit="return confirm('Never contact this hostel again?')"><button class="btn sm danger" type="submit">Never</button></form>`);

          return `<tr>
            <td><div class="name">${esc(p.name)}</div><div class="sub">${esc(p.area || "—")}${p.beds ? ` · ${p.beds} beds` : ""}</div>
              ${p.evidence_url ? `<details><summary>address source</summary><div class="detail-body"><b>${esc(p.email)}</b> — published at <a href="${esc(p.evidence_url)}" target="_blank" rel="noreferrer noopener">${esc(p.evidence_url.replace(/^https?:\/\//, ""))}</a>${p.evidence_text ? `<br>“${esc(p.evidence_text)}”` : ""}</div></details>` : ""}</td>
            <td>${p.website ? `<a class="mono" href="${esc(p.website)}" target="_blank" rel="noreferrer noopener">${esc(p.domain || p.website)}</a>` : `<span class="sub">no site</span>`}</td>
            <td>${p.email ? `<span class="mono">${esc(p.email)}</span>` : `<span class="sub">—</span>`}</td>
            <td>${chip(p.status)}</td>
            <td><div class="row" style="gap:6px">${actions.join("")}</div></td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="empty">Nothing found yet. "Find hostels" queries OpenStreetMap inside this city's box.</td></tr>`;

  const flashBlock = flash;
  return layout({
    title: city.name,
    active: "/",
    user: true,
    flash: flashBlock,
    body: `
      <div class="between">
        <div>
          <h1>${esc(city.name)}</h1>
          <p class="lede" style="margin-bottom:0">${esc(city.country || "")}${city.lat ? ` · ${Number(city.lat).toFixed(3)}, ${Number(city.lng).toFixed(3)}` : ""} · ${prospects.length} found · ${prospects.filter((p) => p.email).length} with an address${alreadyPartners ? ` · ${alreadyPartners} already on Away` : ""}</p>
        </div>
        <div class="pill-row">
          <form method="post" action="/cities/${esc(city.slug)}/discover">
            <input type="hidden" name="source" value="osm">
            <button class="btn" type="submit">${city.lat ? "Find hostels (OpenStreetMap)" : "Find hostels (geocode first)"}</button>
          </form>
          <form method="post" action="/cities/${esc(city.slug)}/discover">
            <input type="hidden" name="source" value="fixture">
            <button class="btn" type="submit">Load demo hostels</button>
          </form>
        </div>
      </div>

      <div class="grid" style="margin:18px 0">
        ${stat(prospects.length, "found")}
        ${stat(prospects.filter((p) => p.email).length, "with email")}
        ${stat(review.length, "drafts to read", review.length ? "hot" : "")}
        ${stat(prospects.filter((p) => p.status === "sent").length, "written to", "ok")}
      </div>

      <div class="card">
        <div class="between">
          <div>
            <h3 style="margin-bottom:4px">The pipeline</h3>
            <p style="margin:0">${eligible} without an address · ${draftable} ready to draft · ${review.length} waiting for you</p>
          </div>
          <div class="pill-row">
            <form method="post" action="/cities/${esc(city.slug)}/enrich"><button class="btn" type="submit">Find emails (bot)</button></form>
            <form method="post" action="/cities/${esc(city.slug)}/draft"><button class="btn primary" type="submit">Draft ${draftable} letter${draftable === 1 ? "" : "s"}</button></form>
            ${review.length ? `<a class="btn coral" href="/review?city=${esc(city.slug)}">Review ${review.length}</a>` : ""}
          </div>
        </div>
        <div class="quote" style="margin-top:10px">Finding emails fetches each hostel's own site — homepage plus one contact page, robots.txt obeyed, one request at a time. Nothing is guessed from a name.</div>
      </div>

      <h2>Hostels</h2>
      <div class="card" style="padding:14px 8px">
        <table>
          <thead><tr><th>Hostel</th><th>Site</th><th>Address</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <details class="card"><summary><b>Letter settings for this city</b></summary>
        <form method="post" action="/cities/${esc(city.slug)}" style="margin-top:12px">
          <div class="row" style="align-items:flex-end">
            <div style="flex:1;min-width:120px"><label>Stage</label>
              <select name="status">${["prospect", "opening", "live"].map((s) => `<option value="${s}"${city.status === s ? " selected" : ""}>${s}</option>`).join("")}</select>
            </div>
            <div style="flex:3;min-width:220px"><label>Launch line used in the letter</label>
              <input type="text" name="launchNote" value="${esc(city.launch_note || "")}">
            </div>
            <button class="btn" type="submit">Save</button>
          </div>
        </form>
      </details>
    `,
  });
}

function reviewPage(id, citySlug, flash) {
  const drafts = listForReview(db, citySlug || null);
  const current = id ? drafts.find((d) => d.prospect_id === id) ?? getDraft(db, id) : drafts[0];
  const prospect = current ? getProspect(db, current.prospect_id) : null;
  const city = prospect ? getCity(db, prospect.city) : citySlug ? getCity(db, citySlug) : null;
  const problems = prospect ? draftProblems({ prospect, city, secret }) : [];
  const warnings = prospect ? draftWarnings({ secret }) : [];
  const others = drafts.filter((d) => current && d.id !== current.id);

  if (!current || !prospect) {
    return layout({
      title: "Review",
      active: "/review",
      user: true,
      flash,
      body: `<h1>Review</h1><p class="lede">No drafts waiting. Draft letters from a city page.</p>
        ${others.length ? "" : `<div class="card"><p style="margin:0">Nothing to read. <a class="underline" href="/">Back to the overview</a>.</p></div>`}`,
    });
  }

  const variant = current.variant || pickVariant(prospect.id);
  const body = `
    <div class="between">
      <div>
        <h1>${esc(prospect.name)}</h1>
        <p class="lede" style="margin:0">${esc(city?.name ?? prospect.city)}${prospect.area ? ` · ${esc(prospect.area)}` : ""} · to <span class="mono">${esc(prospect.email)}</span></p>
      </div>
      <div class="tag">${drafts.length} waiting${others.length ? ` · ${others.length} after this` : ""}</div>
    </div>

    ${flash}
    ${problems.length ? `<div class="note bad">Cannot approve yet: ${esc(problems.join("; "))}.</div>` : `<div class="note">Read it as they will. Edit anything. Approving puts it in the outbox — nothing is sent from this page.</div>`}
    ${warnings.length ? `<div class="note">${esc(warnings.join(" · "))}</div>` : ""}

    <form method="post" action="/review/${current.prospect_id}/approve">
      <div class="card">
        <div class="field"><label for="subject">Subject</label>
          <input id="subject" type="text" name="subject" value="${esc(current.subject)}" ${problems.length ? "disabled" : ""} required></div>
        <div class="field" style="margin-bottom:0"><label for="body">Letter</label>
          <textarea id="body" name="body" rows="20" ${problems.length ? "disabled" : ""} required>${esc(current.body)}</textarea></div>
      </div>

      <div class="evidence">
        <b>Where the address came from.</b> ${esc(prospect.email)} was published at
        <a href="${esc(prospect.evidence_url || prospect.website)}" target="_blank" rel="noreferrer noopener">${esc(prospect.evidence_url || prospect.website)}</a>.
        ${prospect.evidence_text ? `<br>“${esc(prospect.evidence_text)}”` : ""}
        ${prospect.source_url ? `<br><span class="tag">found via</span> <a href="${esc(prospect.source_url)}" target="_blank" rel="noreferrer noopener">${esc(prospect.source_url)}</a>` : ""}
        <br><span class="tag">variant</span> ${esc(variant)} · <span class="tag">template</span> ${esc(current.variant ? "edited or generated" : "generated")}
      </div>

      <div class="row" style="margin-top:16px">
        <button class="btn primary" type="submit" ${problems.length ? "disabled" : ""}>Approve — add to outbox</button>
        <a class="btn ghost" href="/review${others.length ? `?id=${others[0].prospect_id}` : ""}">Skip for now</a>
      </div>
    </form>

    <div class="row" style="margin-top:10px">
      <form method="post" action="/prospects/${prospect.id}/skip"><button class="btn sm ghost" type="submit">Skip this hostel</button></form>
      <form method="post" action="/prospects/${prospect.id}/block" onsubmit="return confirm('Never contact again, and suppress this address?')"><button class="btn sm danger" type="submit">Never contact</button></form>
    </div>

    ${
      others.length
        ? `<h2>Also waiting</h2><div class="card"><table><tbody>${others
            .map(
              (d) => `<tr><td><div class="name">${esc(d.name)}</div><div class="sub mono">${esc(d.email)}</div></td>
                <td>${esc(d.subject)}</td><td style="text-align:right"><a class="btn sm" href="/review?id=${d.prospect_id}">Read</a></td></tr>`
            )
            .join("")}</tbody></table></div>`
        : ""
    }
  `;

  return layout({ title: `Review · ${prospect.name}`, active: "/review", user: true, body });
}

function queuePage(flash, sentSummary) {
  const queue = listQueue(db);
  const simulated = queue.filter((q) => q.email.endsWith(".example") || q.domain.includes("example"));
  const window = sendWindowState();
  const todaySent = one(
    db,
    "SELECT COUNT(*) AS n FROM sends WHERE status = 'sent' AND substr(sent_at,1,10) = ?",
    dayInTimeZone(new Date(), config.limits.timeZone)
  ).n;
  const missing = missingForRealSend();
  const capLeft = Math.max(0, config.limits.dailyCap - Number(todaySent));

  const list = queue.length
    ? queue
        .map(
          (item) => `<div class="card">
            <div class="between">
              <div>
                <div class="name">${esc(item.name)}</div>
                <div class="sub mono">${esc(item.email)} · ${esc(item.city)}</div>
              </div>
              <div class="pill-row">${chip("approved")}<form method="post" action="/queue/${item.prospect_id}/return"><button class="btn sm ghost" type="submit">Back to drafts</button></form></div>
            </div>
            <details style="margin-top:10px"><summary>${esc(item.subject)}</summary>
              <div class="letter" style="margin-top:8px">${esc(item.body)}</div>
            </details>
          </div>`
        )
        .join("")
    : `<div class="card"><p style="margin:0">Empty. Approve a letter on the <a class="underline" href="/review">review</a> page and it lands here.</p></div>`;

  return layout({
    title: "Outbox",
    active: "/queue",
    user: true,
    flash,
    body: `
      <h1>Outbox</h1>
      <p class="lede">Approved, not sent. Sending is a separate, deliberate act — this button is the only thing in the tool that talks to the outside world.</p>
      ${sentSummary ?? ""}
      <div class="grid">
        ${stat(queue.length, "ready to send")}
        ${stat(capLeft, "left in today's cap")}
        ${stat(simulated.length, "demo addresses")}
        ${stat(window.open ? "open" : "closed", `window ${window.label}`)}
      </div>

      ${missing.length ? `<div class="note">Real delivery is off: <b>${esc(missing.join(", "))}</b>. Anything sent now is written to the outbox folder as a <span class="mono">.eml</span> and recorded as simulated.</div>` : `<div class="note ok">Delivering through <b>${esc(config.mail.transport)}</b>.</div>`}

      ${
        queue.length
          ? `<form class="card" method="post" action="/queue/send">
              <div class="row" style="align-items:flex-end">
                <div style="width:130px"><label for="limit">How many</label><input id="limit" type="number" name="limit" min="1" max="${Math.max(1, Math.min(config.limits.dailyCap, queue.length))}" value="${Math.min(config.limits.dailyCap, queue.length)}"></div>
                <label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font-size:13px;margin:0;color:#3b332c">
                  <input type="checkbox" name="confirm" value="1" required style="width:auto"> I've read these
                </label>
                <button class="btn coral" type="submit">Send now</button>
              </div>
              ${simulated.length ? `<div class="quote" style="margin-top:10px">${simulated.length} of these are demo addresses; they will be recorded as simulated and no message will exist.</div>` : ""}
            </form>`
          : ""
      }

      <h2>In the queue</h2>
      ${list}
    `,
  });
}

function sentPage(flash) {
  const sends = listSends(db, 200);
  const rows = sends.length
    ? sends
        .map(
          (s) => `<tr>
            <td><div class="name">${esc(s.name)}</div><div class="sub mono">${esc(s.to_email)}</div></td>
            <td>${esc(s.subject)}</td>
            <td>${chip(s.status)}<div class="sub">${esc(s.transport)}${s.provider_id ? ` · <span class="mono">${esc(String(s.provider_id).split("/").pop())}</span>` : ""}${s.error ? ` · ${esc(s.error)}` : ""}</div></td>
            <td class="sub">${esc(formatDate(s.sent_at))}</td>
            <td style="text-align:right">${s.transport === "file" ? `<a class="btn sm" href="/sent/${s.id}.eml">.eml</a>` : ""}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="empty">Nothing sent yet.</td></tr>`;

  return layout({
    title: "Sent",
    active: "/sent",
    user: true,
    flash,
    body: `
      <h1>Sent</h1>
      <p class="lede">Every letter, with the words that actually went and who approved it. <span class="mono">simulated</span> means the address was reserved and nothing was delivered.</p>
      <div class="card" style="padding:14px 8px"><table>
        <thead><tr><th>To</th><th>Subject</th><th>Status</th><th>When</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    `,
  });
}

function suppressionsPage(flash) {
  const list = listSuppressions(db);
  const rows = list.length
    ? list
        .map(
          (s) => `<tr><td class="mono">${esc(s.email)}</td><td>${chip("blocked")}</td><td>${esc(s.reason)}</td><td class="sub">${esc(s.source)} · ${esc(formatDate(s.created_at))}</td>
            <td style="text-align:right"><form method="post" action="/suppressions/${s.id}/remove"><button class="btn sm ghost" type="submit">Undo</button></form></td></tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="empty">Nobody has asked to be left alone. When someone does, it lands here and stays.</td></tr>`;

  return layout({
    title: "Do not contact",
    active: "/suppressions",
    user: true,
    flash,
    body: `
      <h1>Do not contact</h1>
      <p class="lede">One click in a letter, one word in a reply, or an address you add here — all three end it permanently, for the address and the domain.</p>
      <div class="card" style="padding:14px 8px"><table>
        <thead><tr><th>Address</th><th>State</th><th>Reason</th><th>Source</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <form class="card" method="post" action="/suppressions">
        <h3>Add one by hand</h3>
        <div class="row" style="align-items:flex-end">
          <div style="flex:2;min-width:200px"><label for="email">Address</label><input id="email" type="email" name="email" placeholder="reception@hostel.pt" required></div>
          <div style="flex:1;min-width:140px"><label for="reason">Reason</label><input id="reason" type="text" name="reason" value="asked by email"></div>
          <button class="btn" type="submit">Never contact</button>
        </div>
      </form>
    `,
  });
}

function auditPage() {
  const rows = recentAudit(db, 200)
    .map(
      (entry) => `<tr><td class="sub mono">${esc(entry.at.replace("T", " ").slice(0, 19))}</td><td><b>${esc(entry.actor)}</b></td><td>${esc(entry.action)}</td><td class="mono sub">${esc(entry.subject)}</td><td class="sub">${esc(entry.detail)}</td></tr>`
    )
    .join("");
  return layout({
    title: "Audit",
    active: "/audit",
    user: true,
    body: `<h1>Audit</h1><p class="lede">Append-only. Approvals name the person; sends name the address they went to.</p>
      <div class="card" style="padding:14px 8px"><table><tbody>${rows || `<tr><td class="empty">Nothing yet.</td></tr>`}</tbody></table></div>`,
  });
}

/* ------------------------------------------------------------------ helpers */

function requireCity(slug) {
  const city = getCity(db, slug);
  return city;
}

const FIXTURE_PATH = join(import.meta.dirname, "fixtures", "sevilla.json");

async function enrichCity(city, limit = 4) {
  const targets = listProspects(db, city.slug).filter((p) => p.website && !p.email).slice(0, limit);
  let found = 0;
  const failures = [];
  for (const prospect of targets) {
    const result = await crawlSite(prospect.website, {
      userAgent: config.crawl.userAgent,
      timeoutMs: config.crawl.timeoutMs,
      maxBytes: config.crawl.maxBytes,
      maxPages: config.crawl.maxPagesPerSite,
      spacingMs: config.crawl.perHostDelayMs,
      respectRobots: config.crawl.respectRobots,
    });
    if (result.email) {
      if (isSuppressed(db, result.email)) {
        setProspectStatus(db, prospect.id, "blocked", "address is on the do-not-contact list", "bot");
        continue;
      }
      setProspectEmail(db, prospect.id, {
        email: result.email,
        evidenceUrl: result.evidenceUrl,
        evidenceText: result.evidenceText,
      });
      found += 1;
    } else {
      run(db, "UPDATE prospects SET status = 'no_email', note = ?, updated_at = ? WHERE id = ?", result.reason ?? "", new Date().toISOString(), prospect.id);
      failures.push(`${prospect.name}: ${result.reason ?? "nothing"}`);
    }
    audit(db, "bot", "crawled", `prospect:${prospect.id}`, result.email || result.reason || "");
  }
  const remaining = listProspects(db, city.slug).filter((p) => p.website && !p.email).length;
  return { tried: targets.length, found, remaining, failures };
}

function draftCity(city) {
  const partners = loadPartners();
  const targets = listProspects(db, city.slug).filter(
    (p) => p.email && ["new", "enriched", "no_email"].includes(p.status)
  );
  let made = 0;
  for (const prospect of targets) {
    if (isSuppressed(db, prospect.email)) continue;
    if (isPartner(prospect.email, prospect.domain, partners)) {
      setProspectStatus(db, prospect.id, "partner", "already on the platform", "bot");
      continue;
    }
    const rendered = renderDraft({ prospect, city, secret, publicUrl: config.publicUrl });
    saveDraft(db, prospect.id, rendered);
    made += 1;
  }
  return made;
}

/* ------------------------------------------------------------------ server */

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  const path = url.pathname;
  const cleanPath = path.replace(/\/+$/, "") || "/";
  let body;

  try {
    body = await readBody(request);
  } catch {
    return text(response, "Body too large", { status: 413 });
  }

  const isPublic = PUBLIC_PATHS.some((pattern) => pattern.test(cleanPath));
  const signedIn = isSignedIn(request, secret);

  try {
    /* ---- public: health ---- */
    if (cleanPath === "/healthz") {
      return json(response, { ok: true, cities: listCities(db).length, queue: listQueue(db).length });
    }

    /* ---- public: unsubscribe ---- */
    const unsubMatch = /^\/u\/([^/]+)$/.exec(cleanPath);
    if (unsubMatch) {
      const parsed = parseUnsubToken(unsubMatch[1]);
      const prospect = parsed ? getProspect(db, parsed.prospectId) : null;
      const valid = prospect && verifyUnsubToken(secret, prospect.id, prospect.email, parsed.token);

      if (!valid) {
        return html(
          response,
          layout({
            title: "Unsubscribe",
            body: `<h1>This link doesn't work</h1><p class="lede">It may have been mistyped, or the signing key was rotated. Reply to the email instead and we'll remove you by hand.</p>`,
          }),
          { status: 404 }
        );
      }

      if (request.method === "POST") {
        addSuppression(db, { email: prospect.email, reason: "unsubscribed from a letter", source: "link" });
        setProspectStatus(db, prospect.id, "blocked", "unsubscribed", "link");
        return html(
          response,
          layout({
            title: "Unsubscribed",
            body: `<h1>Done — you won't hear from us again</h1><p class="lede">${esc(prospect.email)} is on the do-not-contact list, permanently. Sorry for the interruption.</p>`,
          })
        );
      }

      return html(
        response,
        layout({
          title: "Unsubscribe",
          body: `<h1>Stop the emails?</h1><p class="lede">${esc(prospect.name)} — ${esc(prospect.email)}. One click and this address is suppressed for good.</p>
            <form method="post" action="/u/${esc(unsubMatch[1])}"><button class="btn primary" type="submit">Unsubscribe</button></form>`,
        })
      );
    }

    /* ---- auth ---- */
    if (cleanPath === "/login") {
      if (request.method === "POST") {
        if (checkPassword(body.get("password"))) {
          return redirect(response, "/", { cookies: [signInCookie(secret)] });
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
        return html(response, loginPage({ text: "Wrong password.", kind: "bad" }), { status: 401 });
      }
      if (signedIn) return redirect(response, "/");
      return html(response, loginPage());
    }

    if (cleanPath === "/logout") {
      return redirect(response, "/login", { cookies: [signOutCookie()] });
    }

    if (!signedIn) {
      if (path.startsWith("/api/")) return json(response, { error: "unauthorised" }, { status: 401 });
      return redirect(response, "/login");
    }

    /* ---- api ---- */
    if (cleanPath === "/api/status") {
      return json(response, {
        counts: counts(db, dayInTimeZone()),
        cities: listCities(db).map((c) => ({ slug: c.slug, name: c.name, found: c.found, sent: c.sent })),
        queue: listQueue(db).map((q) => ({ id: q.id, name: q.name, email: q.email, city: q.city })),
        transport: config.mail.transport,
        window: sendWindowState(),
        missing: missingForRealSend(),
      });
    }

    /* ---- overview ---- */
    if (cleanPath === "/") {
      return html(response, overviewPage(flashNote(url.searchParams.get("m") ?? "", url.searchParams.get("k") ?? "")));
    }

    /* ---- create city ---- */
    if (cleanPath === "/cities" && request.method === "POST") {
      const name = (body.get("name") ?? "").trim();
      if (!name) return redirect(response, "/?m=City%20needs%20a%20name&k=bad");
      const slug = slugify(name);
      upsertCity(db, {
        slug,
        name,
        country: (body.get("country") ?? "").trim(),
        status: body.get("status") ?? "prospect",
        launchNote: (body.get("launchNote") ?? "").trim(),
      });
      audit(db, "ops", "city_added", `city:${slug}`, name);
      return redirect(response, `/cities/${slug}`);
    }

    /* ---- city pages ---- */
    const cityMatch = /^\/cities\/([a-z0-9-]+)$/.exec(cleanPath);
    if (cityMatch) {
      const city = requireCity(cityMatch[1]);
      if (!city) return html(response, layout({ title: "Not found", body: `<h1>No such city</h1>` }), { status: 404 });

      if (request.method === "POST") {
        upsertCity(db, {
          slug: city.slug,
          name: city.name,
          country: city.country,
          status: body.get("status") ?? city.status,
          launchNote: (body.get("launchNote") ?? "").trim(),
        });
        audit(db, "ops", "city_updated", `city:${city.slug}`, body.get("status") ?? "");
        return redirect(response, `/cities/${city.slug}?m=Saved&k=ok`);
      }
      return html(
        response,
        cityPage(city, flashNote(url.searchParams.get("m") ?? "", url.searchParams.get("k") ?? ""), url.searchParams)
      );
    }

    /* ---- discover ---- */
    const discoverMatch = /^\/cities\/([a-z0-9-]+)\/discover$/.exec(cleanPath);
    if (discoverMatch && request.method === "POST") {
      const city = requireCity(discoverMatch[1]);
      if (!city) return redirect(response, "/");
      const source = body.get("source") ?? "osm";
      try {
        if (source === "fixture") {
          const file = await readCityFile(FIXTURE_PATH);
          let added = 0;
          for (const prospect of file.prospects) {
            if (prospect.email && isSuppressed(db, prospect.email)) continue;
            if (addProspect(db, city.slug, prospect)) added += 1;
          }
          // The demo file is Seville's; borrowing it for another city is fine,
          // it is a fixture and the emails are reserved addresses.
          audit(db, "ops", "discover_fixture", `city:${city.slug}`, `${added} added`);
          return redirect(response, `/cities/${city.slug}?m=${encodeURIComponent(`${added} demo hostels added`)}&k=ok`);
        }

        const result = await discoverCity({
          mode: "osm",
          city: { name: city.name, country: city.country, lat: city.lat, lng: city.lng },
          options: {
            nominatim: config.source.nominatim,
            overpass: config.source.overpass,
            userAgent: config.crawl.userAgent,
            radius: config.source.radiusMeters,
          },
        });

        upsertCity(db, {
          slug: city.slug,
          name: result.city.name ?? city.name,
          country: result.city.country ?? city.country,
          status: city.status,
          lat: result.city.lat,
          lng: result.city.lng,
        });

        let added = 0;
        for (const prospect of result.prospects) {
          if (addProspect(db, city.slug, prospect)) added += 1;
        }
        audit(db, "ops", "discover_osm", `city:${city.slug}`, `${added} of ${result.prospects.length} new`);
        return redirect(
          response,
          `/cities/${city.slug}?m=${encodeURIComponent(`${added} new hostels from OpenStreetMap (${result.prospects.length} returned)`)}&k=ok`
        );
      } catch (error) {
        return redirect(response, `/cities/${city.slug}?m=${encodeURIComponent(`Discovery failed: ${error.message}`)}&k=bad`);
      }
    }

    /* ---- city bulk actions ---- */
    const enrichMatch = /^\/cities\/([a-z0-9-]+)\/enrich$/.exec(cleanPath);
    if (enrichMatch && request.method === "POST") {
      const city = requireCity(enrichMatch[1]);
      if (!city) return redirect(response, "/");
      const result = await enrichCity(city, 4);
      const message = result.tried
        ? `${result.found} of ${result.tried} addresses found${result.remaining ? ` · ${result.remaining} still to try — run it again` : ""}`
        : "Nothing to look up — every hostel with a site already has an address, or has none.";
      return redirect(response, `/cities/${city.slug}?m=${encodeURIComponent(message)}&k=${result.found ? "ok" : ""}`);
    }

    const draftAllMatch = /^\/cities\/([a-z0-9-]+)\/draft$/.exec(cleanPath);
    if (draftAllMatch && request.method === "POST") {
      const city = requireCity(draftAllMatch[1]);
      if (!city) return redirect(response, "/");
      const made = draftCity(city);
      return redirect(
        response,
        made
          ? `/review?city=${city.slug}`
          : `/cities/${city.slug}?m=${encodeURIComponent("Nothing to draft — hostels need an address first")}&k=`
      );
    }

    /* ---- prospect actions ---- */
    const prospectAction = /^\/prospects\/(\d+)\/(enrich|draft|skip|block|replied)$/.exec(cleanPath);
    if (prospectAction && request.method === "POST") {
      const prospect = getProspect(db, Number(prospectAction[1]));
      if (!prospect) return redirect(response, "/");
      const action = prospectAction[2];

      if (action === "enrich") {
        const result = await crawlSite(prospect.website, {
          userAgent: config.crawl.userAgent,
          timeoutMs: config.crawl.timeoutMs,
          maxBytes: config.crawl.maxBytes,
          maxPages: config.crawl.maxPagesPerSite,
          spacingMs: config.crawl.perHostDelayMs,
          respectRobots: config.crawl.respectRobots,
        });
        if (result.email) {
          setProspectEmail(prospect.id, {
            email: result.email,
            evidenceUrl: result.evidenceUrl,
            evidenceText: result.evidenceText,
          });
          return redirect(response, `/cities/${prospect.city}?m=${encodeURIComponent(`Found ${result.email}`)}&k=ok`);
        }
        run(db, "UPDATE prospects SET status = 'no_email', note = ?, updated_at = ? WHERE id = ?", result.reason ?? "", new Date().toISOString(), prospect.id);
        audit(db, "bot", "crawled", `prospect:${prospect.id}`, result.reason ?? "");
        return redirect(
          response,
          `/cities/${prospect.city}?m=${encodeURIComponent(`No address published (${result.reason ?? "nothing found"})`)}&k=bad`
        );
      }

      if (action === "draft") {
        const city = getCity(db, prospect.city);
        const rendered = renderDraft({ prospect, city, secret, publicUrl: config.publicUrl });
        saveDraft(db, prospect.id, rendered);
        return redirect(response, `/review?id=${prospect.id}`);
      }

      if (action === "skip") {
        setProspectStatus(db, prospect.id, "skipped", "skipped by ops");
        return redirect(response, `/cities/${prospect.city}?m=Skipped&k=`);
      }

      if (action === "block") {
        if (prospect.email) addSuppression(db, { email: prospect.email, reason: "manually blocked", source: "ops" });
        setProspectStatus(db, prospect.id, "blocked", "never contact");
        return redirect(response, `/cities/${prospect.city}?m=${encodeURIComponent(`${prospect.name} will not be contacted`)}&k=`);
      }

      if (action === "replied") {
        setProspectStatus(db, prospect.id, "replied", "logged by ops");
        return redirect(response, `/cities/${prospect.city}?m=${encodeURIComponent("Reply logged")}&k=ok`);
      }
    }

    /* ---- review ---- */
    if (cleanPath === "/review") {
      const id = Number(url.searchParams.get("id")) || null;
      return html(
        response,
        reviewPage(id, url.searchParams.get("city"), flashNote(url.searchParams.get("m") ?? "", url.searchParams.get("k") ?? ""))
      );
    }

    const approveMatch = /^\/review\/(\d+)\/approve$/.exec(cleanPath);
    if (approveMatch && request.method === "POST") {
      const prospect = getProspect(db, Number(approveMatch[1]));
      const draft = prospect ? one(db, "SELECT * FROM drafts WHERE prospect_id = ?", prospect.id) : null;
      if (!prospect || !draft) return redirect(response, "/review");
      const subject = (body.get("subject") ?? "").trim() || draft.subject;
      const letter = (body.get("body") ?? "").trim() || draft.body;
      const problems = draftProblems({ prospect, city: getCity(db, prospect.city), secret });
      if (problems.length) {
        return redirect(response, `/review?id=${prospect.id}&m=${encodeURIComponent(problems.join("; "))}&k=bad`);
      }
      approveDraft(db, draft.id, { actor: "ops", subject, body: letter });
      return redirect(response, `/review?m=${encodeURIComponent(`Approved for ${prospect.name}`)}&k=ok`);
    }

    /* ---- queue ---- */
    if (cleanPath === "/queue") {
      const summary = url.searchParams.get("sent")
        ? flashNote(
            `Sent ${url.searchParams.get("sent")} · simulated ${url.searchParams.get("simulated") ?? 0} · skipped ${url.searchParams.get("skipped") ?? 0}${url.searchParams.get("failed") ? ` · failed ${url.searchParams.get("failed")}` : ""}`,
            url.searchParams.get("failed") ? "bad" : "ok"
          )
        : flashNote(url.searchParams.get("m") ?? "", url.searchParams.get("k") ?? "");
      return html(response, queuePage("", summary));
    }

    if (cleanPath === "/queue/send" && request.method === "POST") {
      if (body.get("confirm") !== "1") {
        return redirect(response, `/queue?m=${encodeURIComponent("Tick “I've read these” first — nothing was sent")}&k=bad`);
      }
      const limit = Math.max(1, Math.min(Number(body.get("limit")) || 1, config.limits.dailyCap));
      const result = await sendApproved({ db, actor: "ops", limit, secret });
      const params = new URLSearchParams({
        sent: String(result.sent),
        simulated: String(result.simulated),
        skipped: String(result.skipped),
        failed: String(result.failed + result.refused),
      });
      return redirect(response, `/queue?${params.toString()}`);
    }

    const returnMatch = /^\/queue\/(\d+)\/return$/.exec(cleanPath);
    if (returnMatch && request.method === "POST") {
      const prospect = getProspect(db, Number(returnMatch[1]));
      if (prospect) {
        setProspectStatus(db, prospect.id, "drafted", "returned to drafts");
        audit(db, "ops", "unapproved", `prospect:${prospect.id}`, "");
      }
      return redirect(response, `/queue?m=${encodeURIComponent("Moved back to drafts")}&k=`);
    }

    /* ---- sent ---- */
    if (cleanPath === "/sent") {
      return html(response, sentPage(flashNote(url.searchParams.get("m") ?? "", url.searchParams.get("k") ?? "")));
    }

    const emlMatch = /^\/sent\/(\d+)\.eml$/.exec(cleanPath);
    if (emlMatch) {
      const send = getSend(db, Number(emlMatch[1]));
      if (!send) return text(response, "Not found", { status: 404 });
      if (send.transport !== "file") return text(response, "Only local sends have a .eml file.", { status: 404 });
      const raw = await readFile(send.provider_id, "utf8").catch(() => "");
      if (!raw) return text(response, "The file is gone from the outbox.", { status: 404 });
      return text(response, raw, { type: "message/rfc822; charset=utf-8" });
    }

    /* ---- suppressions ---- */
    if (cleanPath === "/suppressions") {
      const flash = flashNote(url.searchParams.get("m") ?? "", url.searchParams.get("k") ?? "");
      if (request.method === "POST") {
        const email = (body.get("email") ?? "").trim();
        if (!email) return redirect(response, "/suppressions?m=Needs%20an%20address&k=bad");
        addSuppression(db, { email, reason: (body.get("reason") ?? "asked by email").trim(), source: "manual" });
        return redirect(response, `/suppressions?m=${encodeURIComponent(`${email} will not be contacted`)}&k=ok`);
      }
      return html(response, suppressionsPage(flash));
    }

    const unsuppressMatch = /^\/suppressions\/(\d+)\/remove$/.exec(cleanPath);
    if (unsuppressMatch && request.method === "POST") {
      const row = one(db, "SELECT * FROM suppressions WHERE id = ?", Number(unsuppressMatch[1]));
      if (row) {
        run(db, "DELETE FROM suppressions WHERE id = ?", row.id);
        audit(db, "ops", "suppression_removed", row.email, "undone by hand");
      }
      return redirect(response, `/suppressions?m=${encodeURIComponent("Removed from the list")}&k=`);
    }

    /* ---- audit ---- */
    if (cleanPath === "/audit") return html(response, auditPage());

    /* ---- 404 ---- */
    return html(
      response,
      layout({ title: "Not found", body: `<h1>Not found</h1><p class="lede">That page doesn't exist.</p><p><a class="underline" href="/">Overview</a></p>` }),
      { status: 404 }
    );
  } catch (error) {
    console.error("[outreach]", error);
    return html(
      response,
      layout({
        title: "Error",
        body: `<h1>Something broke</h1><p class="lede">${esc(error?.message ?? String(error))}</p><p><a class="underline" href="/">Overview</a></p>`,
      }),
      { status: 500 }
    );
  }
});

/* ------------------------------------------------------------------- boot */

if (config.isProduction && !config.password) {
  console.error("Refusing to start: OUTREACH_PASSWORD is not set in production.");
  process.exit(1);
}
if (!config.secret) {
  console.warn(
    "[outreach] OUTREACH_SECRET is not set — using a generated key from the database. Unsubscribe links survive restarts on this machine only."
  );
}
if (!config.sender.postalAddress) {
  console.warn("[outreach] OUTREACH_POSTAL_ADDRESS is not set — real mail will be refused until it is.");
}

server.listen(config.port, config.host, () => {
  const base = `http://localhost:${config.port}`;
  console.log(`Away outreach on ${base} (mail: ${config.mail.transport}, cap ${config.limits.dailyCap}/day)`);
  if (!config.password && !config.isProduction) console.log("Development password: outreach");
});
