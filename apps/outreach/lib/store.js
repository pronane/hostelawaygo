/**
 * All the SQL. Kept in one place so the pages and the CLI can't drift.
 *
 * The one rule encoded here: a prospect becomes `approved` only through
 * `approveDraft()`, which records who did it. `sendApproved()` refuses anything
 * that did not come through that door.
 */
import { all, audit, one, run } from "./db.js";
import { domainOf, nowIso, normaliseEmail } from "./util.js";

export function upsertCity(db, city) {
  const existing = one(db, "SELECT * FROM cities WHERE slug = ?", city.slug);
  if (existing) {
    run(
      db,
      `UPDATE cities SET name = ?, country = ?, status = ?, lat = COALESCE(?, lat), lng = COALESCE(?, lng),
         launch_note = COALESCE(NULLIF(?, ''), launch_note) WHERE slug = ?`,
      city.name,
      city.country ?? existing.country,
      city.status ?? existing.status,
      city.lat ?? null,
      city.lng ?? null,
      city.launchNote ?? "",
      city.slug
    );
    return existing.slug;
  }
  run(
    db,
    "INSERT INTO cities (slug, name, country, status, lat, lng, launch_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    city.slug,
    city.name,
    city.country ?? "",
    city.status ?? "prospect",
    city.lat ?? null,
    city.lng ?? null,
    city.launchNote ?? "",
    nowIso()
  );
  return city.slug;
}

export function getCity(db, slug) {
  return one(db, "SELECT * FROM cities WHERE slug = ?", slug);
}

export function listCities(db) {
  return all(
    db,
    `SELECT c.*,
       (SELECT COUNT(*) FROM prospects p WHERE p.city = c.slug) AS found,
       (SELECT COUNT(*) FROM prospects p WHERE p.city = c.slug AND p.email <> '') AS with_email,
       (SELECT COUNT(*) FROM prospects p WHERE p.city = c.slug AND p.status = 'approved') AS approved,
       (SELECT COUNT(*) FROM prospects p WHERE p.city = c.slug AND p.status = 'sent') AS sent,
       (SELECT COUNT(*) FROM prospects p WHERE p.city = c.slug AND p.status = 'replied') AS replied,
       (SELECT COUNT(*) FROM prospects p WHERE p.city = c.slug AND p.email <> '' AND p.status IN ('new','enriched','no_email')) AS to_draft
     FROM cities c ORDER BY c.created_at DESC`
  );
}

export function counts(db, dayIso = new Date().toISOString().slice(0, 10)) {
  const row = one(
    db,
    `SELECT
       (SELECT COUNT(*) FROM prospects WHERE email <> '' AND status IN ('new','enriched','no_email')) AS to_draft,
       (SELECT COUNT(*) FROM prospects WHERE status = 'drafted') AS awaiting_review,
       (SELECT COUNT(*) FROM prospects WHERE status = 'approved') AS approved,
       (SELECT COUNT(*) FROM prospects WHERE status = 'sent') AS sent,
       (SELECT COUNT(*) FROM sends WHERE status IN ('sent','simulated')) AS letters,
       (SELECT COUNT(*) FROM sends WHERE status = 'sent' AND substr(sent_at, 1, 10) = ?) AS sent_today,
       (SELECT COUNT(*) FROM suppressions) AS suppressed`
  , dayIso);
  return row;
}

/**
 * Insert a discovered hostel. Returns the new id, or null when we already know
 * the site or the name — dedupe is by domain first, because a chain with one
 * inbox should get one letter.
 */
