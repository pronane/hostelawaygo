#!/usr/bin/env node
/**
 * What Away costs to run, and what it has to earn to pay for itself.
 *
 *   node scripts/cost-model.mjs               # markdown tables, default tiers
 *   node scripts/cost-model.mjs --json        # the same numbers, machine-readable
 *   node scripts/cost-model.mjs --pv=12       # try a different pages-per-MAU
 *
 * No dependencies, no network. Every vendor price below is a published list
 * price captured in November 2026, kept in one object so the argument can be
 * re-run when a vendor changes its mind. The traffic assumptions are the only
 * guesses — they are labelled, and `--sensitivity` shows what happens when they
 * are wrong by 3x in either direction.
 */

const opts = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);

const USD_EUR = 0.92; // list prices are USD; Hetzner bills EUR. Change if it drifts.

/** Published list prices, November 2026. */
const PRICES = {
  vercel: {
    // Hobby is explicitly non-commercial, so charging anybody means Pro.
    proSeatUsd: 20,
    includedTransferGb: 1024,
    overagePerGbUsd: 0.15,
    activeCpuPerHourUsd: 0.184, // Frankfurt, Fluid compute
    provisionedMemoryPerGbHourUsd: 0.0183,
  },
  render: {
    starterUsd: 7, // 0.5 vCPU, 512 MB, 100 GB transfer
    standardUsd: 25, // 1 vCPU, 2 GB, 500 GB transfer
    proUsd: 85,
    overagePer100GbUsd: 15,
    diskPerGbUsd: 0.25,
  },
  turso: {
    freeRowsRead: 500e6,
    freeRowsWritten: 10e6,
    freeStorageGb: 5,
    developerUsd: 5.99, // 2.5B rows read, 25M written, 9 GB
    scalerUsd: 29,
  },
  hetzner: {
    cx23Eur: 4.29, // 2 vCPU, 4 GB, 40 GB, 20 TB traffic
    backupEur: 1.0,
    trafficTbIncluded: 20,
  },
  cloudflare: {
    workersPaidUsd: 5,
    d1FreeRowsReadPerDay: 5e6,
  },
};

/**
 * Traffic per active user per month. These are the guesses that decide
 * everything; they are deliberately pessimistic (a hostel-stay traveller opens
 * the app more than a normal web visitor, and every page here is dynamic).
 */
const BASE = {
  sessionsPerUser: 4,
  pagesPerSession: Number(opts.pv ?? 8),
  apiCallsPerSession: 6,
  /** Rows an average page view touches: the feed joins events, joins, hostels, cities. */
  rowsReadPerPage: 400,
  rowsWrittenPerUser: 25,
  kbPerPage: 250,
  /** Minutes a month a user keeps a chat stream open (SSE holds a function). */
  chatMinutesPerUser: 6,
  serverCpuSecondsPerPage: 0.12,
  apiCpuSecondsPerCall: 0.03,
  memoryGb: 0.5,
};

/** Domain, backup mail, error tracking — the small lines nobody models. */
const OVERHEAD_EUR = 3;

/** What a city costs to run in hostels; used for the revenue side. */
const SUPPLY = {
  hostelsPerCity: 10,
  /** Share of listed hostels that end up paying. Free tier keeps the rest listed. */
  paidShare: opts.paid ?? 0.35,
  pricePerHostelEur: Number(opts.price ?? 19),
  /** Optional: 5% of a paid event, through the existing sandbox payments. */
  ticketingShareOfCities: 0.5,
  eventsPerCityMonth: 12,
  averageTicketEur: 12,
  averageAttendance: 9,
  ticketingFee: 0.05,
};

function traffic(mau) {
  const pages = mau * BASE.sessionsPerUser * BASE.pagesPerSession;
  const apiCalls = mau * BASE.sessionsPerUser * BASE.apiCallsPerSession;
  const rowsRead = pages * BASE.rowsReadPerPage;
  const rowsWritten = mau * BASE.rowsWrittenPerUser;
  const transferGb = (pages * BASE.kbPerPage) / 1024 / 1024;
  const cpuHours = (pages * BASE.serverCpuSecondsPerPage + apiCalls * BASE.apiCpuSecondsPerCall) / 3600;
  const chatHours = (mau * BASE.chatMinutesPerUser) / 60;
  return { mau, pages, apiCalls, rowsRead, rowsWritten, transferGb, cpuHours, chatHours };
}

