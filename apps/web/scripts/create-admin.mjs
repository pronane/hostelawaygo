#!/usr/bin/env node
/**
 * Create (or fix) an account on a database that already exists.
 *
 *   npm run admin:create -- someone@away.app --name "Sam" 
 *   npm run admin:create -- ana@hostel.pt --role hostel_staff --hostel home-lisbon
 *   npm run admin:create -- --list
 *
 * With no --password one is generated and printed once. The hash format is the
 * same `scrypt$salt$hash` the app writes (lib/password.ts), and this script
 * verifies its own output before touching the database, so an account made here
 * can always sign in on /login.
 *
 * For the very first admin on a fresh deployment, prefer the environment pair
 * AWAY_BOOTSTRAP_EMAIL / AWAY_BOOTSTRAP_PASSWORD — it needs no shell.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.AWAY_DB_PATH
  ? resolve(web, process.env.AWAY_DB_PATH)
  : join(web, "data", "away.db");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const ROLES = ["traveller", "hostel_staff", "admin"];

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const candidate = scryptSync(password, salt, expected.length);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}.`);
  console.error("Start the app once (it creates and seeds its own schema), then run this again.");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");

if (args.includes("--list")) {
  const rows = db
    .prepare("SELECT id, name, email, role, hostel_id FROM travellers WHERE email IS NOT NULL ORDER BY id")
    .all();
  if (!rows.length) console.log("No accounts have an email address yet.");
  for (const row of rows) {
    console.log(`${String(row.id).padStart(4)}  ${row.role.padEnd(12)} ${row.email}${row.hostel_id ? `  hostel ${row.hostel_id}` : ""}`);
  }
  db.close();
  process.exit(0);
}

const email = (args[0] ?? flag("--email") ?? "").trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: npm run admin:create -- you@example.com [--name Name] [--password Secret123] [--role admin] [--hostel slug] [--list]");
  process.exit(1);
}

const role = flag("--role") ?? "admin";
if (!ROLES.includes(role)) {
  console.error(`--role must be one of: ${ROLES.join(", ")}`);
  process.exit(1);
}

const password = flag("--password") ?? randomBytes(12).toString("base64url");
if (password.length < 8) {
  console.error("Passwords need at least 8 characters — the login form says so too.");
  process.exit(1);
}

const hash = hashPassword(password);
if (!verifyPassword(password, hash)) {
  console.error("The password hash did not verify against itself; refusing to write it.");
  process.exit(1);
}

const name = flag("--name") ?? email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const initials = name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0].toUpperCase())
  .join("");

let hostelId = null;
const hostelSlug = flag("--hostel");
if (hostelSlug) {
  const hostel = db.prepare("SELECT id, name FROM hostels WHERE slug = ?").get(hostelSlug);
  if (!hostel) {
    console.error(`No hostel with slug "${hostelSlug}". Try: ${db.prepare("SELECT slug FROM hostels LIMIT 8").all().map((h) => h.slug).join(", ")}`);
    process.exit(1);
  }
  hostelId = hostel.id;
}

if (role === "hostel_staff" && !hostelId) {
  console.error("A hostel staff account needs --hostel <slug> so it can post for that hostel.");
  process.exit(1);
}

const existing = db.prepare("SELECT id FROM travellers WHERE email = ?").get(email);

if (existing) {
  db.prepare(
    "UPDATE travellers SET password_hash = ?, role = ?, hostel_id = ?, email_verified_at = datetime('now') WHERE id = ?"
  ).run(hash, role, hostelId, existing.id);
  console.log(`Updated ${email} (${role}) on ${dbPath}`);
} else {
  db.prepare(
    `INSERT INTO travellers (name, initials, flag, colour, solo, languages, email, password_hash, role, hostel_id, email_verified_at)
     VALUES (?, ?, '🌍', '#E7D6FF', 0, 'English', ?, ?, ?, ?, datetime('now'))`
  ).run(name, initials, email, hash, role, hostelId);
  console.log(`Created ${email} (${role}) on ${dbPath}`);
}

if (!flag("--password")) {
  console.log("");
  console.log(`  password: ${password}`);
  console.log("  (shown once — change it by running this again with --password)");
} else {
  console.log("  password: as given");
}

db.close();
