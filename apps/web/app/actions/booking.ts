"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { cancelBooking, createBooking, markBookingPaid } from "@/lib/queries";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createBookingAction(formData: FormData) {
  const user = await getCurrentUser();

  const roomId = Number(formData.get("roomId"));
  const checkIn = String(formData.get("checkIn") ?? "");
  const checkOut = String(formData.get("checkOut") ?? "");
  const guests = Number(formData.get("guests") ?? 1);
  const slug = String(formData.get("slug") ?? "");

  const back = `/hostel/${slug}?in=${encodeURIComponent(checkIn)}&out=${encodeURIComponent(checkOut)}`;
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) redirect(`${back}&error=dates`);

  const result = createBooking({ roomId, checkIn, checkOut, guests }, user.id);
  if (!result.ok) redirect(`${back}&error=${encodeURIComponent(result.error)}`);

  revalidatePath("/trips");
  redirect(`/booking/${result.code}`);
}

export async function payBookingAction(formData: FormData) {
  const user = await getCurrentUser();
  const code = String(formData.get("code") ?? "");
  if (!user) redirect(`/login?next=${encodeURIComponent(`/booking/${code}`)}`);

  markBookingPaid(code, user.id);
  revalidatePath(`/booking/${code}`);
  revalidatePath("/trips");
  redirect(`/booking/${code}?paid=1`);
}

export async function cancelBookingAction(formData: FormData) {
  const user = await getCurrentUser();
  const code = String(formData.get("code") ?? "");
  const back = String(formData.get("back") ?? "/trips");
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);

  cancelBooking(code, user.id);
  revalidatePath(`/booking/${code}`);
  revalidatePath("/trips");
  redirect(back.startsWith("/") ? back : "/trips");
}
