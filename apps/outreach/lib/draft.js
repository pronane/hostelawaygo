/**
 * The letter.
 *
 * Written to be read by one person at one hostel, in about twenty seconds:
 * who I am, what it is, why them, one link, one way out. No "revolutionise",
 * no attachment, no tracking pixel, no calendar link, no "quick call?".
 *
 * Two things are not negotiable and are always in the text: a real postal
 * address, and how to make it stop. A draft that is missing either is not
 * offered for approval.
 */
import { config } from "./config.js";
import { unsubUrl } from "./tokens.js";

/** Subject lines, rotated by prospect id so a city doesn't get one identical mail. */
const SUBJECTS = {
  a: (ctx) => `${ctx.name}: what's on tonight, for your guests`,
  b: (ctx) => `The question at your reception, ${ctx.city}`,
  c: (ctx) => `${ctx.city}: one post a night, from the desk`,
};

export const TEMPLATE_VERSION = "2026-10-a";

export function pickVariant(prospectId) {
  return ["a", "b", "c"][Number(prospectId) % 3];
}

export function renderDraft({ prospect, city, secret, publicUrl = config.publicUrl, variant }) {
  const chosen = variant ?? pickVariant(prospect.id);
  const cityName = city?.name ?? prospect.city;
  const citySlug = city?.slug ?? prospect.city;
  const cityLive = (city?.status ?? "prospect") === "live";

  const subjectTemplate = SUBJECTS[chosen] ?? SUBJECTS.a;
  const subject = subjectTemplate({ name: prospect.name, city: cityName });

  const opening = cityLive
    ? `We're live in ${cityName} already — a few hostels there post their nights on it, and your guests are the ones asking.`
    : city?.launch_note?.trim() ||
      `We're live in Lisbon and Porto, and ${cityName} is the next city on the list.`;

  const look = cityLive
    ? `Have a look at what it looks like: ${config.appUrl}/c/${citySlug}`
    : `Have a look at what it looks like where we've launched: ${config.appUrl}/c/lisbon`;

  const stop = unsubUrl(publicUrl, secret, prospect.id, prospect.email);

  const body = [
    `Hi ${prospect.name},`,
    ``,
    `I'm ${config.sender.name}. I build Away: a page of what's on tonight in ${cityName}, for the people sleeping in hostels.`,
    ``,
    `Someone at your reception answers "what's on?" a hundred times a week. Away answers it — your nights first, the city's next, matched to the dates the guest is actually in town. It's free, and posting one takes about a minute from your phone at the desk.`,
    ``,
    opening,
    ``,
    look,
    `Or set yourself up, no call needed: ${config.appUrl}/partner`,
    ``,
    `If it's not for you, one word back and I'll leave you alone.`,
    ``,
    config.sender.name,
    `${config.sender.role} · ${config.sender.postalAddress || "[postal address missing — do not send]"}`,
    ``,
    `—`,
    `You're getting this once because ${prospect.email} is published on your website (${prospect.evidence_url || prospect.website}). Unsubscribe: ${stop}`,
  ].join("\n");

  return { subject, body, variant: chosen, unsubUrl: stop, templateVersion: TEMPLATE_VERSION };
}

/** The same letter as HTML, for the rare client that mangles plain text. */
export function renderHtml({ subject, body }) {
  const escape = (value) =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = body
    .split("\n\n")
    .map((block) => {
      const lines = block.split("\n").map((line) => escape(line));
      // Keep the signature and the footer visually quieter than the pitch.
      const small = /^(—|You're getting this|Away ·|Nuno$)/.test(block) || block.startsWith("—");
      return `<p${small ? ' class="muted"' : ""}>${lines.join("<br>")}</p>`;
    })
    .join("\n");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fbf7f1;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#241d17">
<div style="max-width:34rem;margin:0 auto;font-size:16px;line-height:1.55">${paragraphs}</div>
<title>${escape(subject)}</title></body></html>`;
}

/**
 * What stops a letter being approvable: we can't write to it, or we can't show
 * where the address came from. Everything else is a warning — approval is an
 * internal step, and the send path does the refusing.
 */
export function draftProblems({ prospect }) {
  const problems = [];
  if (!prospect.email) problems.push("no address for this hostel");
  if (!prospect.evidence_url) problems.push("no source page recorded for the address");
  return problems;
}

/** Shown next to the letter, never blocking: things a real send would trip on. */
export function draftWarnings({ secret }) {
  const warnings = [];
  if (!config.sender.postalAddress) warnings.push("no postal address configured (OUTREACH_POSTAL_ADDRESS) — real mail will be refused");
  if (!secret) warnings.push("no signing secret configured (OUTREACH_SECRET)");
  return warnings;
}
