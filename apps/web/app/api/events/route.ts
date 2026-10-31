import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createHostelEvent } from "@/lib/queries";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set(["food", "music", "social", "outdoors", "culture", "nightlife"]);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const startsAt = String(body.startsAt ?? "").trim();
  const category = String(body.category ?? "social");
  const description = String(body.description ?? "").trim();
  const priceCents = Number(body.priceCents ?? 0);

  if (title.length < 3 || title.length > 120) {
    return NextResponse.json({ error: "Title must be 3–120 characters" }, { status: 400 });
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startsAt)) {
    return NextResponse.json({ error: "startsAt must be HH:mm" }, { status: 400 });
  }
  if (!CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }
  if (!Number.isFinite(priceCents) || priceCents < 0 || priceCents > 100_000) {
    return NextResponse.json({ error: "Price must be between €0 and €1000" }, { status: 400 });
  }

  const id = createHostelEvent({ title, startsAt, priceCents, category, description });

  revalidatePath("/");
  revalidatePath("/next");
  revalidatePath("/post");
  revalidatePath(`/event/${id}`);

  return NextResponse.json({ id }, { status: 201 });
}
