import Link from "next/link";
import { applyPartnerAction } from "@/app/actions/partner";
import { logoutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { CITY_STATUS } from "@/lib/cities";
import { getAllHostels, getCities } from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Put your hostel on Away",
  description:
    "Post tonight's event in about a minute, get a printable QR for reception, and see exactly how many of your guests used it.",
};

const ERRORS: Record<string, string> = {
  name: "Give the hostel its name.",
  city: "Pick the city the hostel is in.",
  area: "Which neighbourhood is it in? Travellers filter by walkable areas.",
  description: "Write at least a sentence — this is the text travellers read on your page.",
  beds: "How many beds? A number between 1 and 2,000.",
  price: "Starting price per bed, in euros (0 if you don't take bookings here).",
  contact: "Who are we talking to?",
  email: "That email doesn't look right.",
  password: "Use at least 8 characters for the password.",
  "signed-in":
    "You're signed in as a traveller. Sign out below first — an account can be a traveller or hostel staff, not both.",
};

function Notice({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <div className={tone === "warn" ? "notice warn" : "notice"} role={tone === "warn" ? "alert" : "status"}>
      <span aria-hidden="true">{tone === "warn" ? "⚠️" : "✓"}</span>
      <span>{children}</span>
    </div>
  );
}

export default async function PartnerPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; pending?: string; error?: string }>;
}) {
  const { submitted, pending, error } = await searchParams;
  const user = await getCurrentUser();
  const cities = getCities();
  const myHostel = user?.hostel_id
    ? getAllHostels().find((h) => h.id === user.hostel_id) ?? null
    : null;

  const errorMessage = error
    ? ERRORS[error] ?? (error.length > 40 ? decodeURIComponent(error) : "Something wasn't right. Try again.")
    : null;

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Hostel mode · partner signup</div>
        <h1 className="page-title">Put your hostel on the map</h1>
        <p className="page-sub">
          Your nights at the top of a feed your guests already open. Free, no contract, and about a
          minute a night from the phone at the desk.
        </p>
      </header>

      {errorMessage ? <Notice tone="warn">{errorMessage}</Notice> : null}
      {submitted ? (
        <Notice tone="ok">
          <b>Application received.</b> It&apos;s in front of a human now — usually within two working
          days. You can sign in any time to check.
        </Notice>
      ) : null}
      {pending && !submitted ? (
        <Notice tone="warn">
          That area is for approved hostels. Your application is{" "}
          <Link href="/partner" style={{ textDecoration: "underline" }}>
            still in review
          </Link>
          .
        </Notice>
      ) : null}

      {/* --------------------------------------------- signed in as hosteller */}
      {user && myHostel ? (
        <>
          <section className="panel" style={{ marginTop: 20, maxWidth: 620 }}>
            <div className="panel-head">Your application</div>
            <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 10px" }}>
              <b>{myHostel.name}</b> · {myHostel.area}, {myHostel.city} ·{" "}
              {plural(myHostel.beds, "bed")} · from €{(myHostel.price_from_cents / 100).toFixed(0)}
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "#7b6e64", margin: 0 }}>
              Applied {myHostel.applied_at ? formatDay(myHostel.applied_at.slice(0, 10)) : "just now"} ·{" "}
              <span className={`status ${myHostel.status === "active" ? "ok" : myHostel.status === "pending" ? "warn" : "muted"}`}>
                {myHostel.status}
              </span>
            </p>

            {myHostel.status === "pending" ? (
              <>
                <ol style={{ fontSize: 12.5, lineHeight: 1.7, color: "#4a403a", paddingLeft: 18, marginTop: 14 }}>
                  <li>We check the city has enough partners to be worth opening — or that you&apos;re the one who tips it over.</li>
                  <li>You&apos;re approved and your page goes live with a bookable dorm.</li>
                  <li>You print the reception kit and post tonight, from the desk.</li>
                </ol>
                <p style={{ fontSize: 11.5, color: "#8b7d72", margin: "10px 0 0", lineHeight: 1.6 }}>
                  Questions meanwhile: reply to the address on your application email
                  {myHostel.contact_email ? ` (${myHostel.contact_email})` : ""}.
                </p>
              </>
            ) : null}

            {myHostel.status === "active" ? (
              <div className="cta-row">
                <Link href="/post" className="btn primary" style={{ flex: "0 0 auto" }}>
                  Post tonight
                </Link>
                <Link href={`/hostel/${myHostel.slug}/kit`} className="btn">
                  Partner kit
                </Link>
                <Link href="/hostel-admin" className="btn">
                  Portal
                </Link>
              </div>
            ) : null}

            {myHostel.status === "rejected" ? (
              <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "#7b6e64", marginTop: 12 }}>
                We didn&apos;t approve this one. It&apos;s usually timing — we open a city when three
                hostels are in. You&apos;re welcome to apply again once there are others nearby.
              </p>
            ) : null}
          </section>

          <form action={logoutAction} style={{ marginTop: 14 }}>
            <button type="submit" className="btn small">
              Sign out
            </button>
          </form>
        </>
      ) : null}

      {/* ------------------------------------------- signed in as a traveller */}
      {user && !myHostel ? (
        <section className="panel" style={{ marginTop: 20, maxWidth: 620 }}>
          <div className="panel-head">You&apos;re signed in as a traveller</div>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "#7b6e64", margin: "0 0 12px" }}>
            Hostel applications use their own account, so your trips and chats stay yours. Sign out
            and apply with the hostel&apos;s email.
          </p>
          <form action={logoutAction}>
            <button type="submit" className="btn">
              Sign out to apply
            </button>
          </form>
        </section>
      ) : null}

      {/* ------------------------------------------------------------- form */}
      {!user ? (
        <>
          <div className="stat-row" style={{ maxWidth: 640 }}>
            <div className="stat">
              <b>2 min</b>
              <span>TO POST TONIGHT</span>
            </div>
            <div className="stat">
              <b>Free</b>
              <span>NO CONTRACT</span>
            </div>
            <div className="stat">
              <b>QR</b>
              <span>POSTER + STICKER</span>
            </div>
            <div className="stat">
              <b>1 funnel</b>
              <span>SCANS → BEDS</span>
            </div>
          </div>

          <section style={{ marginTop: 26 }}>
            <div className="day">
              <h2>Apply</h2>
              <span>goes to a human, not a queue</span>
            </div>

            <form action={applyPartnerAction} className="form-wrap">
              <div className="twocol">
                <div className="field">
                  <label htmlFor="hostelName">Hostel name</label>
                  <input id="hostelName" name="hostelName" placeholder="Casa do Sol" required maxLength={80} />
                </div>
                <div className="field">
                  <label htmlFor="city">City</label>
                  <select id="city" name="city" required defaultValue="lisbon">
                    {cities.map((city) => (
                      <option key={city.slug} value={city.slug}>
                        {city.name}
                        {city.status === "live" ? " — live" : ` — ${CITY_STATUS[city.status].label.toLowerCase()}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="twocol">
                <div className="field">
                  <label htmlFor="area">Neighbourhood</label>
                  <input id="area" name="area" placeholder="Bairro Alto" required maxLength={60} />
                </div>
                <div className="field">
                  <label htmlFor="beds">Beds</label>
                  <input id="beds" name="beds" type="number" min={1} max={2000} placeholder="48" required />
                </div>
              </div>

              <div className="field">
                <label htmlFor="description">What happens here?</label>
                <textarea
                  id="description"
                  name="description"
                  placeholder="Family dinner every night, a small bar downstairs, rooftop on Fridays."
                  required
                  minLength={40}
                  maxLength={600}
                />
              </div>

              <div className="twocol">
                <div className="field">
                  <label htmlFor="price">Beds from (€ / night)</label>
                  <input id="price" name="price" type="number" min={0} max={500} step="1" placeholder="24" required />
                </div>
                <div className="field">
                  <label htmlFor="contactName">Your name</label>
                  <input id="contactName" name="contactName" placeholder="Rita Alves" required maxLength={60} />
                </div>
              </div>

              <div className="field">
                <label htmlFor="note">Anything we should know? (optional)</label>
                <textarea
                  id="note"
                  name="note"
                  placeholder="We already do a pub crawl with the hostel next door. Happy to help bring the others in."
                  maxLength={400}
                />
              </div>

              <div className="twocol">
                <div className="field">
                  <label htmlFor="email">Work email</label>
                  <input id="email" name="email" type="email" placeholder="rita@casadodosol.pt" required maxLength={160} />
                </div>
                <div className="field">
                  <label htmlFor="password">Password</label>
                  <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
                </div>
              </div>

              <button type="submit" className="publish">
                Apply to join
              </button>

              <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 10, lineHeight: 1.6 }}>
                Free, and no exclusivity — post the same night everywhere else you like. Already have
                an account? <Link href="/login?next=/partner" style={{ textDecoration: "underline" }}>Sign in</Link>.
              </p>
            </form>
          </section>

          <section style={{ marginTop: 32, maxWidth: 640 }}>
            <div className="day">
              <h2>What happens after you apply</h2>
              <span>two working days, usually</span>
            </div>
            <div className="admin-list">
              {[
                ["We look at the city, not just you", "A city opens with three partners posting. If you're the third, it opens faster."],
                ["Your page goes live", "Your description, your area, a bookable dorm and a price — so a traveller who finds you can actually reserve."],
                ["You get the kit", "A printable QR for reception, a dorm sticker, and three lines for check-in."],
              ].map(([title, body]) => (
                <div key={title} className="admin-row">
                  <div className="admin-main">
                    <b>{title}</b>
                    <span>{body}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
