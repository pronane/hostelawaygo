"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { endSession, startSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

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
  redirect(next);
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}
