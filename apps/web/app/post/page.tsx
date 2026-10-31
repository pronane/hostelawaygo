import { EventCard } from "@/components/event-card";
import { PostForm } from "@/components/post-form";
import { HOME_HOSTEL_NAME } from "@/lib/constants";
import { getHostelPosts, getHostels, getTravellerCount } from "@/lib/queries";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Post tonight" };

export default function PostPage() {
  const hostels = getHostels("lisbon");
  const home = hostels.find((h) => h.name === HOME_HOSTEL_NAME);
  const posts = home ? getHostelPosts(home.id, 4) : [];
  const audience = getTravellerCount();

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Hostel mode · {HOME_HOSTEL_NAME}</div>
        <h1 className="page-title">Post tonight</h1>
        <p className="page-sub">
          Goes live to {plural(audience, "traveller")} across {plural(hostels.length, "hostel")}{" "}
          in the city. It takes about a minute — and it fills your bar.
        </p>
      </header>

      <div style={{ marginTop: 18 }}>
        <PostForm audience={audience} hostels={hostels.length} />
      </div>

      <section style={{ marginTop: 34, maxWidth: 560 }}>
        <div className="panel-head">Posted from this hostel</div>
        {posts.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "#8b7d72" }}>
            Nothing posted yet. Your first one appears here the moment you publish.
          </p>
        ) : (
          posts.map((e) => <EventCard key={e.id} event={e} />)
        )}
        <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 16, lineHeight: 1.6 }}>
          This is the supply side of the product: staff post in under a minute, the event
          appears immediately in every guest&apos;s HERE feed, and the attendee list tells you
          who to expect at the door.
        </p>
      </section>
    </>
  );
}
