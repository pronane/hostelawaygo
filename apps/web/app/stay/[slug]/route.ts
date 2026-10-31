import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CITY_COOKIE } from "@/lib/auth";
import { ensureVisitor, rememberStay } from "@/lib/arrivals";
import { getCity, getHostelBySlug, recordArrival } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * The QR at reception.
 *
 * `/stay/<hostel>` is what the poster and the dorm-door sticker point at. It
 * records an arrival, remembers where the traveller is sleeping, and drops them
 * into that city's feed — so the first thing a guest sees after checking in is
 * tonight, at walking distance.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hostel = getHostelBySlug(slug);
  if (!hostel || hostel.status !== "active") redirect("/explore");

  const visitor = await ensureVisitor();
  recordArrival(hostel.id, visitor);
  await rememberStay(hostel.slug);

  // Only switch the feed to a city travellers are allowed to see.
  const city = getCity(hostel.city);
  if (city?.status === "live") {
    const jar = await cookies();
    jar.set(CITY_COOKIE, hostel.city, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 180,
      secure: process.env.NODE_ENV === "production",
    });
  }

  redirect(`/?from=${encodeURIComponent(hostel.slug)}`);
}
