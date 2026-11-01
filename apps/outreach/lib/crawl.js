/**
 * Find the address a hostel publishes for itself.
 *
 * Rules, in the order they matter:
 *   - only pages the site offered (homepage + one contact-ish page, same host);
 *   - robots.txt is obeyed, and a disallowed path is not fetched at all;
 *   - one request at a time per host, with a delay, and an honest User-Agent;
 *   - we record the page and the words around the address, because a human has
 *     to be able to check it before anything is sent.
 *
 * Nothing here guesses an address. If the site doesn't publish one, the answer
 * is "no email" and a human has to look.
 */
import { cleanText, domainOf, truncate } from "./util.js";

/** host -> epoch ms of the last request, so politeness survives across calls. */
const lastHit = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function politeWait(host, spacingMs) {
  const previous = lastHit.get(host) ?? 0;
  const wait = previous + spacingMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

export async function fetchText(url, options = {}) {
  const {
    userAgent = "AwayOutreachBot/0.1",
    timeoutMs = 10_000,
    maxBytes = 600_000,
    spacingMs = 800,
  } = options;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "bad url", url };
  }
  if (!/^https?:$/.test(parsed.protocol)) return { ok: false, error: "not http", url };

  await politeWait(parsed.host, spacingMs);

  try {
    const response = await fetch(parsed.href, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "accept-language": "en,pt;q=0.8,es;q=0.7",
      },
    });

    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      return { ok: false, error: `not html (${type || "unknown"})`, status: response.status, url: parsed.href };
    }

    const buffer = await response.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer.slice(0, maxBytes));
    return { ok: response.ok, status: response.status, url: parsed.href, text, type };
  } catch (error) {
    return { ok: false, error: error?.name === "TimeoutError" ? "timeout" : String(error?.message ?? error), url: parsed.href };
  }
}

/* ---------------------------------------------------------------- robots.txt */

/**
 * Minimal robots parser: the groups that apply to us (our name, or `*`), their
 * Allow/Disallow rules, and no wildcard cleverness beyond a trailing `*`.
 * Most hostel sites publish nothing at all, which means allowed.
 */
export function parseRobots(text) {
  const rules = [];
  let agents = [];
  let inGroupRules = false;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const split = line.indexOf(":");
    if (split === -1) continue;
    const key = line.slice(0, split).trim().toLowerCase();
    const value = line.slice(split + 1).trim();

    if (key === "user-agent") {
      if (inGroupRules) {
        agents = [];
        inGroupRules = false;
      }
      agents.push(value.toLowerCase());
      continue;
    }
    if (key !== "allow" && key !== "disallow") continue;
    inGroupRules = true;
    if (!value) continue;
    const applies = agents.includes("*") || agents.some((agent) => agent.includes("awayoutreach"));
    if (applies) rules.push({ allow: key === "allow", path: value });
  }
  return rules;
}

