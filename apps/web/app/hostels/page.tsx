import Link from "next/link";
import { demoLoginEnabled } from "@/lib/flags";
import { getAllHostels, getLiveCities } from "@/lib/queries";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "For hostels — what the front desk gets",
  description:
    "Away is not another listing site. Post tonight in a minute, print a QR for reception that counts scans and joins, see who is arriving, and answer your guests in one place.",
};

export default async function ForHostelsPage() {
  const hostels = await getAllHostels();
  const cities = await getLiveCities();
  const cityNames = cities.map((c) => c.name);

  return (
    <div style={{ maxWidth: 720 }}>
      <header className="page-head">
        <div className="eyebrow">For hostels · {cityNames.join(", ") || "opening"}</div>
        <h1 className="page-title">What your front desk gets</h1>
        <p className="page-sub">
          Away is not another listing site taking a cut of a bed you already sold. It is the board
          behind reception: what&apos;s on tonight, who is in the building, and a QR code that tells
          you whether any of it worked.
        </p>
        <div className="cta-row">
          <Link href="/partner" className="btn primary">
            Put your hostel on the map
          </Link>
          <Link href="/pricing" className="btn">
            Pricing
          </Link>
          <Link href="/login?next=/hostel-admin" className="btn">
            Look inside a portal
          </Link>
        </div>
      </header>

      <h2 className="feed-head">Four things you do not have today</h2>

      <div className="stack-links">
        <div className="panel">
          <div className="panel-head">1 · Tonight, in a minute</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            A family dinner, a pub crawl, a walking tour. Pick a template, change the time, publish
            — it lands in every guest&apos;s feed ordered by how long the walk is from your door. Guests
            press <b>going</b>, so at 19:00 you know whether to cook for eight or eighteen. No
            photographer, no poster designer, no account manager.
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
            <Link href="/login?next=/post" style={{ textDecoration: "underline" }}>
              The composer
            </Link>{" "}
            works on the phone behind the desk — sign in as a hostel to see it.
          </p>
        </div>

        <div className="panel">
          <div className="panel-head">2 · A reception QR that counts</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            The partner kit prints an A4 poster for the door with a QR that opens <em>your</em> page.
            You then see the two numbers nobody in this industry shows a hostel: how many people
            scanned it, and how many of them joined. That is the difference between &ldquo;we put a
            poster up&rdquo; and &ldquo;eleven guests came to the quiz&rdquo;.
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
            Printable poster and QR in{" "}
            <Link href="/partner" style={{ textDecoration: "underline" }}>
              the partner kit
            </Link>{" "}
            once your hostel is on the map.
          </p>
        </div>

        <div className="panel">
          <div className="panel-head">3 · The building&apos;s conversation</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            Guests ask &ldquo;is the kitchen still open?&rdquo; under tonight&apos;s event instead of at
            your desk at midnight. You answer once and everyone reads it. Anything ugly gets reported
            and lands in your portal in one tap — hidden from the chat without a public argument.
          </p>
        </div>

        <div className="panel">
          <div className="panel-head">4 · Who is arriving, without the spreadsheet</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            The portal lists today&apos;s arrivals: name, nights, what they booked and what it cost.
            It is not a PMS and it is not trying to be — it is the part of the morning that otherwise
            lives in three tabs and a piece of paper.
          </p>
        </div>
      </div>

      <h2 className="feed-head">A day with Away</h2>
      <div className="runbook">
        <div className="run-step">
          <span className="run-when">07:30</span>
          <span className="run-what">
            <b>Check the arrivals</b>
            <span>Six beds turning over. Names, nights, what they paid — one screen.</span>
          </span>
        </div>
        <div className="run-step">
          <span className="run-when">14:00</span>
          <span className="run-what">
            <b>Post tonight</b>
            <span>Two minutes on the phone behind the desk, from a template.</span>
          </span>
        </div>
        <div className="run-step">
          <span className="run-when">19:30</span>
          <span className="run-what">
            <b>Point at the poster, or the screen</b>
            <span>
              &ldquo;Quiz&apos;s at nine, scan that.&rdquo; The poster prints; the reception screen is
              the same thing, live, on the tablet behind the desk.
            </span>
          </span>
        </div>
        <div className="run-step">
          <span className="run-when">23:00</span>
          <span className="run-what">
            <b>See if it worked</b>
            <span>Scans → joins → who actually said they were coming.</span>
          </span>
        </div>
      </div>

      <h2 className="feed-head">What it costs, and what it does not do</h2>
      <div className="panel">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
          <li>
            <b>No commission, no card on file.</b> Away does not take a cut of a bed. The booking
            flow you can see on a hostel page runs in sandbox mode — it is a demonstration until you
            connect a processor yourself.
          </li>
          <li>
            <b>Your week reaches people before they land.</b> Everyone with a stay booked at your
            hostel gets one email a few days out — what&apos;s on while they&apos;re there, walking
            distance from the bed they booked. It is Away&apos;s email, sent once per stay, and your
            guests&apos; addresses stay with them; nobody is building a mailing list out of your
            building.
          </li>
          <li>
            <b>Free to be here, €19 to see what worked.</b> Listing, posting, the QR kit and the chat
            are free and stay free. Pro is €19 a month — the reception screen and the weekly receipt —
            and{" "}
            <Link href="/pricing" style={{ textDecoration: "underline" }}>
              the whole price list is one page
            </Link>
            .
          </li>
          <li>
            <b>It is not a channel manager.</b> Inventory, rates and stays stay in whatever system
            you already run. Away reads none of it and writes none of it.
          </li>
        </ul>
      </div>

      <h2 className="feed-head">Start in three steps</h2>
      <div className="stack-links">
        <div className="run-step">
          <span className="run-when">today</span>
          <span className="run-what">
            <b>Claim the hostel</b>
            <span>Name, neighbourhood, beds, price, who we talk to. Two minutes.</span>
          </span>
          <Link href="/partner" className="btn">
            Claim
          </Link>
        </div>
        <div className="run-step">
          <span className="run-when">tonight</span>
          <span className="run-what">
            <b>Post one thing</b>
            <span>It does not have to be good. It has to exist tonight.</span>
          </span>
          <Link href="/login?next=/post" className="btn">
            Post
          </Link>
        </div>
        <div className="run-step">
          <span className="run-when">tomorrow</span>
          <span className="run-what">
            <b>Print the QR</b>
            <span>A4, at the door and at the desk. Then watch the scan count.</span>
          </span>
          <Link href="/login?next=/hostel-admin/kit" className="btn">
            Kit
          </Link>
        </div>
      </div>

      {demoLoginEnabled() ? (
        <div className="notice" role="status" style={{ marginTop: 20 }}>
          <span aria-hidden="true">🔑</span>
          <span>
            <b>Look before you sign up.</b> The portal is a real one: sign in as{" "}
            <code>ana@homelisbon.pt</code> with <code>away1234</code> — the front desk at Home Lisbon
            Hostel — from the{" "}
            <Link href="/login?next=/hostel-admin" style={{ textDecoration: "underline" }}>
              login page
            </Link>
            . It shows the arrivals, tonight&apos;s event, the chat and the scan count of a hostel in
            this city.
          </span>
        </div>
      ) : null}

      <h2 className="feed-head">Bringing your city</h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
        A city goes live here one hostel at a time: it needs {plural(3, "hostel")} posting for a week
        before travellers have a reason to open it twice, and{" "}
        <Link href="/partner" style={{ textDecoration: "underline" }}>
          the first hostel in a city is the one that gets named on every poster
        </Link>
        . {hostels.length} {hostels.length === 1 ? "hostel is" : "hostels are"} on the map across{" "}
        {plural(cities.length, "city", "cities")} today.
      </p>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--muted)" }}>
        Running one that is not listed at all? Pick &ldquo;my city isn&apos;t listed&rdquo; on the{" "}
        <Link href="/partner" style={{ textDecoration: "underline" }}>
          signup form
        </Link>{" "}
        and type the city — it joins the pipeline immediately, with you as its first hostel. Nothing
        goes public until the bar is met, so there is no empty page with your name on it.
      </p>
    </div>
  );
}