export function addProspect(db, citySlug, prospect) {
  const domain = domainOf(prospect.website);
  if (domain) {
    const clash = one(
      db,
      "SELECT id, status FROM prospects WHERE domain = ? AND status NOT IN ('skipped','blocked')",
      domain
    );
    if (clash) return null;
  }
  const existing = one(db, "SELECT id FROM prospects WHERE city = ? AND lower(name) = lower(?)", citySlug, prospect.name);
  if (existing) return null;

  const at = nowIso();
  const result = run(
    db,
    `INSERT INTO prospects
       (city, name, area, website, domain, beds, source, source_url, email, evidence_url, evidence_text, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    citySlug,
    prospect.name,
    prospect.area ?? "",
    prospect.website ?? "",
    domain,
    prospect.beds ?? 0,
    prospect.source ?? "",
    prospect.sourceUrl ?? "",
    normaliseEmail(prospect.email),
    prospect.evidenceUrl ?? "",
    prospect.evidenceText ?? "",
    prospect.email ? "enriched" : "new",
    at,
    at
  );
  return result.id;
}

export function listProspects(db, citySlug, statuses = null) {
  if (statuses?.length) {
    const marks = statuses.map(() => "?").join(",");
    return all(db, `SELECT * FROM prospects WHERE city = ? AND status IN (${marks}) ORDER BY name`, citySlug, ...statuses);
  }
  return all(db, "SELECT * FROM prospects WHERE city = ? ORDER BY name", citySlug);
}

export function getProspect(db, id) {
  return one(db, "SELECT * FROM prospects WHERE id = ?", id);
}

export function setProspectEmail(db, id, { email, evidenceUrl, evidenceText }) {
  const at = nowIso();
  run(
    db,
    "UPDATE prospects SET email = ?, evidence_url = ?, evidence_text = ?, status = 'enriched', updated_at = ? WHERE id = ?",
    normaliseEmail(email),
    evidenceUrl ?? "",
    evidenceText ?? "",
    at,
    id
  );
  audit(db, "bot", "email_found", `prospect:${id}`, `${email} — ${evidenceUrl}`);
}

export function setProspectStatus(db, id, status, note, actor = "ops") {
  run(db, "UPDATE prospects SET status = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?", status, note ?? null, nowIso(), id);
  audit(db, actor, `prospect_${status}`, `prospect:${id}`, note ?? "");
}

export function saveDraft(db, prospectId, { subject, body, variant = "a" }) {
  const at = nowIso();
  run(
    db,
    `INSERT INTO drafts (prospect_id, subject, body, variant, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(prospect_id) DO UPDATE SET subject = excluded.subject, body = excluded.body,
       variant = excluded.variant, edited_at = excluded.created_at`,
    prospectId,
    subject,
    body,
    variant,
    at
  );
  run(db, "UPDATE prospects SET status = 'drafted', updated_at = ? WHERE id = ?", at, prospectId);
  return one(db, "SELECT * FROM drafts WHERE prospect_id = ?", prospectId);
}

export function getDraft(db, id) {
  return one(db, "SELECT * FROM drafts WHERE id = ?", id);
}

export function getDraftForProspect(db, prospectId) {
  return one(db, "SELECT * FROM drafts WHERE prospect_id = ?", prospectId);
}

export function listForReview(db, citySlug = null) {
  const where = citySlug ? "AND p.city = ?" : "";
  const params = citySlug ? [citySlug] : [];
  return all(
    db,
    `SELECT d.*, p.name, p.area, p.city, p.email, p.website, p.evidence_url, p.evidence_text, p.source_url
     FROM drafts d JOIN prospects p ON p.id = d.prospect_id
     WHERE p.status = 'drafted' ${where}
     ORDER BY d.created_at`,
    ...params
  );
}

export function listQueue(db) {
  return all(
    db,
    `SELECT d.*, p.name, p.city, p.email, p.domain, p.evidence_url
     FROM drafts d JOIN prospects p ON p.id = d.prospect_id
     WHERE p.status = 'approved' ORDER BY p.updated_at, d.id`
  );
}

/** The only write that moves a letter towards the outbox. Names the human. */
export function approveDraft(db, draftId, { actor, subject, body }) {
  const draft = getDraft(db, draftId);
  if (!draft) throw new Error(`No draft ${draftId}`);
  const at = nowIso();
  if (subject !== draft.subject || body !== draft.body) {
    run(db, "UPDATE drafts SET subject = ?, body = ?, edited_at = ? WHERE id = ?", subject, body, at, draftId);
    audit(db, actor, "draft_edited", `draft:${draftId}`, "");
  }
  run(db, "UPDATE prospects SET status = 'approved', updated_at = ? WHERE id = ?", at, draft.prospect_id);
  audit(db, actor, "approved", `prospect:${draft.prospect_id}`, `draft:${draftId}`);
  return getDraft(db, draftId);
}

export function sentToProspect(db, prospectId) {
  return one(db, "SELECT * FROM sends WHERE prospect_id = ? AND status IN ('sent','simulated') ORDER BY id DESC", prospectId);
}

export function recordSend(db, { prospectId, draftId, to, subject, body, transport, providerId, status, error, actor }) {
  const at = nowIso();
  run(
    db,
    `INSERT INTO sends (prospect_id, draft_id, to_email, subject, body, transport, provider_id, status, error, actor, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    prospectId,
    draftId ?? null,
    to,
    subject,
    body,
    transport,
    providerId ?? "",
    status,
    error ?? "",
    actor ?? "",
    at
  );
  if (status === "sent" || status === "simulated") {
    run(db, "UPDATE prospects SET status = 'sent', updated_at = ? WHERE id = ?", at, prospectId);
  }
  audit(db, actor ?? "bot", `send_${status}`, `prospect:${prospectId}`, to);
}

export function listSends(db, limit = 100) {
  return all(
    db,
    `SELECT s.*, p.name, p.city FROM sends s JOIN prospects p ON p.id = s.prospect_id
     ORDER BY s.id DESC LIMIT ?`,
    limit
  );
}

export function getSend(db, id) {
  return one(db, "SELECT s.*, p.name, p.city FROM sends s JOIN prospects p ON p.id = s.prospect_id WHERE s.id = ?", id);
}

export function sentToday(db, dayIso = new Date().toISOString().slice(0, 10)) {
  return one(db, "SELECT COUNT(*) AS n FROM sends WHERE status = 'sent' AND substr(sent_at, 1, 10) = ?", dayIso).n;
}

export function domainWasSent(db, domain) {
  if (!domain) return false;
  return Boolean(
    one(
      db,
      `SELECT 1 FROM sends s JOIN prospects p ON p.id = s.prospect_id
       WHERE p.domain = ? AND s.status IN ('sent','simulated') LIMIT 1`,
      domain
    )
  );
}

export function addSuppression(db, { email, reason, source = "manual" }) {
  const address = normaliseEmail(email);
  if (!address) return null;
  const domain = address.split("@")[1] ?? "";
  run(
    db,
    `INSERT INTO suppressions (email, domain, reason, source, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET reason = excluded.reason`,
    address,
    domain,
    reason,
    source,
    nowIso()
  );
  // A conversation that ends this way ends for the whole domain too: the person
  // who answers an inbox usually answers for the building.
  run(db, "UPDATE prospects SET status = 'blocked', updated_at = ? WHERE email = ? OR domain = ?", nowIso(), address, domain);
  audit(db, source, `suppressed`, address, reason);
  return address;
}

export function isSuppressed(db, email) {
  const address = normaliseEmail(email);
  if (!address) return true;
  const domain = address.split("@")[1] ?? "";
  return Boolean(
    one(db, "SELECT id FROM suppressions WHERE email = ? OR (domain <> '' AND domain = ?)", address, domain)
  );
}

export function listSuppressions(db) {
  return all(db, "SELECT * FROM suppressions ORDER BY id DESC");
}

export function recentAudit(db, limit = 80) {
  return all(db, "SELECT * FROM audit ORDER BY id DESC LIMIT ?", limit);
}

export function reply(db, prospectId, actor = "ops") {
  run(db, "UPDATE prospects SET status = 'replied', updated_at = ? WHERE id = ?", nowIso(), prospectId);
  audit(db, actor, "reply_logged", `prospect:${prospectId}`, "");
}
