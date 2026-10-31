"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { cancelBooking, createBooking, getBookingByCode, markBookingPaid } from "@/lib/queries";
import { createStripeCheckout, getPaymentForBooking, openPayment, stripeConfigured } from "@/lib/payments";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function origin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

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

/**
 * Opens (or reopens) a payment and, when a PSP is configured, hands the guest
 * to its hosted checkout. With no PSP this settles in-process as `sandbox`.
 */
export async function payBookingAction(formData: FormData) {
  const user = await getCurrentUser();
  const code = String(formData.get("code") ?? "");
  if (!user) redirect(`/login?next=${encodeURIComponent(`/booking/${code}`)}`);

  const booking = getBookingByCode(code);
  if (!booking || (booking.traveller_id !== user.id && user.role !== "admin")) {
    redirect("/trips");
  }
  if (booking.status === "cancelled" || booking.status === "confirmed") redirect(`/booking/${code}`);

  const intent = openPayment(booking.id, booking.code, booking.total_cents);

  if (stripeConfigured()) {
    const base = (await origin()) ?? "";
    const session = await createStripeCheckout({
      bookingCode: booking.code,
      amountCents: booking.total_cents,
      currency: intent.currency,
      successUrl: `${base}/booking/${booking.code}?paid=1`,
      cancelUrl: `${base}/booking/${booking.code}?payment=cancelled`,
    });

    if ("url" in session) redirect(session.url);
    redirect(`/booking/${booking.code}?payment=failed`);
  }

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

/** Reopens the payment window after an intent expires. */
export async function refreshPaymentAction(formData: FormData) {
  const user = await getCurrentUser();
  const code = String(formData.get("code") ?? "");
  if (!user) redirect(`/login?next=${encodeURIComponent(`/booking/${code}`)}`);

  const booking = getBookingByCode(code);
  if (booking && booking.traveller_id === user.id) {
    const payment = getPaymentForBooking(booking.id);
    if (payment) openPayment(booking.id, booking.code, booking.total_cents);
  }

  revalidatePath(`/booking/${code}`);
  redirect(`/booking/${code}`);
}
