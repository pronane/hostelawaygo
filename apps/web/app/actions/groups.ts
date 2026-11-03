"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { addGroupMember, createGroup, getGroup } from "@/lib/groups";
import { getEvent } from "@/lib/queries";

/**
 * Making a group is one tap on an event you are already looking at: how many of
 * you, and what you are calling it. The result is a link you paste into the
 * group chat — which is the only distribution channel a hostel group actually
 * uses at 19:00.
 */
export async function createGroupAction(formData: FormData) {
  const eventId = Number(formData.get("eventId"));
  const event = Number.isInteger(eventId) ? await getEvent(eventId, null) : null;
  if (!event) redirect("/");

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/event/${eventId}`)}`);

  const size = Number(formData.get("size") ?? 2);
  const plan = String(formData.get("plan") ?? "").trim().slice(0, 80);
  const token = await createGroup({
    eventId,
    travellerId: user.id,
    organiserName: user.name.split(" ")[0] || user.name,
    plan: plan || `${event.title}`,
    size: Number.isFinite(size) ? size : 2,
  });

  revalidatePath(`/event/${eventId}`);
  redirect(`/g/${token}?created=1`);
}

/**
 * Joining is the whole point: a first name, one tap, no account. Signing in
 * later links the row to the account instead of adding a second one.
 */
export async function joinGroupAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const group = await getGroup(token);
  if (!group) redirect("/");

  const user = await getCurrentUser();
  const typed = String(formData.get("name") ?? "").trim().slice(0, 40);
  const name = user ? user.name.split(" ")[0] || user.name : typed;
  if (!name) redirect(`/g/${token}?error=name`);

  const { added } = await addGroupMember({
    groupId: group.id,
    name,
    travellerId: user?.id ?? null,
  });

  revalidatePath(`/g/${token}`);
  revalidatePath(`/event/${group.event_id}`);
  redirect(`/g/${token}?${added ? "in=1" : "already=1"}`);
}
