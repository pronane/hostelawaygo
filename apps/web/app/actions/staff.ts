"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { cancelEvent, clearReport, getEvent, getMessageHostel, hideMessage } from "@/lib/queries";

export async function cancelEventAction(formData: FormData) {
  const user = await getCurrentUser();
  const eventId = Number(formData.get("eventId"));
  if (!user) redirect(`/login?next=${encodeURIComponent("/hostel-admin")}`);
  if (!isStaff(user)) redirect("/?denied=staff");

  const event = getEvent(eventId, user.id);
  if (!event) redirect("/hostel-admin");
  if (user.role !== "admin" && event.hostel_id !== user.hostel_id) redirect("/hostel-admin?error=scope");

  cancelEvent(eventId);
  revalidatePath("/hostel-admin");
  revalidatePath("/");
  revalidatePath(`/event/${eventId}`);
  redirect("/hostel-admin?cancelled=1");
}

export async function hideMessageAction(formData: FormData) {
  const user = await getCurrentUser();
  const messageId = Number(formData.get("messageId"));
  const eventId = Number(formData.get("eventId"));
  if (!user) redirect(`/login?next=${encodeURIComponent("/hostel-admin")}`);
  if (!isStaff(user)) redirect("/?denied=staff");

  // Staff can only moderate chats on their own hostel's events.
  const hostelId = getMessageHostel(messageId);
  if (hostelId === undefined) redirect("/hostel-admin");
  if (user.role !== "admin" && hostelId !== user.hostel_id) redirect("/hostel-admin?error=scope");

  hideMessage(messageId);
  revalidatePath("/hostel-admin");
  revalidatePath(`/event/${eventId}`);
  redirect("/hostel-admin?hidden=1");
}

export async function clearReportAction(formData: FormData) {
  const user = await getCurrentUser();
  const messageId = Number(formData.get("messageId"));
  if (!user) redirect(`/login?next=${encodeURIComponent("/hostel-admin")}`);
  if (!isStaff(user)) redirect("/?denied=staff");

  // Staff can only moderate chats on their own hostel's events.
  const hostelId = getMessageHostel(messageId);
  if (hostelId === undefined) redirect("/hostel-admin");
  if (user.role !== "admin" && hostelId !== user.hostel_id) redirect("/hostel-admin?error=scope");

  clearReport(messageId);
  revalidatePath("/hostel-admin");
  redirect("/hostel-admin");
}
