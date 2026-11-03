import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { PostForm } from "@/components/post-form";
import { requireActiveStaff } from "@/lib/auth";
import { getHostelPosts, getHostels, getTravellerCount } from "@/lib/queries";
import { getOpenDealForHostel } from "@/lib/deals";
import { closeDealAction, createDealAction } from "@/app/actions/deals";
import { formatPrice } from "@/lib/format";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Post tonight" };

const DEAL_NOTES: Record<string, string> = {
  posted: "Posted. It is in the feed for tonight, and the price applies to a booking that checks in today.",
  closed: "Closed. It stops showing in the feed immediately, and the price goes back to the room's.",
  check: "That price or number of beds did not make sense — try again.",
  staff: "Only an approved hostel can post a bed for tonight.",
};

export default async function PostPage({ searchParams }: { searchParams: Promise<{ deal?: string }> }) {
  const { deal: dealFlag } = await searchParams;
  const user = await requireActiveStaff("/post");
  const hostels = await getHostels();
  const hostel = (user.hostel_id ? hostels.find((h) => h.id === user.hostel_id) : hostels[0])!;
  // The audience promise is made per city, not per database.
  const cityHostels = await getHostels(hostel.city);
  const posts = await getHostelPosts(hostel.id, 4, user.id);
  const audience = await getTravellerCount();
  const deal = await getOpenDealForHostel(hostel.id);

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Hostel mode · {hostel.name}</div>
        <h1 className="page-title">Post tonight</h1>
        <p className="page-sub">
          Goes live to {plural(audience, "traveller")} across {plural(cityHostels.length, "hostel")} in{" "}
          {hostel.city}. It takes about a minute — and it fills your bar.
        </p>
      </header>

      {dealFlag && DEAL_NOTES[dealFlag] ? (
        <div className={dealFlag === "check" ? "notice warn" : "notice"} role="status" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">{dealFlag === "check" ? "!" : "✓"}</span>
          <span>{DEAL_NOTES[dealFlag]}</span>
        </div>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <PostForm audience={audience} hostels={cityHostels.length} />
      </div>

      {/* ------------------------------------------------ a bed, not an event */}
      <section style={{ marginTop: 34, maxWidth: 560 }}>
        <div className="day">
          <h2>Beds free tonight?</h2>
          <span>the other half of the same minute</span>
        </div>

        {deal ? (
          <div className="notice" role="status" style={{ alignItems: "center", marginBottom: 12 }}>
            <span aria-hidden="true">🛏</span>
            <span style={{ flex: 1 }}>
              <b>
                Live: {plural(deal.beds, "bed")} at {formatPrice(deal.price_cents)} until {deal.until_time}.
              </b>{" "}
              In the feed now. Posting again replaces this number.
            </span>
            <form action={closeDealAction}>
              <input type="hidden" name="dealId" value={deal.id} />
              <button type="submit" className="btn small">
                Close it
              </button>
            </form>
          </div>
        ) : null}

        <form action={createDealAction} className="form-wrap">
          <div className="twocol">
            <div className="field">
              <label htmlFor="deal-beds">Beds left</label>
              <input id="deal-beds" name="beds" type="number" min={1} max={200} defaultValue={deal?.beds ?? 2} required />
            </div>
            <div className="field">
              <label htmlFor="deal-price">Price a bed (€)</label>
              <input
                id="deal-price"
                name="price"
                type="number"
                min={0}
                max={500}
                step="1"
                defaultValue={deal ? Math.round(deal.price_cents / 100) : Math.max(0, Math.round(hostel.price_from_cents / 100) - 5)}
                required
              />
            </div>
          </div>
          <div className="twocol">
            <div className="field">
              <label htmlFor="deal-until">Good until</label>
              <input id="deal-until" name="until" type="time" defaultValue={deal?.until_time ?? "23:00"} required />
            </div>
            <div className="field">
              <label htmlFor="deal-note">One line (optional)</label>
              <input id="deal-note" name="note" maxLength={120} placeholder="Walk in and ask for Away" />
            </div>
          </div>
          <button type="submit" className="btn" style={{ marginTop: 12 }}>
            Put it in the feed
          </button>
          <p style={{ fontSize: 11.5, color: "#8b7d72", margin: "10px 0 0", lineHeight: 1.6 }}>
            Shows in {hostel.city} for today only, with the number of beds and your price. A booking that
            starts today is charged that price for the first night and your room price after it. No
            commission, no promo code, and it disappears at midnight whether you close it or not.
          </p>
        </form>
      </section>

      <section style={{ marginTop: 34, maxWidth: 560 }}>
        <div className="panel-head">Posted from this hostel</div>
        {posts.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "#8b7d72" }}>
            Nothing posted yet. Your first one appears here the moment you publish.
          </p>
        ) : (
          posts.map((e) => <EventCard key={e.id} event={e} />)
        )}
        <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 16, lineHeight: 1.6 }}>
          Posting is restricted to signed-in hostel staff, and scoped to their own hostel.{" "}
          <Link href="/hostel-admin" style={{ textDecoration: "underline" }}>
            Back to the portal
          </Link>
          .
        </p>
      </section>
    </>
  );
}
