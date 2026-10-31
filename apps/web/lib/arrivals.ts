/**
 * Anonymous arrival tracking.
 *
 * A hostel sticks a QR code on the back of every dorm door and at reception.
 * Scanning it lands on `/stay/<hostel>`, which drops an opaque visitor cookie
 * and records the arrival. When that same browser later joins an event or books
 * a bed, the arrival is stamped with the account, which gives the hostel a
 * funnel it can actually check: scans → joined something → booked a bed.
 *
 * No personal data is stored on the anonymous path — just a random id and a day.
 */

import { cookies } from "next/headers";
import { newToken } from "./password";

export const VISITOR_COOKIE = "away_visitor";
export const STAY_COOKIE = "away_stay";

const secure = process.env.NODE_ENV === "production";

const cookieOptions = (maxAge: number) => ({
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure,
  maxAge,
});

/** Read-only: safe in server components. */
export async function readVisitor(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(VISITOR_COOKIE)?.value ?? null;
}

/** Read-only: the hostel whose QR brought this browser here, if any. */
export async function readStay(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(STAY_COOKIE)?.value ?? null;
}

/**
 * Only call this from a route handler or server action — Next refuses to set a
 * cookie while rendering a page, which is why the arrival lives at `/stay/…`
 * rather than as middleware on the feed.
 */
export async function ensureVisitor(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing) return existing;

  const id = newToken(12);
  jar.set(VISITOR_COOKIE, id, cookieOptions(60 * 60 * 24 * 180));
  return id;
}

export async function rememberStay(hostelSlug: string): Promise<void> {
  const jar = await cookies();
  jar.set(STAY_COOKIE, hostelSlug, cookieOptions(60 * 60 * 24 * 30));
}

export async function forgetStay(): Promise<void> {
  const jar = await cookies();
  jar.delete(STAY_COOKIE);
}
