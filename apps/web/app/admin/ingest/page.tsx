import { runIngestAction } from "@/app/actions/ingest";
import { requireAdmin } from "@/lib/auth";
import { getIngestRuns, getIngestTotals } from "@/lib/queries";
import { formatSqlTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ingest console" };

export default async function IngestPage({
  searchParams,
}: {
  searchParams: Promise<{ ran?: string; mode?: string }>;
}) {
  await requireAdmin("/admin/ingest");
  const { ran, mode } = await searchParams;

  const runs = await getIngestRuns();
  const totals = await getIngestTotals();
  const liveConfigured = Boolean(process.env.TICKETMASTER_API_KEY?.trim());

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Away ops · city supply</div>
        <h1 className="page-title">Ingest</h1>
        <p className="page-sub">
          Pulls ticketed events from Ticketmaster into the city feeds. Everything is keyed on{" "}
          <code>external_id</code>, so running it twice updates rather than duplicates.
        </p>
      </header>

      {ran ? (
        <div className="notice" role="status">
          <span aria-hidden="true">✓</span>
          <span>
            Run #{ran} finished in <b>{mode}</b> mode. The city feeds have been revalidated.
          </span>
        </div>
      ) : null}

      <div className="stat-row">
        <div className="stat">
          <b>{totals.events}</b>
          <span>IMPORTED EVENTS LIVE</span>
        </div>
        <div className="stat">
          <b>{runs.length ? runs.filter((r) => r.status === "ok").length : 0}</b>
          <span>SUCCESSFUL RUNS</span>
        </div>
        <div className="stat">
          <b>{liveConfigured ? "live" : "fixture"}</b>
          <span>DATA MODE</span>
        </div>
      </div>

      <div className={`notice${liveConfigured ? "" : " warn"}`} style={{ marginTop: 16 }}>
        <span aria-hidden="true">{liveConfigured ? "🛰️" : "🧪"}</span>
        <span>
          {liveConfigured ? (
            <>
              <b>Live mode.</b> A Ticketmaster key is configured, so runs call the Discovery API
              directly.
            </>
          ) : (
            <>
              <b>Fixture mode.</b> No <code>TICKETMASTER_API_KEY</code> is set, so runs replay a
              bundled Ticketmaster-shaped fixture — the full pipeline (normalise → upsert →
              revalidate) runs exactly as it would live.
            </>
          )}{" "}
          Last import: {totals.newest ? formatSqlTime(totals.newest) : "never"}.
        </span>
      </div>

      <form action={runIngestAction} style={{ marginTop: 16 }}>
        <button type="submit" className="publish" style={{ maxWidth: 320 }}>
          Run Ticketmaster ingest
        </button>
      </form>

      <section style={{ marginTop: 30 }}>
        <div className="day">
          <h2>Recent runs</h2>
          <span>{runs.length} logged</span>
        </div>
        <div className="admin-list">
          {runs.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "#8b7d72" }}>No runs yet. Press the button above.</p>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="admin-row">
                <div className="admin-main">
                  <b>
                    #{run.id} · {run.source} · {run.mode}
                  </b>
                  <span>
                    {run.status} · fetched {run.fetched}, inserted {run.inserted}, updated{" "}
                    {run.updated}, skipped {run.skipped}
                  </span>
                  <span style={{ fontSize: 10.5, color: "#a5978c" }}>
                    {formatSqlTime(run.started_at)} → {run.finished_at ? formatSqlTime(run.finished_at) : "…"} · {run.note}
                  </span>
                </div>
                <div className="admin-actions">
                  <span className={`status ${run.status === "ok" ? "ok" : "warn"}`}>{run.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
        <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 14, lineHeight: 1.6 }}>
          The same pipeline runs from the command line, so it can be cronned:{" "}
          <code>npm run ingest</code> posts to <code>/api/ingest</code> with an ingest token.
        </p>
      </section>
    </>
  );
}
