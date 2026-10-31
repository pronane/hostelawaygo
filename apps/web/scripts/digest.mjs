#!/usr/bin/env node
/**
 * Send the arrivals digest from the command line (e.g. from cron, Mondays 09:00).
 *   npm run digest
 *   AWAY_BASE_URL=https://away.example DIGEST_TOKEN=... npm run digest
 *   DRY_RUN=1 npm run digest        # builds and reports, sends nothing
 */
const base = process.env.AWAY_BASE_URL ?? "http://127.0.0.1:3000";
const token = process.env.DIGEST_TOKEN ?? "dev-digest";
const dryRun = process.env.DRY_RUN === "1";

const res = await fetch(`${base}/api/digest`, {
  method: "POST",
  headers: { "x-digest-token": token, "content-type": "application/json" },
  body: JSON.stringify({ dryRun }),
});

const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`Digest failed (${res.status}):`, body.error ?? body);
  if (res.status === 401) {
    console.error(
      "\nA production build has no fallback token. Set DIGEST_TOKEN on the server and pass\n" +
        "the same value here:  DIGEST_TOKEN=… npm run digest\n" +
        "(An admin session can also run it from /admin/digest.)"
    );
  }
  process.exit(1);
}

for (const row of body.results ?? []) {
  console.log(`  ${row.status.padEnd(12)} ${row.traveller} <${row.email}> · ${row.city} · ${row.window} — ${row.note}`);
}

console.log(
  `\nDigest ${dryRun ? "(dry run) " : ""}— considered ${body.considered}, sent ${body.sent}`
);
