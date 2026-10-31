"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { addMessage, getEvent, recentMessageCount, reportMessage } from "@/lib/queries";

/** Chat rate limit. Keep in step with the README ("8 messages per 10 minutes"). */
const CHAT_LIMIT = 8;
const CHAT_WINDOW_MINUTES = 10;

export async function sendMessageAction(formData: FormData) {
  const eventId = Number(formData.get("eventId"));
  const body = String(formData.get("body") ?? "").trim();
  const path = `/event/${eventId}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!getEvent(eventId, user.id)) redirect("/");
  // Event chats are where strangers meet - require a confirmed email first.
  if (!user.email_verified) redirect(`${path}?chat=verify#chat`);
  if (!body) redirect(`${path}#chat`);
  if (recentMessageCount(user.id, CHAT_WINDOW_MINUTES) >= CHAT_LIMIT) {
    redirect(`${path}?chat=slow#chat`);
  }

  addMessage(eventId, user.id, body);

  // No redirect: the chat is live over SSE, so the message shows up on its own
  // and the form resets without the page re-navigating.
  revalidatePath(path);
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
