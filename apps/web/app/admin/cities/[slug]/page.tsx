import Link from "next/link";
import { notFound } from "next/navigation";
import {
  setCityStatusAction,
  setLaunchDateAction,
  updateCityRecordAction,
} from "@/app/actions/cities";
import { requireAdmin } from "@/lib/auth";
import { CITY_STATUS, LAUNCH_BAR, launchGates, launchReadiness } from "@/lib/cities";
import { approvePartnerAction, rejectPartnerAction } from "@/app/actions/partners";
import { getCity, getCityApplications, getCityHostels, getCitySupply } from "@/lib/queries";
import { formatDay, formatShortDate, timeOf } from "@/lib/time";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    created?: string;
    blocked?: string;
    moved?: string;
    launch?: string;
    saved?: string;
    approved?: string;
    rejected?: string;
    error?: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: `${(await getCity(slug))?.name ?? "City"} · city console` };
}

export default async function CityConsolePage({ params, searchParams }: Props) {
  const { slug } = await params;
  await requireAdmin(`/admin/cities/${slug}`);
  const { created, blocked, moved, launch, saved, approved, rejected, error } = await searchParams;

  const city = await getCity(slug);
  if (!city) notFound();

  const supply = await getCitySupply(city.slug);
  const gates = launchGates(city, supply);
  const readiness = launchReadiness(gates);
  const hostels = await getCityHostels(city.slug);
  const applications = await getCityApplications(city.slug);
  const status = CITY_STATUS[city.status];
  const blockingGate = blocked ? gates.find((g) => g.key === blocked) : undefined;

  const steps = [
    { when: "Week 0", title: "Name the city, set its centre", done: gates[0].ok, detail: gates[0].have },
    {
      when: "Week 1",
      title: `Sign ${LAUNCH_BAR.partners} partner hostels`,
      done: gates[1].ok,
      detail: `${supply.hostels} of ${LAUNCH_BAR.partners}`,
    },
    {
      when: "Week 2",
      title: "Get each partner to post their week",
      done: gates[2].ok,
      detail: `${supply.postingHostels} of ${LAUNCH_BAR.postingHostels} posting`,
    },
    {
      when: "Week 3",
      title: `Fill the calendar — ${LAUNCH_BAR.events} things in ${LAUNCH_BAR.windowDays} days`,
      done: gates[3].ok,
      detail: `${supply.events} of ${LAUNCH_BAR.events}`,
    },
    {
      when: "Week 4",
      title: "Put the QR on every reception desk",
      done: supply.scans > 0,
      detail: supply.scans ? plural(supply.scans, "scan") : "no scans yet",
    },
    {
      when: "Week 5",
      title: "Go live",
      done: city.status === "live",
      detail: city.launch_on ? formatDay(city.launch_on) : "no date",
    },
  ];

  return (
    <>
      <Link href="/admin/cities" className="back">
        ← All cities
      </Link>

      <header className="page-head">
        <div className="eyebrow">Away ops · {city.country}</div>
        <div className="title-row">
          <h1 className="page-title">
            {city.emoji} {city.name}
          </h1>
          <span className={`status ${status.tone}`} style={{ alignSelf: "center" }}>
            {status.label}
          </span>
        </div>
        <p className="page-sub">{status.blurb}</p>
      </header>

      {created ? (
        <div className="notice" role="status">
          <span aria-hidden="true">✓</span>
          <span>
            <b>City created.</b> It&apos;s in <i>opening</i> — nothing here reaches travellers until
            the bar is met. Next: sign the hostels.
          </span>
        </div>
      ) : null}

      {moved ? (
        <div className="notice" role="status">
          <span aria-hidden="true">✓</span>
          <span>
            <b>{city.name} is now {CITY_STATUS[moved as keyof typeof CITY_STATUS]?.label ?? moved}.</b>{" "}
            {moved === "live"
              ? "It's in the picker, on Explore, in the sitemap, and its public page is live."
              : "It's out of the public surfaces and back in the console."}
          </span>
        </div>
      ) : null}

      {blockingGate ? (
        <div className="notice warn" role="alert">
          <span aria-hidden="true">🔒</span>
          <span>
            <b>Not yet — {blockingGate.label} is {blockingGate.have} of {blockingGate.need}.</b>{" "}
            {blockingGate.hint} The gate is the point: a city that opens half-empty gets opened
            once, by a traveller who never comes back.
          </span>
        </div>
      ) : null}

      {approved ? (
        <div className="notice" role="status">
          <span aria-hidden="true">✓</span>
          <span>
            <b>{approved} is on the map.</b> Approved, added to Explore, and given a bookable dorm —
            their staff account can post from now on.
          </span>
        </div>
      ) : null}

      {rejected ? (
        <div className="notice" role="alert">
          <span aria-hidden="true">✕</span>
          <span>
            <b>{rejected} declined.</b> They keep their account and can see the decision at{" "}
            <code>/partner</code>. Nothing else changes.
          </span>
        </div>
      ) : null}

      {error === "partner" ? (
        <div className="notice warn" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>That application had already been decided.</span>
        </div>
      ) : null}

      {saved ? (
        <div className="notice" role="status">
          <span aria-hidden="true">✓</span>
          <span>
            <b>City record saved.</b> Distances and wall-clock times now measure from the new
            centre.
          </span>
        </div>
      ) : null}

      {launch ? (
        <div className="notice" role="status">
          <span aria-hidden="true">📅</span>
          <span>Launch date set to {formatDay(launch)}.</span>
        </div>
      ) : null}

      {error === "launch" ? (
        <div className="notice warn" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>That launch date doesn&apos;t parse. Use the date picker.</span>
        </div>
      ) : null}

      <div className="stat-row">
        <div className="stat">
          <b>{supply.hostels}</b>
          <span>PARTNER HOSTELS</span>
        </div>
        <div className="stat">
          <b>{supply.postingHostels}</b>
          <span>POSTING</span>
        </div>
        <div className="stat">
          <b>{supply.events}</b>
          <span>EVENTS · {LAUNCH_BAR.windowDays} DAYS</span>
        </div>
        <div className="stat">
          <b>{supply.joins}</b>
          <span>JOINS</span>
        </div>
        <div className="stat">
          <b>{supply.scans}</b>
          <span>QR SCANS · 30D</span>
        </div>
      </div>

      <section style={{ marginTop: 28 }}>
        <div className="day">
          <h2>Launch bar</h2>
          <span>
            {readiness.passed}/{readiness.total} · {readiness.percent}%
          </span>
        </div>

        <div className="meter" aria-hidden="true">
          <i style={{ width: `${readiness.percent}%` }} data-full={readiness.canLaunch} />
        </div>

        <div className="admin-list" style={{ marginTop: 10 }}>
          {gates.map((gate) => (
            <div key={gate.key} className="admin-row">
              <div className="admin-main">
                <b>
                  <span className={gate.ok ? "tick" : "dot"} aria-hidden="true">
                    {gate.ok ? "✓" : "•"}
                  </span>{" "}
                  {gate.label}
                </b>
                <span>{gate.ok ? gate.done : `${gate.have} of ${gate.need} — ${gate.hint}`}</span>
              </div>
              <div className="admin-actions">
                <span className={`status ${gate.ok ? "ok" : "warn"}`}>
                  {gate.ok ? "pass" : "open"}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="cta-row">
          {city.status === "live" ? (
            <>
              <Link href={`/c/${city.slug}`} className="btn" style={{ flex: 1, textAlign: "center" }}>
                Public page
              </Link>
              <form action={setCityStatusAction} style={{ flex: 1 }}>
                <input type="hidden" name="slug" value={city.slug} />
                <input type="hidden" name="to" value="opening" />
                <button type="submit" className="btn" style={{ width: "100%" }}>
                  Pull back to opening
                </button>
              </form>
            </>
          ) : (
            <>
              <form action={setCityStatusAction} style={{ flex: 1 }}>
                <input type="hidden" name="slug" value={city.slug} />
                <input type="hidden" name="to" value="live" />
                <input type="hidden" name="launchOn" value={city.launch_on ?? ""} />
                <button type="submit" className="btn primary" disabled={!readiness.canLaunch}>
                  {readiness.canLaunch ? "Go live" : `Blocked · ${readiness.nextGate}`}
                </button>
              </form>

              {city.status === "planned" ? (
                <form action={setCityStatusAction} style={{ flex: 1 }}>
                  <input type="hidden" name="slug" value={city.slug} />
                  <input type="hidden" name="to" value="opening" />
                  <button type="submit" className="btn" style={{ width: "100%" }}>
                    Start opening
                  </button>
                </form>
              ) : (
                <form action={setCityStatusAction} style={{ flex: 1 }}>
                  <input type="hidden" name="slug" value={city.slug} />
                  <input type="hidden" name="to" value="planned" />
                  <button type="submit" className="btn" style={{ width: "100%" }}>
                    Park it
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <form action={setLaunchDateAction} className="cta-row" style={{ marginTop: 10 }}>
          <input type="hidden" name="slug" value={city.slug} />
          <input
            type="date"
            name="launchOn"
            defaultValue={city.launch_on ?? ""}
            aria-label="Launch date"
            className="btn"
            style={{ padding: "10px 12px" }}
          />
          <button type="submit" className="btn">
            Set launch date
          </button>
        </form>
      </section>

      <section style={{ marginTop: 32 }}>
        <div className="day">
          <h2>Opening runbook</h2>
          <span>same five weeks, every city</span>
        </div>
        <div className="runbook">
          {steps.map((step) => (
            <div key={step.when} className={`run-step${step.done ? " done" : ""}`}>
              <span className="run-when">{step.when}</span>
              <span className="run-what">
                <b>{step.title}</b>
                <span>{step.detail}</span>
              </span>
              <span className={`status ${step.done ? "ok" : "muted"}`}>
                {step.done ? "done" : "todo"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {applications.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <div className="day">
            <h2>Applications</h2>
            <span>{plural(applications.length, "hostel")} waiting on you</span>
          </div>
          <div className="admin-list">
            {applications.map((app) => (
              <div key={app.id} className="admin-row" style={{ alignItems: "flex-start" }}>
                <div className="admin-main">
                  <b>
                    {app.name} · {app.area}
                  </b>
                  <span>
                    {plural(app.beds, "bed")} · from €{(app.price_from_cents / 100).toFixed(0)} a night ·{" "}
                    applied {app.applied_at ? formatDay(app.applied_at.slice(0, 10)) : "just now"}
                  </span>
                  <span>{app.description}</span>
                  {app.note ? <span style={{ fontStyle: "italic" }}>“{app.note}”</span> : null}
                  <span style={{ fontSize: 10.5, color: "#a5978c" }}>{app.contact_email}</span>
                </div>
                <div className="admin-actions">
                  <form action={approvePartnerAction}>
                    <input type="hidden" name="hostelId" value={app.id} />
                    <button type="submit" className="btn small primary">
                      Approve
                    </button>
                  </form>
                  <form action={rejectPartnerAction}>
                    <input type="hidden" name="hostelId" value={app.id} />
                    <button type="submit" className="btn small danger">
                      Decline
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 12, lineHeight: 1.6 }}>
            Approving puts the hostel in Explore and on the city page, gives it a bookable dorm, and
            lets its staff post from today. It does not change the city&apos;s launch state — that is
            the bar above.
          </p>
        </section>
      ) : null}

      <section style={{ marginTop: 32 }}>
        <div className="day">
          <h2>Partners</h2>
          <span>{plural(hostels.length, "hostel")}</span>
        </div>

        <div className="admin-list">
          {hostels.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "#8b7d72" }}>
              No hostels yet. This is the part that takes knock-and-talk, not software.
            </p>
          ) : (
            hostels.map((hostel) => (
              <div key={hostel.id} className="admin-row">
                <div className="admin-main">
                  <b>{hostel.name}</b>
                  <span>
                    {hostel.area} · {plural(hostel.upcoming, "event")} in the next fortnight ·{" "}
                    {plural(hostel.joins, "join")} · {plural(hostel.scans, "QR scan")} (30d)
                  </span>
                </div>
                <div className="admin-actions">
                  <span className={`status ${hostel.upcoming > 0 ? "ok" : "warn"}`}>
                    {hostel.upcoming > 0 ? "posting" : "quiet"}
                  </span>
                  <Link href={`/hostel/${hostel.slug}/kit`} className="btn small">
                    Kit
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cta-row" style={{ marginTop: 14 }}>
          <Link href="/post" className="btn small">
            Post as a partner
          </Link>
          <Link href="/admin/ingest" className="btn small">
            Run the ingest
          </Link>
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <div className="day">
          <h2>City record</h2>
          <span>{city.tz}</span>
        </div>
        <div className="admin-list">
          <div className="admin-row">
            <div className="admin-main">
              <b>{city.intro}</b>
              <span>
                Centre {city.lat.toFixed(4)}, {city.lng.toFixed(4)} · {city.country} · launches{" "}
                {city.launch_on ? formatShortDate(city.launch_on) : "with no date"}
              </span>
            </div>
            <div className="admin-actions">
              <span className="status muted">/{city.slug}</span>
            </div>
          </div>
          <details className="record-edit">
            <summary>Edit the city record</summary>
            <form action={updateCityRecordAction} className="form-wrap" style={{ marginTop: 12 }}>
              <input type="hidden" name="slug" value={city.slug} />
              <div className="twocol">
                <div className="field">
                  <label htmlFor="edit-name">City</label>
                  <input id="edit-name" name="name" defaultValue={city.name} required maxLength={60} />
                </div>
                <div className="field">
                  <label htmlFor="edit-country">Country</label>
                  <input id="edit-country" name="country" defaultValue={city.country} required maxLength={60} />
                </div>
              </div>
              <div className="twocol">
                <div className="field">
                  <label htmlFor="edit-tz">Timezone</label>
                  <input id="edit-tz" name="tz" defaultValue={city.tz} required />
                </div>
                <div className="field">
                  <label htmlFor="edit-emoji">Emoji</label>
                  <input id="edit-emoji" name="emoji" defaultValue={city.emoji} maxLength={8} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="edit-intro">One-line intro</label>
                <textarea id="edit-intro" name="intro" defaultValue={city.intro} required minLength={20} maxLength={200} />
              </div>
              <div className="twocol">
                <div className="field">
                  <label htmlFor="edit-lat">Latitude</label>
                  <input id="edit-lat" name="lat" defaultValue={city.lat || ""} required />
                </div>
                <div className="field">
                  <label htmlFor="edit-lng">Longitude</label>
                  <input id="edit-lng" name="lng" defaultValue={city.lng || ""} required />
                </div>
              </div>
              <button type="submit" className="publish" style={{ marginTop: 12 }}>
                Save the record
              </button>
            </form>
          </details>

          {supply.nextEvent ? (
            <div className="admin-row">
              <div className="admin-main">
                <b>Next thing on</b>
                <span>
                  {formatDay(supply.nextEvent.slice(0, 10))} · {timeOf(supply.nextEvent)} ·{" "}
                  {supply.eventsWeek} in the next seven days
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