const eur = (usd) => usd * USD_EUR;
const money = (n) => `€${n.toFixed(2)}`;

function tursoCost(t) {
  if (t.rowsRead <= PRICES.turso.freeRowsRead && t.rowsWritten <= PRICES.turso.freeRowsWritten) {
    return { usd: 0, plan: "Free" };
  }
  if (t.rowsRead <= 2.5e9 && t.rowsWritten <= 25e6) return { usd: PRICES.turso.developerUsd, plan: "Developer" };
  return { usd: PRICES.turso.scalerUsd, plan: "Scaler" };
}

function vercelCost(t) {
  const seat = PRICES.vercel.proSeatUsd;
  const compute =
    t.cpuHours * PRICES.vercel.activeCpuPerHourUsd + t.chatHours * BASE.memoryGb * PRICES.vercel.provisionedMemoryPerGbHourUsd;
  const overage = Math.max(0, t.transferGb - PRICES.vercel.includedTransferGb) * PRICES.vercel.overagePerGbUsd;
  return { usd: seat + compute + overage, lines: { seat, compute, overage } };
}

function renderCost(t) {
  // 512 MB holds this comfortably to ~2k MAU; past that, take the 2 GB tier.
  const tier = t.mau <= 2000 ? PRICES.render.starterUsd : PRICES.render.standardUsd;
  const includedGb = t.mau <= 2000 ? 100 : 500;
  const overage = Math.max(0, t.transferGb - includedGb) / 100 * PRICES.render.overagePer100GbUsd;
  return { usd: tier + overage, tier, overage };
}

function hetznerCost() {
  return { eur: PRICES.hetzner.cx23Eur + PRICES.hetzner.backupEur };
}

function cloudflareCost(t) {
  // Next 16 on Workers needs the OpenNext adapter; D1's free tier is 5M rows/day.
  const freeDays = PRICES.cloudflare.d1FreeRowsReadPerDay * 30;
  const d1 = t.rowsRead <= freeDays ? 0 : 5;
  return { usd: PRICES.cloudflare.workersPaidUsd + d1 };
}

function revenue(mau) {
  const cities = Math.max(1, Math.round(mau / 2000)); // ~2k MAU per city
  const hostels = cities * SUPPLY.hostelsPerCity;
  const paying = Math.round(hostels * SUPPLY.paidShare);
  const subscription = paying * SUPPLY.pricePerHostelEur;
  const ticketing =
    cities * SUPPLY.ticketingShareOfCities * SUPPLY.eventsPerCityMonth * SUPPLY.averageTicketEur *
    SUPPLY.averageAttendance * SUPPLY.ticketingFee;
  return { cities, hostels, paying, subscription, ticketing, total: subscription + ticketing };
}

function row(cells) {
  return `| ${cells.join(" | ")} |`;
}

function table(headers, rows) {
  return [row(headers), `|${headers.map(() => "---").join("|")}|`, ...rows.map(row)].join("\n");
}

const tiers = (opts.tiers ? String(opts.tiers).split(",").map(Number) : [1000, 2000, 5000, 10000]).sort(
  (a, b) => a - b
);

const model = tiers.map((mau) => {
  const t = traffic(mau);
  const v = vercelCost(t);
  const r = renderCost(t);
  const h = hetznerCost();
  const c = cloudflareCost(t);
  const db = tursoCost(t);

  const stacks = {
    vercelTurso: eur(v.usd) + eur(db.usd) + OVERHEAD_EUR,
    renderTurso: eur(r.usd) + eur(db.usd) + OVERHEAD_EUR,
    hetznerSqlite: h.eur + OVERHEAD_EUR,
    cloudflareD1: eur(c.usd) + OVERHEAD_EUR,
  };
  const rev = revenue(mau);
  const paidHostelsToBreakEven = (m) => Math.ceil(stacks[m] / SUPPLY.pricePerHostelEur);

  return { mau, ...t, stacks, rev, db, v, r, perThousand: stacks.vercelTurso / (mau / 1000), breakEven: Object.fromEntries(Object.keys(stacks).map((k) => [k, paidHostelsToBreakEven(k)])) };
});

if (opts.json) {
  console.log(JSON.stringify({ assumptions: BASE, supply: SUPPLY, model }, null, 2));
  process.exit(0);
}

