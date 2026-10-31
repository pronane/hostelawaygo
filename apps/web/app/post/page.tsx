import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { PostForm } from "@/components/post-form";
import { requireStaff } from "@/lib/auth";
import { getHostelPosts, getHostels, getTravellerCount } from "@/lib/queries";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Post tonight" };

export default async function PostPage() {
  const user = await requireStaff("/post");
  const hostels = getHostels();
  const hostel = (user.hostel_id ? hostels.find((h) => h.id === user.hostel_id) : hostels[0])!;
  // The audience promise is made per city, not per database.
  const cityHostels = getHostels(hostel.city);
  const posts = getHostelPosts(hostel.id, 4, user.id);
  const audience = getTravellerCount();

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Hostel mode · {hostel.name}</div>
        <h1 className="page-title">Post tonight</h1>
        <p className="page-sub">
          Goes live to {plural(audience, "traveller")} across {plural(cityHostels.length, "hostel")} in{" "}
          {hostel.city}. It takes about a minute — and it fills your bar.
        </p>
      </header>

      <div style={{ marginTop: 18 }}>
        <PostForm audience={audience} hostels={cityHostels.length} />
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
          Posting is restricted to signed-in hostel staff, and scoped to their own hostel.{" "}
          <Link href="/hostel-admin" style={{ textDecoration: "underline" }}>
            Back to the portal
          </Link>
          .
        </p>
      </section>
    </>
  );
}
