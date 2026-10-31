"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, startSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { createPartnerApplication, getCity } from "@/lib/queries";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Self-serve application: create the hostel (as `pending`) and the staff
 * account that will run it, then sign that person straight in so they can see
 * where their application is rather than waiting on an email.
 */
export async function applyPartnerAction(formData: FormData) {
  const existing = await getCurrentUser();
  // One account, one role: a signed-in traveller would have to become staff,
  // which would take their trips and chats with it.
  if (existing) redirect(existing.role === "traveller" ? "/partner?error=signed-in" : "/partner");

  const hostelName = String(formData.get("hostelName") ?? "").trim().slice(0, 80);
  const citySlug = String(formData.get("city") ?? "").trim().slice(0, 40);
  const area = String(formData.get("area") ?? "").trim().slice(0, 60);
  const description = String(formData.get("description") ?? "").trim().slice(0, 600);
  const note = String(formData.get("note") ?? "").trim().slice(0, 400);
  const beds = Number(formData.get("beds"));
  const priceEuros = Number(formData.get("price"));
  const contactName = String(formData.get("contactName") ?? "").trim().slice(0, 60);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const password = String(formData.get("password") ?? "");

  const fail = (code: string) => redirect(`/partner?error=${code}`);

  if (hostelName.length < 2) fail("name");
  if (!getCity(citySlug)) fail("city");
  if (area.length < 2) fail("area");
  if (description.length < 40) fail("description");
  if (!Number.isInteger(beds) || beds < 1 || beds > 2000) fail("beds");
  if (!Number.isFinite(priceEuros) || priceEuros < 0 || priceEuros > 500) fail("price");
  if (contactName.length < 2) fail("contact");
  if (!EMAIL.test(email)) fail("email");
  if (password.length < 8) fail("password");

  const result = createPartnerApplication({
    city: citySlug,
    name: hostelName,
    area,
    description,
    beds,
    priceFromCents: Math.round(priceEuros * 100),
    contactEmail: email,
    note,
    contactName,
    email,
    passwordHash: hashPassword(password),
  });

  if (!result.ok) {
    redirect(`/partner?error=${encodeURIComponent(result.error)}`);
  }

  await startSession(result.travellerId);
  revalidatePath("/admin/cities");
  redirect("/partner?submitted=1");
}