console.log("## Traffic, per month\n");
console.log(
  table(
    ["MAU", "Page views", "Requests", "Rows read", "Rows written", "Transfer", "Server CPU", "Held chat"],
    model.map((m) => [
      m.mau.toLocaleString("en-GB"),
      Math.round(m.pages).toLocaleString("en-GB"),
      Math.round(m.pages + m.apiCalls).toLocaleString("en-GB"),
      `${(m.rowsRead / 1e6).toFixed(0)}M`,
      `${(m.rowsWritten / 1e3).toFixed(0)}k`,
      `${m.transferGb.toFixed(0)} GB`,
      `${m.cpuHours.toFixed(1)} h`,
      `${Math.round(m.chatHours)} h`,
    ])
  )
);

console.log("\n## Infrastructure, per month\n");
console.log(
  table(
    ["MAU", "Vercel Pro + Turso", "Render + Turso", "Hetzner + SQLite", "Cloudflare + D1", "Vercel € / 1k MAU"],
    model.map((m) => [
      m.mau.toLocaleString("en-GB"),
      `${money(m.stacks.vercelTurso)}`,
      `${money(m.stacks.renderTurso)}`,
      `${money(m.stacks.hetznerSqlite)}`,
      `${money(m.stacks.cloudflareD1)}`,
      money(m.perThousand),
    ])
  )
);

console.log("\n## Revenue, and what pays for it\n");
console.log(
  table(
    ["MAU", "Cities", "Hostels", "Paying", "Subscriptions", "Ticketing", "Total", "Break-even (Vercel / Hetzner)"],
    model.map((m) => [
      m.mau.toLocaleString("en-GB"),
      m.rev.cities,
      m.rev.hostels,
      m.rev.paying,
      money(m.rev.subscription),
      money(m.rev.ticketing),
      money(m.rev.total),
      `${m.breakEven.vercelTurso} / ${m.breakEven.hetznerSqlite} hostels`,
    ])
  )
);

if (opts.sensitivity) {
  console.log("\n## If the traffic assumption is wrong by 3x\n");
  const rowsOut = tiers.map((mau) => {
    const low = traffic(mau * 0.33);
    const high = traffic(mau * 3);
    const vLow = eur(vercelCost(low).usd) + eur(tursoCost(low).usd);
    const vHigh = eur(vercelCost(high).usd) + eur(tursoCost(high).usd);
    return [
      mau.toLocaleString("en-GB"),
      money(vLow),
      money(vHigh),
      `${money(eur(tursoCost(high).usd))} (${tursoCost(high).plan})`,
    ];
  });
  console.log(table(["MAU", "Vercel (÷3 traffic)", "Vercel (×3 traffic)", "Turso at ×3"], rowsOut));
}

{
  const headroom = (() => {
    let mau = 1000;
    while (mau < 5e6 && tursoCost(traffic(mau)).plan === "Free") mau += 1000;
    return mau;
  })();
  console.log(
    `\nTurso stays on the free plan to about ${headroom.toLocaleString("en-GB")} MAU ` +
      `(500M rows read/month); after that it is $${PRICES.turso.developerUsd}/mo.`
  );
  const big = model[model.length - 1];
  console.log(
    `At ${big.mau.toLocaleString("en-GB")} MAU, held chat streams are ${money(eur(big.chatHours * BASE.memoryGb * PRICES.vercel.provisionedMemoryPerGbHourUsd))} ` +
      `of the Vercel bill — the only line that grows with time rather than with requests.`
  );
}

console.log(
  "\nAssumptions: sessions/user/mo, pages/session, rows read per page view, " +
    "transfer per page, chat minutes per user, and a 5% ticketing fee on half the cities' paid events.\n" +
    `Prices: Vercel Pro $${PRICES.vercel.proSeatUsd} seat + Fluid compute; Render $${PRICES.render.starterUsd}/$${PRICES.render.standardUsd}; ` +
    `Turso Free/${PRICES.turso.developerUsd}/${PRICES.turso.scalerUsd}; Hetzner CX23 €${PRICES.hetzner.cx23Eur} + backup; ` +
    `Cloudflare Workers $${PRICES.cloudflare.workersPaidUsd}.\n` +
    `USD→EUR at ${USD_EUR}. ${model[0].mau ? "" : ""}`
);
