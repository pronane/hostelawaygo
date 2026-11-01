"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CITY_COOKIE } from "@/lib/auth";
import { getCity } from "@/lib/queries";

export async function selectCityAction(formData: FormData) {
  const slug = String(formData.get("city") ?? "");
  const next = String(formData.get("next") ?? "/");
  const city = await getCity(slug);
  if (!city || city.status !== "live") redirect(next.startsWith("/") ? next : "/");

  const jar = await cookies();
  jar.set(CITY_COOKIE, slug, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180,
    secure: process.env.NODE_ENV === "production",
  });

  redirect(next.startsWith("/") ? next : "/");
}
