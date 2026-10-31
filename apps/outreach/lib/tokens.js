/**
 * Unsubscribe links.
 *
 * One token per (prospect, address). It carries no data the recipient didn't
 * already give us, it doesn't expire (an old letter must still work), and it
 * never reveals the signing key. Rotating OUTREACH_SECRET invalidates every
 * link ever sent, which is the safe direction to fail.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const unsubToken = (secret, prospectId, email) =>
  createHmac("sha256", secret)
    .update(`${prospectId}:${String(email).toLowerCase()}`)
    .digest("base64url")
    .slice(0, 24);

export function unsubPath(secret, prospectId, email) {
  return `/u/${prospectId}.${unsubToken(secret, prospectId, email)}`;
}

export function unsubUrl(publicUrl, secret, prospectId, email) {
  return `${publicUrl.replace(/\/$/, "")}${unsubPath(secret, prospectId, email)}`;
}

export function verifyUnsubToken(secret, prospectId, email, token) {
  const expected = unsubToken(secret, prospectId, email);
  if (!token || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

/** Parse `/u/12.abcdef` into its two parts. */
export function parseUnsubToken(value) {
  const match = /^(\d+)\.([A-Za-z0-9_-]{10,64})$/.exec(String(value ?? ""));
  if (!match) return null;
  return { prospectId: Number(match[1]), token: match[2] };
}