export function isAllowedByRobots(rules, path) {
  if (!rules?.length) return true;
  const target = path || "/";
  let best = null;
  for (const rule of rules) {
    const pattern = rule.path.replace(/\*$/, "");
    const matches = rule.path.endsWith("*") ? target.startsWith(pattern) : target.startsWith(rule.path);
    if (!matches) continue;
    // Longest match wins; on a tie, Allow wins.
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

export async function robotsFor(origin, options) {
  const url = new URL("/robots.txt", origin).href;
  const result = await fetchText(url, options);
  if (!result.ok) return { rules: [], url, fetched: false };
  const rules = parseRobots(result.text);
  return { rules, url, fetched: true };
}

/* -------------------------------------------------------------- extraction */

const JUNK = [
  /\.(png|jpe?g|gif|webp|svg|avif)$/i,
  /^(your|you|name|email|e-mail|exemplo|ejemplo)@/i,
  /@(example|domain|email|site|yourdomain|sentry|wixpress|sentry\.io|wordpress)\./i,
  /^(no-?reply|donotreply)@/i,
  /@\d+\.\d+\.\d+\.\d+$/,
  /@(?:2x|3x)\./i,
  /\.(css|js|json)$/i,
];

const PREFERRED = [
  /^(info|hello|hola|ola|olá|oi|reservas|bookings?|booking|reception|rececao|recepción|frontdesk|front-desk|stay|contact|contacto)@/i,
];

export function looksLikeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
  if (email.length > 120) return false;
  return !JUNK.some((pattern) => pattern.test(email));
}

/** All addresses on a page, with the sentence they appeared in. */
export function extractEmails(html, baseUrl = "") {
  const source = String(html ?? "");
  const found = new Map();

  const note = (email, index, kind) => {
    const address = String(email).trim().toLowerCase().replace(/^mailto:/i, "").split("?")[0];
    if (!looksLikeEmail(address)) return;
    const context = contextAround(source, index);
    const previous = found.get(address);
    if (!previous || (!previous.context && context)) {
      found.set(address, { email: address, context, kind, url: baseUrl });
    }
  };

  const mailto = /href\s*=\s*["']mailto:([^"'?]+)/gi;
  for (let match = mailto.exec(source); match; match = mailto.exec(source)) {
    note(decodeURIComponent(match[1]), match.index, "mailto");
  }

  // Plain-text addresses, including the "info (at) hostel.pt" dodge.
  const plain = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  for (let match = plain.exec(source); match; match = plain.exec(source)) {
    note(match[0], match.index, "text");
  }

  const obfuscated = /([a-z0-9._%+-]+)\s*(?:\(at\)|\[at\]|\sat\s)\s*([a-z0-9.-]+\.[a-z]{2,})/gi;
  for (let match = obfuscated.exec(source); match; match = obfuscated.exec(source)) {
    note(`${match[1]}@${match[2]}`, match.index, "text");
  }

  return [...found.values()];
}

function contextAround(html, index) {
  const start = Math.max(0, index - 220);
  const raw = html.slice(start, Math.min(html.length, index + 220));
  const text = cleanText(raw.replace(/<[^>]*>/g, " "));
  return truncate(text, 180);
}

export function rankEmails(entries, siteDomain) {
  const score = (entry) => {
    let value = 0;
    const local = entry.email.split("@")[0];
    const domain = entry.email.split("@")[1];
    if (PREFERRED.some((pattern) => pattern.test(entry.email))) value += 40;
    if (/^(no-?reply|donotreply)/i.test(local)) value -= 30;
    if (domain === siteDomain) value += 25;
    else if (siteDomain && domain.endsWith(siteDomain)) value += 10;
    if (entry.kind === "mailto") value += 6;
    if (/gmail|hotmail|yahoo|outlook|icloud/i.test(domain)) value += 2; // small places run on Gmail
    return value;
  };
  return [...entries].sort((a, b) => score(b) - score(a));
}

/* --------------------------------------------------------------- the crawl */

const CONTACT_PATHS = ["contact", "contacts", "contacto", "contactos", "contact-us", "about", "about-us", "quem-somos"];

function findContactLinks(html, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const links = [];
  const anchor = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  for (let match = anchor.exec(String(html)); match; match = anchor.exec(String(html))) {
    let url;
    try {
      url = new URL(match[1], baseUrl);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    const text = cleanText(match[2].replace(/<[^>]*>/g, "")).toLowerCase();
    const path = url.pathname.toLowerCase();
    const looksLikeContact = /contact|contacto|kontakt|about|sobre|quem/.test(path) || /contact|about|sobre|quem/.test(text);
    if (looksLikeContact) links.push(url.href);
  }
  // If there are no links, try the usual paths directly.
  if (!links.length) {
    for (const path of CONTACT_PATHS) links.push(new URL(`/${path}`, origin).href);
  }
  return [...new Set(links)];
}

/**
 * Crawl one hostel site. Returns the best address, plus every page that was
 * tried, so "no email" is a finding rather than a shrug.
 */
export async function crawlSite(website, options = {}) {
  const {
    userAgent,
    timeoutMs,
    maxBytes,
    maxPages = 3,
    spacingMs = 800,
    respectRobots = true,
  } = options;

  const fetchOptions = { userAgent, timeoutMs, maxBytes, spacingMs };
  const home = await fetchText(website, fetchOptions);
  const tried = [{ url: website, ok: home.ok, status: home.status ?? null, error: home.error ?? null }];

  if (!home.ok || !home.text) {
    return { email: "", evidenceUrl: "", evidenceText: "", tried, reason: home.error ?? `http ${home.status}` };
  }

  const origin = new URL(home.url ?? website).origin;
  let rules = [];
  if (respectRobots) {
    const robots = await robotsFor(origin, fetchOptions);
    rules = robots.rules;
  }

  const pages = [{ url: home.url ?? website, html: home.text, robots: rules }];
  const candidates = findContactLinks(home.text, home.url ?? website).slice(0, maxPages - 1);
  for (const url of candidates) {
    if (pages.length >= maxPages) break;
    const path = new URL(url).pathname;
    if (!isAllowedByRobots(rules, path)) {
      tried.push({ url, ok: false, status: null, error: "disallowed by robots.txt" });
      continue;
    }
    const page = await fetchText(url, fetchOptions);
    tried.push({ url, ok: page.ok, status: page.status ?? null, error: page.error ?? null });
    if (page.ok && page.text) pages.push({ url: page.url ?? url, html: page.text, robots: rules });
  }

  const siteDomain = domainOf(website);
  const all = [];
  for (const page of pages) {
    for (const entry of extractEmails(page.html, page.url)) {
      if (!isAllowedByRobots(rules, new URL(page.url).pathname)) continue;
      all.push(entry);
    }
  }

  const ranked = rankEmails(all, siteDomain);
  if (!ranked.length) {
    return { email: "", evidenceUrl: "", evidenceText: "", tried, reason: "no address published" };
  }
  const best = ranked[0];
  return {
    email: best.email,
    evidenceUrl: best.url,
    evidenceText: best.context ?? "",
    tried,
    others: ranked.slice(1, 4).map((entry) => entry.email),
  };
}
