import { redirect } from "next/navigation";
import { requireActiveStaff } from "@/lib/auth";
import { getHostels } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Stable nav target: resolves the signed-in staff member's own hostel kit. */
export default async function KitRedirectPage() {
  const user = await requireActiveStaff("/hostel-admin/kit");
  const hostels = await getHostels();
  const hostel = user.hostel_id ? hostels.find((h) => h.id === user.hostel_id) : undefined;

  // Ops has no hostel of its own, so send them to the pipeline and pick a partner
  // there rather than guessing one.
  if (!hostel) redirect(user.role === "admin" ? "/admin/cities" : "/explore");
  redirect(`/hostel/${hostel.slug}/kit`);
}
