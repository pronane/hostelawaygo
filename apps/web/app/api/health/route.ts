import { dbInfo, getDb } from "@/lib/db";
import { SCHEMA_VERSION } from "@/lib/schema";
import { paymentProvider } from "@/lib/payments";
import { demoAccountsEnabled, demoLoginEnabled } from "@/lib/flags";
import { storage } from "@/lib/storage";

/**
 * Liveness plus the three facts worth knowing about a running deployment: is the
 * database there and the schema this build expects, which driver is answering
 * (`database`) and whether it will still be there tomorrow (`storage`), and is
 * this the demo or the real thing.
 *
 * Deliberately cheap and public: no session, no counts of people, nothing that
 * would be a leak. A deploy platform points its health check here, which also
 * means the first request (and therefore the schema + seed) happens during the
 * deploy rather than in a stranger's browser.
 */
export const dynamic = "force-dynamic";

const started = Date.now();

export async function GET() {
  try {
    const db = getDb();
    const version = (await db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get<{ value: string }>())?.value;
    const cities = (await db.prepare("SELECT COUNT(*) AS n FROM cities").get<{ n: number }>())?.n ?? 0;
    const events = (await db.prepare("SELECT COUNT(*) AS n FROM events").get<{ n: number }>())?.n ?? 0;

    const body = {
      service: "away-web",
      ok: version === SCHEMA_VERSION,
      schema: version ?? "missing-and-rebuilt",
      expectedSchema: SCHEMA_VERSION,
      cities,
      events,
      payments: paymentProvider(),
      // "turso" is SQLite in the cloud; "sqlite" is a file, which is persistent
      // only where something mounts a disk.
      database: dbInfo.driver,
      // "ephemeral" means the database does not survive this instance — true on
      // Vercel without Turso, on any serverless host, and on a machine with
      // nothing mounted.
      storage: storage.ephemeral ? "ephemeral" : "persistent",
      storageWhy: storage.reason,
      demo:
        demoAccountsEnabled() || demoLoginEnabled()
          ? { logins: demoLoginEnabled(), accounts: demoAccountsEnabled() }
          : null,
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
      node: process.version,
    };

    return Response.json(body, {
      status: body.ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { service: "away-web", ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
