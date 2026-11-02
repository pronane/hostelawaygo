"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, startSession } from "@/lib/auth";
import { citySlugFrom } from "@/lib/cities";
import { hashPassword } from "@/lib/password";
import { createOpeningCity, createPartnerApplication, getCity } from "@/lib/queries";

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

  // A hostel in a city we have never heard of is the whole growth problem in
  // one row. The form lets them type it; the city is created as `opening`, so
  // the application has somewhere to land and the pipeline shows a partner
  // waiting in a city we had not listed. Their timezone matters because every
  // date they post will be rendered in it later.
  let city = citySlug;
  if (city === "other") {
    const typedName = String(formData.get("cityName") ?? "").trim().slice(0, 60);
    const typedCountry = String(formData.get("cityCountry") ?? "").trim().slice(0, 60);
    const typedTz = String(formData.get("cityTz") ?? "").trim().slice(0, 60);
    const slug = citySlugFrom(typedName);
    if (typedName.length < 2 || typedCountry.length < 2 || !slug) fail("city");

    if (!await getCity(slug)) {
      const created = await createOpeningCity({
        slug,
        name: typedName.replace(/\b\w/g, (c) => c.toUpperCase()),
        country: typedCountry,
        tz: typedTz || "Europe/Lisbon",
      });
      if (!created.ok) fail("city");
    }
    city = slug;
  }

  if (hostelName.length < 2) fail("name");
  if (!await getCity(city)) fail("city");
  if (area.length < 2) fail("area");
  if (description.length < 40) fail("description");
  if (!Number.isInteger(beds) || beds < 1 || beds > 2000) fail("beds");
  if (!Number.isFinite(priceEuros) || priceEuros < 0 || priceEuros > 500) fail("price");
  if (contactName.length < 2) fail("contact");
  if (!EMAIL.test(email)) fail("email");
  if (password.length < 8) fail("password");

  const result = await createPartnerApplication({
    city,
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
  if (city !== citySlug) {
    // They just created a city. Say so, rather than thanking them generically.
    redirect(`/partner?submitted=1&newCity=${encodeURIComponent(city)}`);
  }
  redirect("/partner?submitted=1");
}
