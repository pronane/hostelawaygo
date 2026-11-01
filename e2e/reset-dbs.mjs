#!/usr/bin/env node
/**
 * Delete the throwaway databases this suite runs against.
 *
 * Called by the Playwright `webServer` commands immediately before each server
 * boots, so the order is guaranteed: empty disk, then seed, then click.
 * Nothing here can touch a real database — every path ends in `.away/` and
 * every file name starts with `e2e-`.
 */
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const everything = [
  ".away/e2e-away.db",
  ".away/e2e-away.db-journal",
  ".away/e2e-away.db-wal",
  ".away/e2e-away.db-shm",
  ".away/e2e-outreach.db",
  ".away/e2e-outreach.db-journal",
  ".away/e2e-outreach.db-wal",
  ".away/e2e-outreach.db-shm",
  ".away/e2e-outbox",
];

const onlyOutreach = everything.filter((p) => p.includes("outreach") || p.includes("outbox"));
const targets = process.argv.includes("--outreach") ? onlyOutreach : everything;

for (const relative of targets) {
  await rm(join(root, relative), { recursive: true, force: true });
}

console.log(`e2e: cleared ${targets.length} throwaway file(s) under .away/`);
