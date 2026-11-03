import { getDb } from "./db";
import { addDays, todayISO } from "./time";

/**
 * Tonight deals.
 *
 * A hostel's worst number is beds empty tonight: the room is already paid for,
 * staffed and cleaned, so a bed sold at €15 at 18:00 is €15 that did not exist.
 * The desk already posts events from `/post` in about a minute; this is the
 * other half of the same screen — "2 beds, €18, until 23:00".
 *
 * It is a price for tonight and nothing else:
 *  - it shows in the city feed for that day only, and stops showing when the
 *    day ends or the desk closes it;
 *  - a booking that checks in today gets that price for the first night, and
 *    the room's own price for any night after it;
 *  - it is never a commission, a discount code or a race to the bottom: the
 *    desk sets the number, and the receipt shows what it sold.
 */

export type TonightDeal = {
  id: number;
  hostel_id: number;
  day: string;
  beds: number;
  price_cents: number;
  until_time: string;
  note: string | null;
  status: string;
  created_at: string;
};

export type DealWithHostel = TonightDeal & {
  hostel_name: string;
  hostel_slug: string;
  hostel_area: string;
};

export async function createDeal(input: {
  hostelId: number;
  createdBy: number | null;
  beds: number;
  priceCents: number;
  untilTime: string;
  note: string;
}): Promise<number> {
  const db = getDb();
  // One open deal per hostel per day: posting again replaces the number rather
  // than stacking, which is what a desk actually wants ("two left, €15 now").
  await db
    .prepare("UPDATE tonight_deals SET status = 'closed' WHERE hostel_id = ? AND day = ? AND status = 'open'")
    .run(input.hostelId, todayISO());

  const info = await db
    .prepare(
      `INSERT INTO tonight_deals (hostel_id, day, beds, price_cents, until_time, note, status, created_by, created_at)
       VALUES (@hostelId, @day, @beds, @price, @until, @note, 'open', @by, datetime('now'))`
    )
    .run({
      hostelId: input.hostelId,
      day: todayISO(),
      beds: Math.min(Math.max(Math.trunc(input.beds), 1), 200),
      price: Math.max(0, Math.trunc(input.priceCents)),
      until: /^([01]\d|2[0-3]):[0-5]\d$/.test(input.untilTime) ? input.untilTime : "23:00",
      note: input.note.slice(0, 120) || null,
      by: input.createdBy,
    });
  return Number(info.lastInsertRowid);
}

export async function closeDeal(hostelId: number, dealId: number): Promise<boolean> {
  const result = await getDb()
    .prepare("UPDATE tonight_deals SET status = 'closed' WHERE id = ? AND hostel_id = ? AND status = 'open'")
    .run(dealId, hostelId);
  return Number(result.changes ?? 0) > 0;
}

export async function getOpenDealForHostel(hostelId: number, day = todayISO()): Promise<TonightDeal | null> {
  return (
    (await getDb()
      .prepare("SELECT * FROM tonight_deals WHERE hostel_id = ? AND day = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
      .get<TonightDeal>(hostelId, day)) ?? null
  );
}

/** Everything open tonight in one city, for the feed strip and the city page. */
export async function getTonightDeals(city: string, day = todayISO()): Promise<DealWithHostel[]> {
  return getDb()
    .prepare(
      `SELECT d.*, h.name AS hostel_name, h.slug AS hostel_slug, h.area AS hostel_area
       FROM tonight_deals d JOIN hostels h ON h.id = d.hostel_id
       WHERE d.day = @day AND d.status = 'open' AND h.status = 'active' AND lower(h.city) = lower(@city)
       ORDER BY d.price_cents ASC, d.id ASC`
    )
    .all<DealWithHostel>({ day, city });
}

/** What a booking that starts today should charge for its first night. */
export async function dealPriceForTonight(hostelId: number): Promise<number | null> {
  const deal = await getOpenDealForHostel(hostelId);
  return deal ? deal.price_cents : null;
}

/** The window a deal is good for, as dates a booking form understands. */
export function dealNight(): { in: string; out: string } {
  const today = todayISO();
  return { in: today, out: addDays(today, 1) };
}
