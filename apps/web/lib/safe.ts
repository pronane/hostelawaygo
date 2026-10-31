import { getDb } from "./db";
import { newToken } from "./password";

/**
 * "Share my night". A traveller says where they're going and when they'll be
 * back; a friend gets a link that shows "out", "home safe at 01:12" or
 * "overdue by 25 minutes". Nothing is sent automatically - the point is that
 * someone knows where you went and notices if you don't check in.
 */
export type SafeNight = {
  id: number;
  token: string;
  traveller_id: number;
  event_id: number | null;
  plan: string;
  friend_name: string;
  back_by: string;
  tz: string;
  created_at: string;
  home_at: string | null;
  cancelled: number;
};

export type SafeStatus = "out" | "home" | "overdue" | "cancelled";

export function statusOf(night: SafeNight, now = new Date()): SafeStatus {
  if (night.cancelled) return "cancelled";
  if (night.home_at) return "home";
  return now.toISOString() > night.back_by ? "overdue" : "out";
}

export function minutesOverdue(night: SafeNight, now = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - new Date(night.back_by).getTime()) / 60_000));
}

export function createSafeNight(input: {
  travellerId: number;
  eventId: number | null;
  plan: string;
  friendName: string;
  backBy: string;
  tz: string;
}): string {
  const token = newToken(16);
  getDb()
    .prepare(
      `INSERT INTO safe_nights (token, traveller_id, event_id, plan, friend_name, back_by, tz, created_at)
       VALUES (@token, @me, @eventId, @plan, @friend, @backBy, @tz, @now)`
    )
    .run({
      token,
      me: input.travellerId,
      eventId: input.eventId,
      plan: input.plan,
      friend: input.friendName,
      backBy: input.backBy,
      tz: input.tz,
      now: new Date().toISOString(),
    });
  return token;
}

export function getSafeNight(token: string): (SafeNight & { first_name: string }) | null {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const row = getDb()
    .prepare(
      `SELECT s.*, t.name AS traveller_name FROM safe_nights s
       JOIN travellers t ON t.id = s.traveller_id WHERE s.token = ?`
    )
    .get<SafeNight & { traveller_name: string }>(token);
  if (!row) return null;
  // The friend's page only ever shows a first name.
  const { traveller_name, ...rest } = row;
  return { ...rest, first_name: traveller_name.split(" ")[0] ?? "Your friend" };
}

/** The traveller's own nights from the last two days, newest first. */
export function getSafeNights(me: number): SafeNight[] {
  return getDb()
    .prepare(
      `SELECT * FROM safe_nights WHERE traveller_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 10`
    )
    .all<SafeNight>(me, new Date(Date.now() - 2 * 86_400_000).toISOString());
}

/** Only the owner can check in or cancel. Returns false if not theirs. */
export function updateSafeNight(token: string, me: number, change: "home" | "cancel" | "extend"): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT id, traveller_id, back_by FROM safe_nights WHERE token = ?")
    .get<{ id: number; traveller_id: number; back_by: string }>(token);
  if (!row || row.traveller_id !== me) return false;
  if (change === "home") {
    db.prepare("UPDATE safe_nights SET home_at = ? WHERE id = ? AND home_at IS NULL").run(new Date().toISOString(), row.id);
  } else if (change === "cancel") {
    db.prepare("UPDATE safe_nights SET cancelled = 1 WHERE id = ?").run(row.id);
  } else {
    // Running late: push "back by" an hour from whichever is later, now or the old time.
    const base = Math.max(Date.now(), new Date(row.back_by).getTime());
    db.prepare("UPDATE safe_nights SET back_by = ? WHERE id = ?").run(new Date(base + 3_600_000).toISOString(), row.id);
  }
  return true;
}

/** "01:30 Lisbon time" */
export function formatLocal(iso: string, tz: string): string {
  const time = new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const place = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
  return `${time} ${place} time`;
}
