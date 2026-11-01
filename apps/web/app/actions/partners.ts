"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { appUrl, sendMail } from "@/lib/mail";
import { approveHostel, getHostelById, rejectHostel } from "@/lib/queries";

function revalidateHostel(hostel: { city: string; slug: string }): void {
  for (const path of [
    "/",
    "/explore",
    "/admin/cities",
    `/admin/cities/${hostel.city}`,
    `/hostel/${hostel.slug}`,
    `/c/${hostel.city}`,
  ]) {
    revalidatePath(path);
  }
}

/**
 * Approval is what makes an application real: the hostel goes active (so it
 * appears in Explore, the city page and the launch bar) and gets a bookable
 * dorm, so the first traveller to find it can reserve.
 */
export async function approvePartnerAction(formData: FormData) {
  await requireAdmin("/admin/cities");

  const id = Number(formData.get("hostelId"));
  const hostel = Number.isInteger(id) ? await getHostelById(id) : undefined;
  if (!hostel) redirect("/admin/cities?error=unknown");

  if (!await approveHostel(hostel.id)) redirect(`/admin/cities/${hostel.city}?error=partner`);
  revalidateHostel(hostel);

  // Tell them, because "we'll email you" was the promise on the form. With no
  // provider configured this is a no-op rather than a failure.
  if (hostel.contact_email) {
    const base = appUrl();
    await sendMail(
      hostel.contact_email,
      `${hostel.name} is live on Away`,
      [
        `You're on the map. Your staff account can post tonight, and your page is live:`,
        ``,
        `  Post an event:  ${base}/post`,
        `  Your page:      ${base}/hostel/${hostel.slug}`,
        `  Partner kit:    ${base}/hostel/${hostel.slug}/kit`,
        ``,
        `Start with the kit: print the reception poster, stick one on a dorm door, and post`,
        `tonight's thing from the desk. It takes about a minute.`,
      ].join("\n")
    );
  }

  redirect(`/admin/cities/${hostel.city}?approved=${encodeURIComponent(hostel.name)}`);
}

export async function rejectPartnerAction(formData: FormData) {
  await requireAdmin("/admin/cities");

  const id = Number(formData.get("hostelId"));
  const hostel = Number.isInteger(id) ? await getHostelById(id) : undefined;
  if (!hostel) redirect("/admin/cities?error=unknown");

  if (!await rejectHostel(hostel.id)) redirect(`/admin/cities/${hostel.city}?error=partner`);
  revalidateHostel(hostel);
  redirect(`/admin/cities/${hostel.city}?rejected=${encodeURIComponent(hostel.name)}`);
}
