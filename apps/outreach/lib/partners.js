/**
 * The one thing this tool must never do: cold-email a hostel that is already
 * on the platform.
 *
 * The product keeps its own database, and reading it is allowed — outreach is
 * not allowed to *write* to it. If the file isn't there (separate machines),
 * everything still works; it just loses this check, and the guard degrades to
 * "hope the operator remembers".
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import { domainOf, normaliseEmail } from "./util.js";

let cache = { at: 0, path: "", index: empty() };

function empty() {
  return { emails: new Set(), domains: new Set(), names: new Set(), available: false };
}

/** Partner and applicant addresses from `apps/web`, refreshed every few seconds. */
export function loadPartners(dbPath = config.awayDbPath) {
  if (cache.path === dbPath && Date.now() - cache.at < 5_000) return cache.index;
  const index = empty();
  if (!dbPath || !existsSync(dbPath)) {
    cache = { at: Date.now(), path: dbPath, index };
    return index;
  }
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db
      .prepare("SELECT name, slug, contact_email FROM hostels WHERE status IN ('active','pending')")
      .all();
    for (const row of rows) {
      if (row.contact_email) index.emails.add(normaliseEmail(row.contact_email));
      if (row.slug) index.domains.add(domainOf(`https://${row.slug}`));
      if (row.name) index.names.add(String(row.name).toLowerCase());
    }
    index.available = true;
    db.close();
  } catch (error) {
    console.warn("[partners] could not read the product database:", error.message);
  }
  cache = { at: Date.now(), path: dbPath, index };
  return index;
}

export function isPartner(email, domain, index = loadPartners()) {
  if (!index.available) return false;
  if (email && index.emails.has(normaliseEmail(email))) return true;
  if (domain && index.domains.has(domain)) return true;
  return false;
}
