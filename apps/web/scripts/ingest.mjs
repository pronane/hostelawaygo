#!/usr/bin/env node
/**
 * Trigger the Ticketmaster ingest from the command line (e.g. from cron).
 *   npm run ingest
 *   AWAY_BASE_URL=https://away.example INGEST_TOKEN=... npm run ingest
 */
const base = process.env.AWAY_BASE_URL ?? "http://127.0.0.1:3000";
const token = process.env.INGEST_TOKEN ?? "dev-ingest";

const res = await fetch(`${base}/api/ingest`, {
  method: "POST",
  headers: { "x-ingest-token": token },
});

const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`Ingest failed (${res.status}):`, body.error ?? body);
  process.exit(1);
}

console.log(
  `Ingest #${body.runId} (${body.mode}) — fetched ${body.fetched}, ` +
    `inserted ${body.inserted}, updated ${body.updated}, skipped ${body.skipped} — ${body.status}`
);
