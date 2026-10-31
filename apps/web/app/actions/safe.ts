"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/queries";
import { createSafeNight, updateSafeNight } from "@/lib/safe";
import { getCity } from "@/lib/queries";

export async function createSafeNightAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/safe");

  const eventId = Number(formData.get("eventId")) || null;
  const event = eventId ? getEvent(eventId, user.id) : null;
  const plan = String(formData.get("plan") ?? "").trim().slice(0, 140) || event?.title || "";
  const friendName = String(formData.get("friend") ?? "").trim().slice(0, 40);
  // The browser converts the local "back by" time to an ISO instant (with the
  // phone's offset) so we don't have to guess the traveller's time zone here.
  const backByRaw = String(formData.get("backByIso") ?? "");
  const backBy = new Date(backByRaw);

  const fail = (code: string) => redirect(`/safe?error=${code}${eventId ? `&event=${eventId}` : ""}`);
  if (plan.length < 3) fail("plan");
  if (Number.isNaN(backBy.getTime())) fail("time");
  const hoursAhead = (backBy.getTime() - Date.now()) / 3_600_000;
  if (hoursAhead < 0 || hoursAhead > 24) fail("time");

  const tz = event ? (getCity(event.city)?.tz ?? "Europe/Lisbon") : String(formData.get("tz") ?? "Europe/Lisbon").slice(0, 60);
  const token = createSafeNight({
    travellerId: user.id,
    eventId: event?.id ?? null,
    plan,
    friendName,
    backBy: backBy.toISOString(),
    tz: /^[A-Za-z_]+\/[A-Za-z_]+$/.test(tz) ? tz : "Europe/Lisbon",
  });
  revalidatePath("/safe");
  redirect(`/safe?created=${token}`);
}

export async function updateSafeNightAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/safe");
  const token = String(formData.get("token") ?? "");
  const change = String(formData.get("change") ?? "");
  if (change !== "home" && change !== "cancel" && change !== "extend") redirect("/safe");
  updateSafeNight(token, user.id, change);
  revalidatePath("/safe");
  revalidatePath(`/safe/${token}`);
  redirect(`/safe${change === "home" ? "?home=1" : ""}`);
}
