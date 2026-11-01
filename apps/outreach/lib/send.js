/**
 * The outbox, and every guard between a draft and a stranger's inbox.
 *
 * This module will not pick its own recipients: it sends what a human approved
 * (`prospects.status = 'approved'`), and it refuses to run without naming that
 * human unless the caller explicitly says it is a dry run. There is no cron
 * entry point, no "send everything" switch, and no follow-up that fires itself.
 *
 * The guards, in order:
 *   1. suppressed address or domain      -> blocked, never sent
 *   2. already written to                -> skipped (one letter per hostel)
 *   3. another hostel on the same domain -> skipped (one letter per inbox)
 *   4. reserved address (.example, localhost) -> recorded as `simulated`
 *   5. missing postal address / public URL / transport -> refused outright
 *   6. daily cap, or outside working hours -> stopped, nothing sent
 */
import { config, missingForRealSend } from "./config.js";
import { renderHtml } from "./draft.js";
import { sendMail } from "./mail.js";
import {
  domainWasSent,
  isSuppressed,
  listQueue,
  recordSend,
  sentToProspect,
  sentToday,
  setProspectStatus,
  addSuppression,
} from "./store.js";
import { isPartner, loadPartners } from "./partners.js";
import { dayInTimeZone, isReservedEmail } from "./util.js";
import { unsubUrl } from "./tokens.js";

export function sendWindowState(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: config.limits.timeZone, hour: "2-digit", hour12: false }).format(now)
  );
  const { start, end } = config.limits.window;
  return {
    open: hour >= start && hour < end,
    hour,
    label: `${String(start).padStart(2, "0")}:00–${String(end).padStart(2, "0")}:00 ${config.limits.timeZone}`,
  };
}

/**
 * @param {object}   options
 * @param {object}   options.db
 * @param {string}   options.actor   who pressed the button; required
 * @param {number}   options.limit   max letters in this run
 * @param {boolean}  options.dryRun  report only, write nothing
 * @param {boolean}  options.force   ignore the working-hours window
 * @param {Date}     options.now
 */
export async function sendApproved({
  db,
  actor,
  limit = config.limits.dailyCap,
  dryRun = false,
  force = false,
  now = new Date(),
  secret = config.secret,
}) {
  if (!actor && !dryRun) {
    throw new Error("sendApproved needs an actor: every send is attributed to a person");
  }

  const queue = listQueue(db);
  const results = [];
  const missing = missingForRealSend();
  const partners = loadPartners();

  let sentCount = 0;
  const alreadyToday = sentToday(db, dayInTimeZone(now, config.limits.timeZone));

  for (const item of queue) {
    if (results.filter((r) => r.status === "sent").length >= limit) break;

    const base = { prospectId: item.prospect_id, name: item.name, to: item.email, city: item.city };

    if (isSuppressed(db, item.email)) {
      if (!dryRun) {
        setProspectStatus(db, item.prospect_id, "blocked", "suppressed before send", actor);
        addSuppression(db, { email: item.email, reason: "suppressed", source: "guard" });
      }
      results.push({ ...base, status: "skipped", note: "on the do-not-contact list" });
      continue;
    }

    if (isPartner(item.email, item.domain, partners)) {
      if (!dryRun) setProspectStatus(db, item.prospect_id, "partner", "already on the platform", actor);
      results.push({ ...base, status: "skipped", note: "already a partner in Away" });
      continue;
    }

    const previous = sentToProspect(db, item.prospect_id);
    if (previous) {
      if (!dryRun) setProspectStatus(db, item.prospect_id, "sent", "already written to", actor);
      results.push({ ...base, status: "skipped", note: "already written to" });
      continue;
    }

    if (domainWasSent(db, item.domain)) {
      if (!dryRun) setProspectStatus(db, item.prospect_id, "skipped", "another hostel on this domain was already written to", actor);
      results.push({ ...base, status: "skipped", note: "same domain already written to" });
      continue;
    }

    const unsub = unsubUrl(config.publicUrl, secret, item.prospect_id, item.email);
    const html = renderHtml({ subject: item.subject, body: item.body });
    const simulated = isReservedEmail(item.email);

    if (simulated) {
      if (!dryRun) {
        recordSend(db, {
          prospectId: item.prospect_id,
          draftId: item.id,
          to: item.email,
          subject: item.subject,
          body: item.body,
          transport: "none",
          providerId: "",
          status: "simulated",
          actor,
        });
      }
      results.push({ ...base, status: "simulated", note: "reserved address — nothing could leave the machine" });
      continue;
    }

    if (missing.length) {
      results.push({ ...base, status: "refused", note: `real mail is not configured: ${missing.join(", ")}` });
      continue;
    }

    if (alreadyToday + sentCount >= config.limits.dailyCap) {
      results.push({ ...base, status: "skipped", note: `daily cap of ${config.limits.dailyCap} reached` });
      continue;
    }

    const window = sendWindowState(now);
    if (!window.open && !force) {
      results.push({ ...base, status: "skipped", note: `outside send hours (${window.label})` });
      continue;
    }

    if (dryRun) {
      results.push({ ...base, status: "would-send", note: "" });
      sentCount += 1;
      continue;
    }

    const outcome = await sendMail({
      to: item.email,
      subject: item.subject,
      text: item.body,
      html,
      unsubUrl: unsub,
      tags: { city: item.city },
    });

    recordSend(db, {
      prospectId: item.prospect_id,
      draftId: item.id,
      to: item.email,
      subject: item.subject,
      body: item.body,
      transport: outcome.transport,
      providerId: outcome.id ?? "",
      status: outcome.ok ? "sent" : "failed",
      error: outcome.error ?? "",
      actor,
    });

    if (outcome.ok) sentCount += 1;
    results.push({
      ...base,
      status: outcome.ok ? "sent" : "failed",
      note: outcome.ok ? outcome.id ?? "" : outcome.error ?? "",
    });
  }

  const tally = {
    considered: queue.length,
    sent: results.filter((r) => r.status === "sent").length,
    simulated: results.filter((r) => r.status === "simulated").length,
    refused: results.filter((r) => r.status === "refused").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    wouldSend: results.filter((r) => r.status === "would-send").length,
  };

  return { ...tally, results, dryRun, queueLength: queue.length };
}
