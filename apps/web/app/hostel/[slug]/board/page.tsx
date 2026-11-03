import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { BoardClock } from "@/components/board-clock";
import { getCityEvents, getHostelBySlug } from "@/lib/queries";
import { getGroupSummaries } from "@/lib/groups";
import { isPro } from "@/lib/plans";
import { appUrl } from "@/lib/constants";
import { addDays, formatDay, timeOf, todayISO } from "@/lib/time";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/**
 * The screen behind reception.
 *
 * A poster is printed once and dies. This is the same information on the TV or
 * tablet the hostel already has behind the desk, live: tonight, its own nights
 * first, everyone else's after, and the QR that gets a guest onto the feed. It
 * exists because the desk's answer to "what's on tonight?" should not depend on
 * which of the three staff members is on shift.
 *
 * Public on purpose — a screen in a lobby cannot sign in — and it only shows
 * what a stranger could already read on the city's public page.
 */
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const hostel = await getHostelBySlug(slug);
  return {
    title: `${hostel?.name ?? "Hostel"} · tonight`,
    robots: { index: false },
  };
}

export default async function BoardPage({ params }: Props) {
  const { slug } = await params;
  const hostel = await getHostelBySlug(slug);
  if (!hostel || hostel.status !== "active") notFound();
  if (!isPro(hostel)) return <BoardLocked hostel={hostel} />;

  const today = todayISO();
  const tonight = await getCityEvents(hostel.city, today, addDays(today, 1), null);
  const ours = tonight.filter((e) => e.hostel_id === hostel.id);
  const rest = tonight
    .filter((e) => e.hostel_id !== hostel.id)
    .sort((a, b) => a.walk_minutes - b.walk_minutes);

  // The desk does not care how many people tapped "join"; it cares how many are
  // walking through the door together. A group of five at 19:30 is a decision
  // about how much curry to cook.
  const summaries = await getGroupSummaries(tonight.map((event) => event.id));

  const qr = await QRCode.toString(`${appUrl()}/stay/${hostel.slug}`, {
    type: "svg",
    margin: 0,
    width: 240,
    color: { dark: "#ffffff", light: "#000000" },
  });

  return (
    <div className="board">
      <BoardClock />

      <header className="board-head">
        <div className="board-hostel">{hostel.name}</div>
        <div className="board-kicker">
          tonight in {hostel.area} · {formatDay(today)}
        </div>
      </header>

      <div className="board-body">
        <div className="board-list">
          {tonight.length === 0 ? (
            <div className="board-empty">
              Nothing on in the building or the block tonight.
              <br />
              Scan, and put something on — it takes a minute.
            </div>
          ) : (
            <>
              {ours.length > 0 ? <div className="board-label">Here, tonight</div> : null}
              {ours.map((event) => (
                <div key={event.id} className="board-row mine">
                  <span className="board-time">{timeOf(event.starts_at)}</span>
                  <span className="board-title">{event.title}</span>
                  <span className="board-going">
                    {summaries.get(event.id)?.people
                      ? `${summaries.get(event.id)!.people} in a group${summaries.get(event.id)!.groups > 1 ? ` of ${summaries.get(event.id)!.groups}` : ""} · `
                      : ""}
                    {event.going} going
                  </span>
                </div>
              ))}
              {rest.length > 0 ? <div className="board-label">Walking distance</div> : null}
              {rest.slice(0, ours.length > 0 ? 4 : 6).map((event) => (
                <div key={event.id} className="board-row">
                  <span className="board-time">{timeOf(event.starts_at)}</span>
                  <span className="board-title">{event.title}</span>
                  <span className="board-meta">
                    {event.walk_minutes === 0 ? "here" : `${event.walk_minutes} min`}
                    {summaries.get(event.id)?.people
                      ? ` · group of ${summaries.get(event.id)!.largest}`
                      : ""}
                    {event.going > 0 ? ` · ${event.going} going` : ""}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        <aside className="board-qr">
          <div
            className="board-qr-code"
            dangerouslySetInnerHTML={{ __html: qr }}
            aria-hidden="true"
          />
          <div className="board-qr-copy">Scan to join in</div>
          <div className="board-qr-url">away · {hostel.area}</div>
        </aside>
      </div>

      <footer className="board-foot">
        <span>Tonight&apos;s plan, though the week is longer —</span>
        <Link href={`/c/${hostel.city}`} className="board-link">
          everything on in {hostel.city} →
        </Link>
      </footer>
    </div>
  );
}

/**
 * It is a screen in a lobby, so "sign in to upgrade" is the wrong answer: this
 * has to explain itself to whoever walks past it. The hostel's own staff get the
 * button; a guest reading the tablet gets a sentence and the price.
 */
function BoardLocked({ hostel }: { hostel: { name: string; slug: string } }) {
  return (
    <div className="board">
      <header className="board-head">
        <div className="board-hostel">{hostel.name}</div>
        <div className="board-kicker">the reception screen</div>
      </header>
      <div className="board-body">
        <div className="board-list">
          <div className="board-empty">
            Tonight&apos;s plan, live on this screen, is part of Away Pro — €19 a month.
            <br />
            <span style={{ fontSize: 15, color: "#8d7d72" }}>
              Poster, QR and posting tonight are free, and always will be.
            </span>
          </div>
        </div>
        <aside className="board-qr">
          <Link href="/pricing" className="btn primary" style={{ width: 240, textAlign: "center" }}>
            See what Pro is
          </Link>
          <Link href={`/hostel/${hostel.slug}`} className="board-link" style={{ fontSize: 12 }}>
            the guest view of this hostel →
          </Link>
        </aside>
      </div>
    </div>
  );
}
