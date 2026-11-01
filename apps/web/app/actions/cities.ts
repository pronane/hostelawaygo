"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { checkTransition, citySlugFrom, launchGates } from "@/lib/cities";
import { getDb } from "@/lib/db";
import { createCity, getCity, getCitySupply, setCityStatus } from "@/lib/queries";
import type { CityStatus } from "@/lib/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TZ = /^[A-Za-z_]+\/[A-Za-z_]+$/;

function timezoneExists(tz: string): boolean {
  if (!TZ.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function revalidateCity(slug: string): void {
  for (const path of ["/", "/explore", "/admin/cities", `/admin/cities/${slug}`, `/c/${slug}`]) {
    revalidatePath(path);
  }
}

export async function createCityAction(formData: FormData) {
  await requireAdmin("/admin/cities");

  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const country = String(formData.get("country") ?? "").trim().slice(0, 60);
  const tz = String(formData.get("tz") ?? "").trim().slice(0, 60);
  const emoji = String(formData.get("emoji") ?? "").trim().slice(0, 8);
  const intro = String(formData.get("intro") ?? "").trim().slice(0, 200);
  const slug = citySlugFrom(String(formData.get("slug") ?? "").trim() || name);
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const launch = String(formData.get("launchOn") ?? "").trim();

  const fail = (code: string) => redirect(`/admin/cities?error=${code}`);

  if (!/^[a-z0-9-]{2,40}$/.test(slug)) fail("slug");
  if (name.length < 2) fail("name");
  if (country.length < 2) fail("country");
  if (!timezoneExists(tz)) fail("tz");
  if (intro.length < 20) fail("intro");
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) fail("lat");
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) fail("lng");
  if (lat === 0 && lng === 0) fail("lat");

  const result = await createCity({
    slug,
    name,
    country,
    tz,
    emoji,
    intro,
    lat,
    lng,
    // A new city never starts live: the gates exist to stop that.
    status: "opening",
    launch_on: ISO_DATE.test(launch) ? launch : null,
  });
  if (!result.ok) redirect(`/admin/cities?error=${encodeURIComponent(result.error)}`);

  revalidateCity(slug);
  redirect(`/admin/cities/${slug}?created=1`);
}

export async function setCityStatusAction(formData: FormData) {
  await requireAdmin("/admin/cities");

  const slug = citySlugFrom(String(formData.get("slug") ?? ""));
  const to = String(formData.get("to") ?? "") as CityStatus;
  if (!["planned", "opening", "live"].includes(to)) redirect("/admin/cities?error=status");

  const city = await getCity(slug);
  if (!city) redirect("/admin/cities?error=unknown");

  // Re-score rather than trusting whatever the page showed when it rendered.
  const gates = launchGates(city, (await getCitySupply(city.slug)));
  const check = checkTransition(city, to, gates);
  if (!check.ok) {
    const blocking = gates.find((g) => !g.ok)?.key ?? "record";
    redirect(`/admin/cities/${city.slug}?blocked=${blocking}`);
  }

  const launch = String(formData.get("launchOn") ?? "").trim();
  await setCityStatus(city.slug, to, ISO_DATE.test(launch) ? launch : null);
  revalidateCity(city.slug);
  redirect(`/admin/cities/${city.slug}?moved=${to}`);
}

export async function setLaunchDateAction(formData: FormData) {
  await requireAdmin("/admin/cities");

  const slug = citySlugFrom(String(formData.get("slug") ?? ""));
  const launch = String(formData.get("launchOn") ?? "").trim();
  const city = await getCity(slug);
  if (!city) redirect("/admin/cities?error=unknown");
  if (!ISO_DATE.test(launch)) redirect(`/admin/cities/${city.slug}?error=launch`);

  await setCityStatus(city.slug, city.status, launch);
  revalidateCity(city.slug);
  redirect(`/admin/cities/${city.slug}?launch=${launch}`);
}

export async function updateCityRecordAction(formData: FormData) {
  await requireAdmin("/admin/cities");

  const slug = citySlugFrom(String(formData.get("slug") ?? ""));
  const city = await getCity(slug);
  if (!city) redirect("/admin/cities?error=unknown");

  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const country = String(formData.get("country") ?? "").trim().slice(0, 60);
  const tz = String(formData.get("tz") ?? "").trim().slice(0, 60);
  const emoji = String(formData.get("emoji") ?? "").trim().slice(0, 8);
  const intro = String(formData.get("intro") ?? "").trim().slice(0, 200);
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const back = `/admin/cities/${city.slug}`;

  if (name.length < 2) redirect(`${back}?error=name`);
  if (country.length < 2) redirect(`${back}?error=country`);
  if (!timezoneExists(tz)) redirect(`${back}?error=tz`);
  if (intro.length < 20) redirect(`${back}?error=intro`);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) redirect(`${back}?error=lat`);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) redirect(`${back}?error=lng`);
  if (lat === 0 && lng === 0) redirect(`${back}?error=lat`);

  await getDb()
    .prepare(
      `UPDATE cities SET name = @name, country = @country, tz = @tz, emoji = @emoji,
         intro = @intro, lat = @lat, lng = @lng WHERE slug = @slug`
    )
    .run({ name, country, tz, emoji: emoji || "📍", intro, lat, lng, slug: city.slug });

  revalidateCity(city.slug);
  redirect(`${back}?saved=1`);
}
