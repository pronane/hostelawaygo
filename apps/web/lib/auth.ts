import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { newToken } from "./password";

export const SESSION_COOKIE = "away_session";

/**
 * One-click demo sign-in skips the password, so it must never be reachable on a
 * real deployment (server actions can be called directly, not just from the
 * login page). On by default in dev, opt-in elsewhere with DEMO_LOGIN=1.
 */
export function demoLoginEnabled(): boolean {
  if (process.env.DEMO_LOGIN === "1") return true;
  if (process.env.DEMO_LOGIN === "0") return false;
  return process.env.NODE_ENV !== "production";
}
export const CITY_COOKIE = "away_city";
const SESSION_DAYS = 30;

export type Role = "traveller" | "hostel_staff" | "admin";

export type SessionUser = {
  id: number;
  name: string;
  initials: string;
  flag: string;
  colour: string;
  email: string | null;
  role: Role;
  hostel_id: number | null;
  hostel_name: string | null;
  solo: boolean;
  languages: string;
  /** Seeded demo accounts are pre-verified; new sign-ups verify by email link. */
  email_verified: boolean;
};

type UserRow = Omit<SessionUser, "solo" | "email_verified"> & { solo: number; email_verified_at: string | null };

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;

  const row = getDb()
    .prepare(
      `SELECT t.id, t.name, t.initials, t.flag, t.colour, t.email, t.role, t.hostel_id,
              t.solo, t.languages, t.email_verified_at, h.name AS hostel_name
       FROM sessions s
       JOIN travellers t ON t.id = s.user_id
       LEFT JOIN hostels h ON h.id = t.hostel_id
       WHERE s.id = @id AND s.expires_at > @now`
    )
    .get<UserRow>({ id, now: new Date().toISOString() });

  if (!row) return null;
  const { email_verified_at, ...rest } = row;
  return { ...rest, solo: Boolean(row.solo), role: row.role as Role, email_verified: Boolean(email_verified_at) };
}

export async function startSession(userId: number): Promise<void> {
  const id = newToken(24);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);

  getDb()
    .prepare(
      "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (@id, @userId, @now, @expires)"
    )
    .run({ id, userId, now: now.toISOString(), expires: expires.toISOString() });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
  jar.delete(SESSION_COOKIE);
}

export async function requireUser(nextPath = "/"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export function isStaff(user: SessionUser | null): boolean {
  return user?.role === "hostel_staff" || user?.role === "admin";
}

export async function requireStaff(nextPath = "/"): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (!isStaff(user)) redirect("/?denied=staff");
  return user;
}

export async function requireAdmin(nextPath = "/"): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (user.role !== "admin") redirect("/?denied=admin");
  return user;
}
