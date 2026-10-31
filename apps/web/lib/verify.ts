import { createHash } from "node:crypto";
import { getDb } from "./db";
import { appUrl, sendMail } from "./mail";
import { newToken } from "./password";

const TTL_HOURS = 48;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Issues a fresh verification link (older unused ones stop working) and emails
 * it. Returns the link only when no email provider is configured outside
 * production, so the developer can click it from the page.
 */
export async function sendVerification(
  travellerId: number,
  email: string,
  origin?: string,
): Promise<{ sent: boolean; devLink: string | null }> {
  const token = newToken(24);
  const db = getDb();
  db.prepare("DELETE FROM email_tokens WHERE traveller_id = ?").run(travellerId);
  db.prepare(
    "INSERT INTO email_tokens (token_hash, traveller_id, expires_at) VALUES (@hash, @id, @expires)"
  ).run({
    hash: sha256(token),
    id: travellerId,
    expires: new Date(Date.now() + TTL_HOURS * 3_600_000).toISOString(),
  });
  const link = `${appUrl(origin)}/verify?token=${token}`;
  const { sent } = await sendMail(
    email,
    "Confirm your email for Away",
    `Tap to confirm your email and unlock event chats:\n\n${link}\n\nThe link works for ${TTL_HOURS} hours. If you didn't sign up for Away, ignore this email.`
  );
  const devLink = !sent && process.env.NODE_ENV !== "production" ? link : null;
  return { sent, devLink };
}

/** Marks the account verified if the token is valid, unused and in date. */
export function consumeVerification(token: string): number | null {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const db = getDb();
  const row = db
    .prepare("SELECT traveller_id, expires_at, used_at FROM email_tokens WHERE token_hash = ?")
    .get<{ traveller_id: number; expires_at: string; used_at: string | null }>(sha256(token));
  if (!row || row.used_at || row.expires_at < new Date().toISOString()) return null;
  db.transaction(() => {
    db.prepare("UPDATE email_tokens SET used_at = datetime('now') WHERE token_hash = ?").run(sha256(token));
    db.prepare("UPDATE travellers SET email_verified_at = datetime('now') WHERE id = ?").run(row.traveller_id);
  })();
  return row.traveller_id;
}
