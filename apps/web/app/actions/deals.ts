"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveStaff } from "@/lib/auth";
import { closeDeal, createDeal } from "@/lib/deals";

/**
 * The second thing a front desk posts in a minute: a bed for tonight.
 *
 * It is deliberately the same page, the same account and the same amount of
 * effort as posting an event, because the whole pitch is that a hostel does not
 * need a new tool for the empty bed.
 */
export async function createDealAction(formData: FormData) {
  const user = await requireActiveStaff("/post");
  if (!user.hostel_id) redirect("/post?deal=staff");

  const beds = Number(formData.get("beds") ?? 1);
  const price = Number(formData.get("price") ?? 0);
  if (!Number.isFinite(beds) || beds < 1 || !Number.isFinite(price) || price < 0 || price > 500) {
    redirect("/post?deal=check");
  }

  await createDeal({
    hostelId: user.hostel_id,
    createdBy: user.id,
    beds: Math.trunc(beds),
    priceCents: Math.round(price * 100),
    untilTime: String(formData.get("until") ?? "23:00"),
    note: String(formData.get("note") ?? ""),
  });

  revalidatePath("/");
  revalidatePath("/post");
  revalidatePath("/explore");
  revalidatePath("/hostel-admin");
  redirect("/post?deal=posted");
}

export async function closeDealAction(formData: FormData) {
  const user = await requireActiveStaff("/post");
  const dealId = Number(formData.get("dealId"));
  if (user.hostel_id && Number.isInteger(dealId)) await closeDeal(user.hostel_id, dealId);
  revalidatePath("/");
  revalidatePath("/post");
  redirect("/post?deal=closed");
}
