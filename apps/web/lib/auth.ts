import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { newToken } from "./password";

export const SESSION_COOKIE = "away_session";

/**
 * One-click demo sign-in skips the password, so it must never be reachable on a
 * real deployment (server actions can be called directly, not just from the
 * login page). The policy lives in ./flags so scripts can share it.
 */
export { demoAccountsEnabled, demoLoginEnabled } from "./flags";
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
  /** null for travellers/admins; 'pending' until ops approves an application. */
  hostel_status: string | null;
  solo: boolean;
  languages: string;
  /** Seeded demo accounts are pre-verified; new sign-ups verify by email link. */
  email_verified: boolean;
  /** False for accounts created by a provider — they can always add one later. */
  has_password: boolean;
};

type UserRow = Omit<SessionUser, "solo" | "email_verified" | "has_password"> & {
  solo: number;
  email_verified_at: string | null;
  has_password: number;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;

  const row = await getDb()
    .prepare(
      `SELECT t.id, t.name, t.initials, t.flag, t.colour, t.email, t.role, t.hostel_id,
              t.solo, t.languages, t.email_verified_at,
              (t.password_hash IS NOT NULL) AS has_password, h.name AS hostel_name,
              h.status AS hostel_status
       FROM sessions s
       JOIN travellers t ON t.id = s.user_id
       LEFT JOIN hostels h ON h.id = t.hostel_id
       WHERE s.id = @id AND s.expires_at > @now`
    )
    .get<UserRow>({ id, now: new Date().toISOString() });

  if (!row) return null;
  const { email_verified_at, ...rest } = row;
  return {
    ...rest,
    solo: Boolean(row.solo),
    role: row.role as Role,
    email_verified: Boolean(email_verified_at),
    has_password: Boolean(row.has_password),
  };
}

export async function startSession(userId: number): Promise<void> {
  const id = newToken(24);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);

  await getDb()
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
  if (id) await getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
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

/**
 * Hostel staff whose application hasn't been approved can't post, moderate or
 * open the portal — they land on /partner, which explains where they are in the
 * queue. Admins are never blocked.
 */
export async function requireActiveStaff(nextPath = "/"): Promise<SessionUser> {
  const user = await requireStaff(nextPath);
  if (user.role === "hostel_staff" && user.hostel_status !== "active") {
    redirect("/partner?pending=1");
  }
  return user;
}

export function isActiveStaff(user: SessionUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.role === "hostel_staff" && user.hostel_status === "active";
}

export async function requireAdmin(nextPath = "/"): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (user.role !== "admin") redirect("/?denied=admin");
  return user;
}
