import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { PrintButton } from "@/components/print-button";
import { requireStaff, isStaff } from "@/lib/auth";
import { appUrl } from "@/lib/constants";
import { getCity, getHostelBySlug, getPartnerStats } from "@/lib/queries";
import { formatPrice, plural } from "@/lib/format";
import { KIT_LANGUAGES, kitCopy, kitLanguageFrom } from "@/lib/kit-copy";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const hostel = await getHostelBySlug(slug);
  return { title: `${hostel?.name ?? "Hostel"} · partner kit` };
}

/**
 * The bit a hostel actually has to do.
 *
 * A partner says yes, then somebody at the front desk has to make the thing
 * real. This page is the whole kit: one QR, a poster for reception, a sticker
 * for the dorm door, three lines to say at check-in, and the numbers that prove
 * it worked.
 */
export default async function PartnerKitPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { lang } = await searchParams;
  const hostel = await getHostelBySlug(slug);
  if (!hostel) notFound();

  const user = await requireStaff(`/hostel/${hostel.slug}/kit`);
  if (!isStaff(user)) redirect("/?denied=staff");
  // Staff can only see their own hostel's kit; ops can see any.
  if (user.role !== "admin" && user.hostel_id !== hostel.id) redirect("/?denied=staff");
  // A QR code for a hostel that isn't on the map yet sends guests nowhere.
  if (hostel.status !== "active" && user.role !== "admin") redirect("/partner?pending=1");

  // A kit is printed once and stays on a wall in a city that may not speak
  // English: the poster, the sticker and the check-in lines come in the
  // languages a Lisbon front desk actually hears. The phone's own preference
  // wins first, and `?lang=pt` pins one for a hostel that asks for it.
  // A city slug is not a name: "sines" on a poster is a typo with a QR code.
  const city = await getCity(hostel.city);
  const cityName = city?.name ?? hostel.city;
  const detected = kitLanguageFrom((await headers()).get("accept-language"));
  const chosen = kitCopy(lang ?? detected);
  const copy = chosen;

  const base = appUrl();
  const stayUrl = `${base}/stay/${hostel.slug}`;
  const qr = await QRCode.toString(stayUrl, {
    type: "svg",
    margin: 0,
    width: 220,
    color: { dark: "#191310", light: "#ffffff" },
  });

  const stats = await getPartnerStats(hostel.id);
  const joinRate = stats.opens > 0 ? Math.round((stats.joins / stats.opens) * 100) : 0;

  return (
    <>
      <Link href="/hostel-admin" className="back no-print">
        ← Back to the portal
      </Link>

      <header className="page-head no-print">
        <div className="eyebrow">Hostel mode · {hostel.area}</div>
        <h1 className="page-title">Partner kit</h1>
        <p className="page-sub">
          One link, one code, and about four minutes at the front desk. Everything on this page
          prints — the poster, the sticker and the check-in lines.
        </p>
        <div className="cta-row">
          <PrintButton label="Print the kit" />
          <Link href={`/hostel/${hostel.slug}`} className="btn">
            Guest view of your page
          </Link>
          <Link href={`/hostel/${hostel.slug}/board`} className="btn">
            Reception screen
          </Link>
        </div>
        <p style={{ fontSize: 12, color: "#8b7d72", marginTop: 10, lineHeight: 1.6 }}>
          The <Link href={`/hostel/${hostel.slug}/board`} style={{ textDecoration: "underline" }}>
            reception screen
          </Link>{" "}
          is the same information as the poster, live — open it on the tablet or TV behind the desk
          and leave it there. It refreshes itself every minute.
        </p>
      </header>

      <div className="stat-row no-print">
        <div className="stat">
          <b>{stats.opens}</b>
          <span>SCANS · {stats.days} DAYS</span>
        </div>
        <div className="stat">
          <b>{stats.joins}</b>
          <span>JOINED SOMETHING</span>
        </div>
        <div className="stat">
          <b>{stats.bookings}</b>
          <span>BEDS BOOKED</span>
        </div>
        <div className="stat">
          <b>{formatPrice(stats.revenue)}</b>
          <span>BOOKING VALUE</span>
        </div>
        <div className="stat">
          <b>{joinRate}%</b>
          <span>SCAN → JOIN</span>
        </div>
      </div>

      <section className="no-print" style={{ marginTop: 24 }}>
        <div className="day">
          <h2>What a scan means</h2>
          <span>your guests, not the city&apos;s</span>
        </div>
        <p style={{ fontSize: 12.5, color: "#7b6e64", lineHeight: 1.65, margin: "0 2px" }}>
          {stats.opens === 0
            ? "Nobody has scanned yet. Put the poster up and the first one usually lands the same evening."
            : `${plural(stats.people, "guest")} from ${hostel.name} have scanned into Away in the last ${stats.days} days. ${stats.joins} of them joined a night, and ${stats.bookings} went on to book a bed here. That is the whole argument: your own reception, sending people into the thing you are already running.`}
        </p>
      </section>

      {/* ---------------------------------------------------- the language */}
      <section className="no-print" style={{ marginTop: 26 }} data-print-skip>
        <div className="day">
          <h2>Print it in their language</h2>
          <span>the poster, the sticker and the three lines</span>
        </div>
        <div className="cta-row">
          {KIT_LANGUAGES.map((code) => {
            const target = `/hostel/${hostel.slug}/kit?lang=${code}`;
            const active = chosen.tag === code;
            return (
              <Link
                key={code}
                href={target}
                className={active ? "btn primary" : "btn"}
                aria-current={active ? "true" : undefined}
                style={{ fontSize: 13 }}
              >
                {kitCopy(code).label}
              </Link>
            );
          })}
        </div>
        <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 10, lineHeight: 1.6 }}>
          It picked {kitCopy(detected).label} from this browser. The code is the same in every
          language, so a hostel on a street with four front desks can print all of them and tape up
          whichever is true that week.
        </p>
      </section>

      {/* ------------------------------------------------ printable poster */}
      <section style={{ marginTop: 30 }}>
        <div className="day no-print">
          <h2>1 · Reception poster</h2>
          <span>A4 · tape it next to the check-in screen</span>
        </div>

        <div className="poster" lang={chosen.tag}>
          <div className="poster-mark">◉</div>
          <p className="poster-kicker">{hostel.area.toUpperCase()} · {hostel.city.toUpperCase()}</p>
          <h2 className="poster-title">
            {chosen.poster.title1}
            <br />
            {chosen.poster.title2}
          </h2>
          <p className="poster-body">{chosen.poster.body}</p>

          <div className="poster-qr">
            <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="poster-qr-copy">
              <b>{chosen.poster.qrTitle}</b>
              <span>{chosen.poster.qrBody}</span>
              <span className="poster-url">{stayUrl.replace(/^https?:\/\//, "")}</span>
            </div>
          </div>

          <p className="poster-foot">
            {chosen.poster.foot} · {hostel.name}
          </p>
        </div>
      </section>

      {/* -------------------------------------------------- dorm sticker */}
      <section style={{ marginTop: 30 }}>
        <div className="day no-print">
          <h2>2 · Dorm-door sticker</h2>
          <span>Cut in half · one per door</span>
        </div>

        <div className="sticker" lang={chosen.tag}>
          <div className="sticker-copy">
            <b>{chosen.sticker.title}</b>
            <span>{chosen.sticker.body(cityName)}</span>
          </div>
          <div className="qr small" dangerouslySetInnerHTML={{ __html: qr }} />
        </div>
      </section>

      {/* ------------------------------------------------- check-in lines */}
      <section style={{ marginTop: 30 }}>
        <div className="day no-print">
          <h2>3 · Three lines at check-in</h2>
          <span>say them in this order</span>
        </div>

        <div className="admin-list">
          {[
            {
              line: chosen.checkIn[0],
              why: "Point at the QR. It is a gift, not a download request: no app, no account to read it.",
            },
            {
              line: chosen.checkIn[1],
              why: "Name one thing that is yours. It makes the feed feel like the hostel's, not an advert.",
            },
            {
              line: chosen.checkIn[2],
              why: "The reason they keep the tab open after they leave you — and why they come back to book.",
            },
          ].map((item, i) => (
            <div key={item.line} className="admin-row">
              <div className="admin-main">
                <b>{item.line}</b>
                <span>{item.why}</span>
              </div>
              <div className="admin-actions">
                <span className="status muted">{i + 1}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="no-print" style={{ marginTop: 30 }}>
        <div className="day">
          <h2>Where to put it</h2>
          <span>four places, in order of return</span>
        </div>
        <div className="admin-list">
          {[
            ["Reception, at eye height", "Every single guest passes it. This is 80% of the scans."],
            ["Dorm door, inside", "The 22:00 “what are we doing” moment happens here, not downstairs."],
            ["The bar or kitchen", "Where the group chat forms. Put it where people already stand around."],
            ["Check-in email / WhatsApp", "The link, not the code: /stay/" + hostel.slug],
          ].map(([where, why]) => (
            <div key={where} className="admin-row">
              <div className="admin-main">
                <b>{where}</b>
                <span>{why}</span>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 14, lineHeight: 1.6 }}>
          The code is the same everywhere and never expires, so reprint whenever. Scan counts and
          bookings update on this page and in the portal.
        </p>
      </section>
    </>
  );
}
