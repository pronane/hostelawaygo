import Link from "next/link";
import { notFound } from "next/navigation";
import { joinGroupAction } from "@/app/actions/groups";
import { ShareButton } from "@/components/share-button";
import { getCurrentUser } from "@/lib/auth";
import { getGroup, getGroupMembers } from "@/lib/groups";
import { getCity, getEvent } from "@/lib/queries";
import { endTime, formatDay, timeOf } from "@/lib/time";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ created?: string; in?: string; already?: string; error?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { token } = await params;
  const group = await getGroup(token);
  if (!group) return { title: "Group not found", robots: { index: false, follow: false } };
  const event = await getEvent(group.event_id, null);
  return {
    title: `We're going: ${event?.title ?? "a night out"} · Away`,
    description: "Tap to add your name. No account needed.",
    robots: { index: false, follow: false },
  };
}

/**
 * The page a WhatsApp group actually opens.
 *
 * It has to work for somebody who has never heard of Away, has no account, and
 * is walking to dinner: one sentence about what the thing is, one button to add
 * a name, and the way to the real page if they want beds and chat. Anything
 * more is a drop-off.
 */
export default async function GroupPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { created, in: joined, already, error } = await searchParams;

  const group = await getGroup(token);
  if (!group) notFound();

  const event = await getEvent(group.event_id, null);
  if (!event) notFound();

  const user = await getCurrentUser();
  const members = await getGroupMembers(group.id);
  const mine = user ? members.some((m) => m.traveller_id === user.id) : false;
  const city = await getCity(event.city);
  const cityName = city?.name ?? event.city;
  const venueName = event.venue.split(" · ")[0];
  const target = group.size && group.size > members.length ? group.size : null;

  return (
    <article style={{ maxWidth: 620 }}>
      <div className="eyebrow">A group night · {cityName}</div>
      <h1 className="page-title" style={{ marginTop: 4 }}>
        {target ? `${members.length} of ${target} in` : `${members.length} going`}
      </h1>
      <p className="page-sub">
        {group.plan ? <b>{group.plan}</b> : <b>{event.title}</b>}
        <br />
        {formatDay(event.starts_at.slice(0, 10))} · {timeOf(event.starts_at)}–{endTime(event.starts_at, event.duration_min)} ·{" "}
        {venueName}
      </p>

      {created ? (
        <div className="notice" role="status" style={{ marginBottom: 14, alignItems: "center" }}>
          <span aria-hidden="true">👥</span>
          <span style={{ flex: 1 }}>
            <b>Group made.</b> Send this link to the group chat — they add a name, nothing else.
          </span>
          <ShareButton title={`We're going: ${event.title}`} url={`/g/${group.token}`} label="Send link" />
        </div>
      ) : null}
      {joined ? (
        <div className="notice" role="status" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">✓</span>
          <span>
            <b>You&apos;re in.</b> The hostel can see your group is coming.
          </span>
        </div>
      ) : null}
      {already ? (
        <div className="notice" role="status" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">✓</span>
          <span>You were already on this one.</span>
        </div>
      ) : null}
      {error === "name" ? (
        <div className="notice warn" role="alert" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">!</span>
          <span>Put a name in first — a first name is enough.</span>
        </div>
      ) : null}

      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">Who&apos;s in</div>
        <div className="chips" style={{ paddingTop: 4 }}>
          {members.map((member) => (
            <span key={member.id} className="chip" style={{ cursor: "default" }}>
              {member.name}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "#8b7d72", margin: "10px 0 0", lineHeight: 1.6 }}>
          First names only. Nobody has to make an account to be counted.
        </p>
      </section>

      {mine ? (
        <p style={{ fontSize: 13, color: "#7b6e64", marginBottom: 14 }}>
          You&apos;re on the list. <Link href={`/event/${event.id}`} style={{ textDecoration: "underline" }}>Open the night</Link>{" "}
          for the chat and the way there.
        </p>
      ) : (
        <form action={joinGroupAction} className="form-wrap" style={{ marginBottom: 14 }}>
          <input type="hidden" name="token" value={group.token} />
          <div className="field">
            <label htmlFor="group-name">Your first name</label>
            <input
              id="group-name"
              name="name"
              required
              maxLength={40}
              defaultValue={user ? user.name.split(" ")[0] : ""}
              placeholder="Sam"
            />
          </div>
          <button type="submit" className="btn primary block" style={{ marginTop: 12 }}>
            I&apos;m in
          </button>
          <p style={{ fontSize: 11.5, color: "#8b7d72", margin: "10px 0 0", lineHeight: 1.6 }}>
            No account, no email. It just tells the hostel how many of you to expect.
          </p>
        </form>
      )}

      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">The night itself</div>
        <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.6 }}>
          <b>{event.title}</b> · {formatDay(event.starts_at.slice(0, 10))} at {timeOf(event.starts_at)}
          <br />
          {event.venue}
        </p>
        <div className="cta-row">
          <Link href={`/event/${event.id}`} className="btn">
            Open the night
          </Link>
          {event.hostel_slug ? (
            <Link href={`/hostel/${event.hostel_slug}`} className="btn">
              Beds at {event.hostel_name ?? "the hostel"}
            </Link>
          ) : null}
        </div>
      </section>

      <p style={{ fontSize: 11.5, color: "#8b7d72", lineHeight: 1.65 }}>
        Away is what&apos;s on in the hostel you&apos;re in — the nights, the cheap dinners and the
        people going. The hostel you&apos;re staying in posts them; the code is on the desk.
      </p>
    </article>
  );
}
