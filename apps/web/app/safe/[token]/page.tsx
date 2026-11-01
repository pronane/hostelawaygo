import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatLocal, getSafeNight, minutesOverdue, statusOf } from "@/lib/safe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check-in", robots: { index: false, follow: false } };

/** The friend's view: first name, the plan, back-by time and live status. No sign-in. */
export default async function SafeStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const night = await getSafeNight(token);
  if (!night) notFound();
  const status = statusOf(night);
  const name = night.first_name;

  const tone =
    status === "home"
      ? { emoji: "✅", head: `${name} is home safe`, bg: "#e7f6ec" }
      : status === "overdue"
        ? { emoji: "⏰", head: `${name} hasn't checked in`, bg: "#fdecea" }
        : status === "cancelled"
          ? { emoji: "—", head: `${name} cancelled this`, bg: "#f3ede6" }
          : { emoji: "🌙", head: `${name} is out`, bg: "#fdf0e4" };

  return (
    <div style={{ maxWidth: 560 }}>
      <AutoRefresh seconds={60} />
      <section className="panel" style={{ background: tone.bg }}>
        <div style={{ fontSize: 40 }} aria-hidden="true">{tone.emoji}</div>
        <h1 className="page-title" style={{ marginTop: 6 }}>{tone.head}</h1>
        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>{night.plan}</p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b5b50" }}>
          {status === "home" && night.home_at
            ? `Checked in at ${formatLocal(night.home_at, night.tz)}.`
            : status === "overdue"
              ? `Expected back by ${formatLocal(night.back_by, night.tz)} — ${minutesOverdue(night)} minutes ago.`
              : `Expected back by ${formatLocal(night.back_by, night.tz)}.`}
        </p>
      </section>

      {status === "overdue" ? (
        <div className="notice warn" role="alert" style={{ marginTop: 14 }}>
          <span aria-hidden="true">!</span>
          <span>
            Try calling or messaging {name} first — phones die and plans run late. If you&apos;re
            worried and can&apos;t reach them, contact their hostel or call 112.
          </span>
        </div>
      ) : null}

      <p style={{ fontSize: 12, color: "#8b7d72", marginTop: 16 }}>
        This page updates by itself every minute. Shared with you through Away.
      </p>
    </div>
  );
}
