"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { addMessage, getEvent, recentMessageCount, reportMessage } from "@/lib/queries";

export async function sendMessageAction(formData: FormData) {
  const eventId = Number(formData.get("eventId"));
  const body = String(formData.get("body") ?? "").trim();
  const path = `/event/${eventId}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!getEvent(eventId, user.id)) redirect("/");
  if (!body) redirect(`${path}#chat`);
  if (recentMessageCount(user.id) >= 8) redirect(`${path}?chat=slow#chat`);

  addMessage(eventId, user.id, body);
  revalidatePath(path);
  redirect(`${path}#chat`);
}

export async function reportMessageAction(formData: FormData) {
  const messageId = Number(formData.get("messageId"));
  const eventId = Number(formData.get("eventId"));
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/event/${eventId}`)}`);

  reportMessage(messageId);
  revalidatePath(`/event/${eventId}`);
  redirect(`/event/${eventId}?chat=reported#chat`);
}
