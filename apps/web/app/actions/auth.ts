"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { demoLoginEnabled, endSession, getCurrentUser, startSession } from "@/lib/auth";
import { ACCOUNTS } from "@/lib/seed-extra";
import { hashPassword, verifyPassword } from "@/lib/password";
import { sendVerification } from "@/lib/verify";

const safeNext = (value: unknown): string => {
  const next = String(value ?? "/");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
};

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const user = getDb()
    .prepare("SELECT id, password_hash FROM travellers WHERE lower(email) = ?")
    .get<{ id: number; password_hash: string | null }>(email);

  if (!user || !verifyPassword(password, user.password_hash)) {
    redirect(`/login?error=credentials&next=${encodeURIComponent(next)}`);
  }

  await startSession(user.id);
  redirect(next);
}

export async function demoLoginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(formData.get("next"));

  // Previously this signed in as *any* account by email with no password -
  // including admin and hostel staff - and was live in production.
  if (!demoLoginEnabled()) redirect("/login?error=demo_off");
  if (!ACCOUNTS.some((a) => a.email.toLowerCase() === email)) redirect("/login?error=demo");

  const user = getDb()
    .prepare("SELECT id FROM travellers WHERE lower(email) = ?")
    .get<{ id: number }>(email);

  if (!user) redirect("/login?error=demo");
  await startSession(user.id);
  redirect(next);
}

export async function signupAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const flag = String(formData.get("flag") ?? "🌍").slice(0, 8) || "🌍";
  const next = safeNext(formData.get("next"));

  const fail = (code: string) =>
    redirect(`/signup?error=${code}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`);

  if (name.length < 2) fail("name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("email");
  if (password.length < 8) fail("password");

  const db = getDb();
  if (db.prepare("SELECT 1 AS x FROM travellers WHERE lower(email) = ?").get(email)) fail("taken");

  const info = db
    .prepare(
      `INSERT INTO travellers (name, initials, flag, colour, solo, languages, email, password_hash, role)
       VALUES (@name, @initials, @flag, @colour, 1, 'English', @email, @hash, 'traveller')`
    )
    .run({
      name,
      initials: initialsOf(name),
      flag,
      colour: "#FFD9A0",
      email,
      hash: hashPassword(password),
    });

  await startSession(info.lastInsertRowid);
  // Email the verification link now; chatting waits until it's clicked.
  try {
    await sendVerification(info.lastInsertRowid, email);
  } catch (err) {
    console.error("[signup] verification email failed", err);
  }
  redirect(next);
}

/**
 * For accounts that arrived through a provider: a password is a way back in if
 * the provider ever stops working for them. Only offered when there isn't one
 * already — changing an existing password is a different flow (verify the old
 * one first) and isn't built yet.
 */
export async function setPasswordAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/you");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) redirect("/you?password=short");
  if (password !== confirm) redirect("/you?password=mismatch");

  getDb().prepare("UPDATE travellers SET password_hash = ? WHERE id = ?").run(hashPassword(password), user.id);
  redirect("/you?password=set");
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}
