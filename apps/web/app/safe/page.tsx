import Link from "next/link";
import { redirect } from "next/navigation";
import { updateSafeNightAction } from "@/app/actions/safe";
import { SafeForm } from "@/components/safe-form";
import { ShareButton } from "@/components/share-button";
import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/queries";
import { formatLocal, getSafeNights, minutesOverdue, statusOf } from "@/lib/safe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Share my night" };

const ERRORS: Record<string, string> = {
  plan: "Say where you're going — a venue or an area is enough.",
  time: "Pick a time in the next 24 hours.",
};

export default async function SafePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; error?: string; created?: string; home?: string }>;
}) {
  const { event: eventParam, error, created, home } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/safe${eventParam ? `?event=${eventParam}` : ""}`)}`);

  const event = eventParam ? await getEvent(Number(eventParam), user.id) : null;
  const endIso = event
    ? new Date(new Date(event.starts_at).getTime() + event.duration_min * 60_000).toISOString()
    : undefined;
  const nights = await getSafeNights(user.id);
  const active = nights.filter((n) => !n.cancelled && !n.home_at);

  return (
    <div style={{ maxWidth: 640 }}>
      <header className="page-head">
        <div className="eyebrow">Getting home</div>
        <h1 className="page-title">Share my night</h1>
        <p className="page-sub">
          Tell a friend where you&apos;re going and when you&apos;ll be back. They get a link that shows
          when you check in home — or that you haven&apos;t yet.
        </p>
      </header>

      {created ? (
        <div className="notice" role="status" style={{ marginBottom: 14, alignItems: "center" }}>
          <span aria-hidden="true">🛟</span>
          <span style={{ flex: 1 }}><b>Link ready.</b> Send it to your friend now.</span>
          <ShareButton title="Where I'll be tonight" url={`/safe/${created}`} label="Send link" />
        </div>
      ) : null}
      {home ? (
        <div className="notice" role="status" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">✓</span>
          <span><b>Home safe.</b> Your friend&apos;s link now says so.</span>
        </div>
      ) : null}
      {error && ERRORS[error] ? (
        <div className="notice warn" role="alert" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">!</span>
          <span>{ERRORS[error]}</span>
        </div>
      ) : null}

      {active.map((n) => {
        const status = statusOf(n);
        return (
          <section key={n.id} className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-head">{status === "overdue" ? `Overdue by ${minutesOverdue(n)} min` : "You're out"}</div>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{n.plan}</p>
            <p style={{ margin: 0, fontSize: 12.5, color: "#8b7d72" }}>
              Back by {formatLocal(n.back_by, n.tz)}
              {n.friend_name ? ` · ${n.friend_name} has the link` : ""}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginTop: 12 }}>
              <form action={updateSafeNightAction}>
                <input type="hidden" name="token" value={n.token} />
                <input type="hidden" name="change" value="home" />
                <button type="submit" className="btn primary">I&apos;m home safe</button>
              </form>
              <form action={updateSafeNightAction}>
                <input type="hidden" name="token" value={n.token} />
                <input type="hidden" name="change" value="extend" />
                <button type="submit" className="btn">Running late · +1h</button>
              </form>
              <ShareButton title="Where I'll be tonight" url={`/safe/${n.token}`} label="Share again" />
              <form action={updateSafeNightAction}>
                <input type="hidden" name="token" value={n.token} />
                <input type="hidden" name="change" value="cancel" />
                <button type="submit" className="btn">Cancel</button>
              </form>
            </div>
          </section>
        );
      })}

      <SafeForm eventId={event?.id} plan={event ? `${event.title} · ${event.venue.split(" · ")[0]}` : undefined} eventEndIso={endIso} />

      <p style={{ fontSize: 12, color: "#8b7d72", marginTop: 16, lineHeight: 1.6 }}>
        In an emergency call 112 — it works across the EU from any phone. <Link href="/you">Back to You</Link>
      </p>
    </div>
  );
}
