import Link from "next/link";
import { sendDigestAction } from "@/app/actions/digest";
import { requireAdmin } from "@/lib/auth";
import { digestAlreadySent, digestAudience, recentDigestSends, runDigest } from "@/lib/digest";
import { mailEnabled } from "@/lib/mail";
import { formatDay, formatSqlTime } from "@/lib/time";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Arrivals digest" };

const STATUS_TONE: Record<string, string> = {
  sent: "ok",
  preview: "ok",
  "sent-already": "muted",
  empty: "warn",
  unsent: "warn",
};

export default async function DigestPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; sent?: string; considered?: string }>;
}) {
  await requireAdmin("/admin/digest");
  const { preview, sent, considered } = await searchParams;

  const audience = await digestAudience();
  const sends = await recentDigestSends(12);
  const enabled = mailEnabled();
  const previewRun = preview ? await runDigest({ dryRun: true }) : null;
  const sample = previewRun?.results.find((r) => r.digest)?.digest ?? null;
  const withContent = previewRun?.results.filter((r) => r.status === "preview").length ?? 0;

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Away ops · traveller pull</div>
        <h1 className="page-title">Arrivals digest</h1>
        <p className="page-sub">
          One email per stay, a few days before they land: what&apos;s on while they&apos;re there,
          at walking distance from the bed they booked. Nobody gets two for the same trip, and
          nobody gets an empty one.
        </p>
      </header>

      {sent !== undefined ? (
        <div className="notice" role="status">
          <span aria-hidden="true">✓</span>
          <span>
            <b>
              {sent} {sent === "1" ? "digest" : "digests"} sent
            </b>{" "}
            out of {considered} trip{considered === "1" ? "" : "s"} considered.{" "}
            {enabled ? "Check the log below." : "No mail provider is configured, so these are recorded as unsent."}
          </span>
        </div>
      ) : null}

      {!enabled ? (
        <div className="notice warn">
          <span aria-hidden="true">🧪</span>
          <span>
            <b>No mail provider.</b> <code>RESEND_API_KEY</code> isn&apos;t set, so sending records
            the attempt as <i>unsent</i> instead of emailing. Preview is fully real — same renderer,
            same copy.
          </span>
        </div>
      ) : null}

      <div className="stat-row">
        <div className="stat">
          <b>{audience.length}</b>
          <span>TRIPS IN THE NEXT 7 DAYS</span>
        </div>
        <div className="stat">
          <b>{audience.filter((t) => !digestAlreadySent(t)).length}</b>
          <span>NOT YET SENT</span>
        </div>
        <div className="stat">
          <b>{sends.filter((s) => s.status === "sent").length}</b>
          <span>SENT (LOG)</span>
        </div>
      </div>

      <div className="cta-row">
        <form action={sendDigestAction} style={{ flex: "0 0 auto" }}>
          <button type="submit" className="btn primary">
            Send to everyone who&apos;s due
          </button>
        </form>
        <Link href="/admin/digest?preview=1" className="btn">
          Preview the next one
        </Link>
      </div>

      {previewRun ? (
        <section style={{ marginTop: 26 }}>
          <div className="day">
            <h2>Preview</h2>
            <span>
              {previewRun.considered} considered · {withContent} would send
            </span>
          </div>

          <div className="admin-list">
            {previewRun.results.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "#8b7d72" }}>
                Nobody has a trip in the next week. Sign in as Marta — she&apos;s in Lisbon now and in
                Porto in a fortnight.
              </p>
            ) : (
              previewRun.results.map((r) => (
                <div key={`${r.trip.travellerId}-${r.trip.key}`} className="admin-row">
                  <div className="admin-main">
                    <b>
                      {r.trip.name} · {r.trip.cityName}
                    </b>
                    <span>
                      {formatDay(r.trip.startsOn)} → {formatDay(r.trip.endsOn)} ·{" "}
                      {r.trip.hostelName ?? "no hostel"} · {r.note}
                    </span>
                  </div>
                  <div className="admin-actions">
                    <span className={`status ${STATUS_TONE[r.status] ?? "muted"}`}>{r.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {sample ? (
            <>
              <div className="day" style={{ marginTop: 22 }}>
                <h2>What lands in the inbox</h2>
                <span>{sample.subject}</span>
              </div>
              <div className="mail-preview" dangerouslySetInnerHTML={{ __html: sample.html }} />
              <details className="record-edit">
                <summary>Plain-text version</summary>
                <pre className="mail-text">{sample.text}</pre>
              </details>
            </>
          ) : null}
        </section>
      ) : null}

      <section style={{ marginTop: 30 }}>
        <div className="day">
          <h2>Travellers due</h2>
          <span>{plural(audience.length, "trip")}</span>
        </div>

        <div className="admin-list">
          {audience.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "#8b7d72" }}>
              No trips starting in the next week. The digest only writes to people who booked a bed
              somewhere we&apos;re live.
            </p>
          ) : (
            audience.map((trip) => (
              <div key={`${trip.travellerId}-${trip.key}`} className="admin-row">
                <div className="admin-main">
                  <b>
                    {trip.name} · {trip.cityName}
                  </b>
                  <span>
                    {trip.email} · {formatDay(trip.startsOn)} → {formatDay(trip.endsOn)} ·{" "}
                    {trip.hostelName ?? "no hostel"}
                  </span>
                </div>
                <div className="admin-actions">
                  <span className={`status ${digestAlreadySent(trip) ? "muted" : "warn"}`}>
                    {digestAlreadySent(trip) ? "sent" : "due"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={{ marginTop: 30 }}>
        <div className="day">
          <h2>Log</h2>
          <span>one row per trip, ever</span>
        </div>
        <div className="admin-list">
          {sends.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "#8b7d72" }}>Nothing sent yet.</p>
          ) : (
            sends.map((row) => (
              <div key={row.id} className="admin-row">
                <div className="admin-main">
                  <b>
                    {row.name} <span style={{ fontWeight: 400, color: "#8b7d72" }}>· {row.trip_key}</span>
                  </b>
                  <span>
                    {formatSqlTime(row.sent_at)} · {row.note || "—"}
                  </span>
                </div>
                <div className="admin-actions">
                  <span className={`status ${row.status === "sent" ? "ok" : row.status === "empty" ? "warn" : "muted"}`}>
                    {row.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
        <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 14, lineHeight: 1.6 }}>
          The same job runs from the command line, so it can be cronned:{" "}
          <code>DIGEST_TOKEN=… npm run digest</code> posts to <code>/api/digest</code>. Re-running is
          safe — the unique key is the trip, not the run.
        </p>
      </section>
    </>
  );
}
