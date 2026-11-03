import { getDb } from "./db";
import { newToken } from "./password";

/**
 * Group nights.
 *
 * Hostels are in the group business: a WhatsApp group of five arriving on a
 * Tuesday is a better night than five separate bookings, and the desk wants to
 * know it is coming. Away's traveller is usually already in a group — the
 * people in their dorm — and the group chat is the thing that decides what
 * happens at 20:00.
 *
 * So: the organiser makes a group from an event, gets one link, and the rest of
 * the group taps it. A name is enough. No account, no email, no download. That
 * is the whole conversion: a link that a hostel's WhatsApp group will actually
 * use, in the ten minutes before dinner.
 */

export type EventGroup = {
  id: number;
  token: string;
  event_id: number;
  plan: string | null;
  size: number | null;
  created_by: number | null;
  created_at: string;
};

export type GroupMember = {
  id: number;
  name: string;
  traveller_id: number | null;
  joined_at: string;
};

/** How many groups, and how many people, at an event. For the badge and the screen. */
export type GroupSummary = { groups: number; people: number; largest: number };

export async function createGroup(input: {
  eventId: number;
  travellerId: number;
  plan: string;
  size: number;
  organiserName: string;
}): Promise<string> {
  const db = getDb();
  const token = newToken(9);
  const info = await db
    .prepare(
      `INSERT INTO event_groups (token, event_id, plan, size, created_by, created_at)
       VALUES (@token, @eventId, @plan, @size, @me, datetime('now'))`
    )
    .run({
      token,
      eventId: input.eventId,
      plan: input.plan.slice(0, 80) || null,
      size: Math.min(Math.max(input.size, 2), 20),
      me: input.travellerId,
    });

  // The organiser counts as one of their own group.
  await addGroupMember({
    groupId: Number(info.lastInsertRowid),
    name: input.organiserName,
    travellerId: input.travellerId,
  });

  return token;
}

export async function getGroup(token: string): Promise<EventGroup | null> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(token)) return null;
  return (
    (await getDb().prepare("SELECT * FROM event_groups WHERE token = ?").get<EventGroup>(token)) ?? null
  );
}

export async function getGroupMembers(groupId: number): Promise<GroupMember[]> {
  return getDb()
    .prepare(
      "SELECT id, name, traveller_id, joined_at FROM event_group_members WHERE group_id = ? ORDER BY joined_at ASC, id ASC"
    )
    .all<GroupMember>(groupId);
}

/**
 * Add somebody by name. A signed-in traveller is linked to their account, so
 * the group can show up in their trips later; a stranger is just a first name,
 * which is all the hostel needs.
 */
export async function addGroupMember(input: {
  groupId: number;
  name: string;
  travellerId?: number | null;
}): Promise<{ added: boolean; people: number }> {
  const db = getDb();
  const name = input.name.trim().slice(0, 40);
  if (name.length < 1) return { added: false, people: await countMembers(input.groupId) };

  // Tapping the link twice, or signing in after tapping it, must not make it
  // look like more people are coming.
  const existing = input.travellerId
    ? await db
        .prepare("SELECT 1 AS x FROM event_group_members WHERE group_id = ? AND traveller_id = ?")
        .get(input.groupId, input.travellerId)
    : await db
        .prepare("SELECT 1 AS x FROM event_group_members WHERE group_id = ? AND lower(name) = lower(?)")
        .get(input.groupId, name);

  if (!existing) {
    await db
      .prepare(
        "INSERT INTO event_group_members (group_id, name, traveller_id, joined_at) VALUES (?, ?, ?, datetime('now'))"
      )
      .run(input.groupId, name, input.travellerId ?? null);
  }

  return { added: !existing, people: await countMembers(input.groupId) };
}

async function countMembers(groupId: number): Promise<number> {
  const row = await getDb()
    .prepare("SELECT COUNT(*) AS n FROM event_group_members WHERE group_id = ?")
    .get<{ n: number }>(groupId);
  return Number(row?.n ?? 0);
}

/** The groups at one event, newest first, with their people. */
export async function getGroupsForEvent(
  eventId: number
): Promise<Array<EventGroup & { people: number; members: string[] }>> {
  const rows = await getDb()
    .prepare(
      `SELECT g.*, COUNT(m.id) AS people
       FROM event_groups g LEFT JOIN event_group_members m ON m.group_id = g.id
       WHERE g.event_id = ?
       GROUP BY g.id
       ORDER BY g.created_at DESC, g.id DESC`
    )
    .all<EventGroup & { people: number }>(eventId);

  return rows.map((row) => ({ ...row, people: Number(row.people ?? 0), members: [] }));
}

/** Counts per event, for the board and for a list of tonight's rows in one query. */
export async function getGroupSummaries(eventIds: number[]): Promise<Map<number, GroupSummary>> {
  const summaries = new Map<number, GroupSummary>();
  if (eventIds.length === 0) return summaries;

  const placeholders = eventIds.map(() => "?").join(", ");
  const rows = await getDb()
    .prepare(
      `SELECT g.event_id AS event_id,
              COUNT(DISTINCT g.id) AS groups,
              COUNT(m.id) AS people,
              MAX(per_group.n) AS largest
       FROM event_groups g
       LEFT JOIN event_group_members m ON m.group_id = g.id
       LEFT JOIN (
         SELECT group_id, COUNT(*) AS n FROM event_group_members GROUP BY group_id
       ) per_group ON per_group.group_id = g.id
       WHERE g.event_id IN (${placeholders})
       GROUP BY g.event_id`
    )
    .all<{ event_id: number; groups: number; people: number; largest: number }>(...eventIds);

  for (const row of rows) {
    summaries.set(row.event_id, {
      groups: Number(row.groups ?? 0),
      people: Number(row.people ?? 0),
      largest: Number(row.largest ?? 0),
    });
  }
  return summaries;
}

/** The groups a traveller is part of, for /you and /trips. */
export async function getGroupsForTraveller(
  travellerId: number
): Promise<Array<EventGroup & { event_title: string; starts_at: string; people: number }>> {
  return getDb()
    .prepare(
      `SELECT g.*, e.title AS event_title, e.starts_at AS starts_at, COUNT(m2.id) AS people
       FROM event_group_members m
       JOIN event_groups g ON g.id = m.group_id
       JOIN events e ON e.id = g.event_id
       LEFT JOIN event_group_members m2 ON m2.group_id = g.id
       WHERE m.traveller_id = ?
       GROUP BY g.id
       ORDER BY e.starts_at ASC`
    )
    .all<EventGroup & { event_title: string; starts_at: string; people: number }>(travellerId);
}
