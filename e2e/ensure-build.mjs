#!/usr/bin/env node
/**
 * `npm test` runs `next start`, which needs a production build. If there isn't
 * one (fresh clone), build first — otherwise the failure looks like a browser
 * problem when it's just a missing `.next`.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, "../apps/web");
const built = join(web, ".next", "BUILD_ID");

if (existsSync(built)) {
  console.log("e2e: apps/web is already built");
  process.exit(0);
}

console.log("e2e: no build found in apps/web — building once (this takes a minute)");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["run", "build"], { cwd: web, stdio: "inherit", shell: process.platform === "win32" });

if (result.status !== 0) {
  console.error("e2e: the build failed, so there is nothing for the browser to open.");
  process.exit(result.status ?? 1);
}
