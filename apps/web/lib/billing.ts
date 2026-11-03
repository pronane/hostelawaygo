import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { appUrl } from "./constants";
import { PRICE_CENTS, renewalDate, type Interval } from "./plans";
import { todayISO } from "./time";

/**
 * Subscriptions, in the same shape as the booking payments in `lib/payments.ts`.
 *
 * With `STRIPE_SECRET_KEY` set, a hostel is sent to a real Stripe Checkout
 * Session and Pro is switched on by the signed webhook, never by the browser
 * coming back to a success page. Without it, the provider is `sandbox`: a
 * checkout page on this machine that says so, marks the hostel Pro and records
 * exactly the same `billing_events` row. The demo has to be able to show the
 * gate without a Stripe account, and the difference between the two providers
 * is one button.
 */

export type BillingProvider = "sandbox" | "stripe";

export function billingProvider(): BillingProvider {
  return process.env.STRIPE_SECRET_KEY?.trim() ? "stripe" : "sandbox";
}

export function stripeConfigured(): boolean {
  return billingProvider() === "stripe";
}

export type Checkout = { ok: true; url: string; reference: string } | { ok: false; error: string };

function reference(hostelId: number): string {
  return `sub_${hostelId}_${randomBytes(5).toString("hex")}`;
}

async function record(input: {
  hostelId: number;
  kind: "checkout" | "activated" | "cancelled" | "expired" | "renewed";
  plan: "free" | "pro";
  interval: Interval;
  amountCents: number;
  provider: BillingProvider;
  reference: string;
  note?: string;
}): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO billing_events (hostel_id, kind, plan, interval, amount_cents, provider, reference, note)
       VALUES (@hostelId, @kind, @plan, @interval, @amountCents, @provider, @reference, @note)`
    )
    .run({ ...input, note: input.note ?? "" });
}

/**
 * Starts a subscription. Returns where to send the person who pressed the
 * button — Stripe's hosted page, or ours in sandbox mode.
 */
export async function startSubscription(
  hostel: { id: number; name: string; contact_email?: string | null },
  interval: Interval
): Promise<Checkout> {
  const provider = billingProvider();
  const ref = reference(hostel.id);
  const amountCents = PRICE_CENTS[interval];

  await record({
    hostelId: hostel.id,
    kind: "checkout",
    plan: "pro",
    interval,
    amountCents,
    provider,
    reference: ref,
    note: `${hostel.name} · ${interval}`,
  });

  if (provider === "sandbox") {
    return { ok: true, url: `/billing/sandbox/${ref}`, reference: ref };
  }

  const base = appUrl();
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", `${base}/hostel-admin?billing=activated`);
  body.set("cancel_url", `${base}/pricing?billing=cancelled`);
  body.set("client_reference_id", ref);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "eur");
  body.set("line_items[0][price_data][unit_amount]", String(amountCents));
  body.set("line_items[0][price_data][recurring][interval]", interval === "year" ? "year" : "month");
  body.set("line_items[0][price_data][product_data][name]", `Away Pro — ${hostel.name}`);
  if (hostel.contact_email) body.set("customer_email", hostel.contact_email);

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
    if (!res.ok || !json.url) {
      return { ok: false, error: json.error?.message ?? `Stripe refused the session (${res.status})` };
    }
    return { ok: true, url: json.url, reference: ref };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Stripe is unreachable" };
  }
}

/** Switches Pro on. Idempotent: activating twice does not double a renewal. */
export async function activateSubscription(
  referenceOrHostelId: string | number,
  interval: Interval = "month",
  provider: BillingProvider = billingProvider()
): Promise<{ ok: boolean; hostelId?: number; note: string }> {
  const db = getDb();
  const hostelId =
    typeof referenceOrHostelId === "number"
      ? referenceOrHostelId
      : (
          await db
            .prepare("SELECT hostel_id FROM billing_events WHERE reference = ? AND kind = 'checkout' ORDER BY id DESC LIMIT 1")
            .get<{ hostel_id: number }>(referenceOrHostelId)
        )?.hostel_id ?? null;

  if (!hostelId) return { ok: false, note: "no checkout for that reference" };

  const hostel = await db
    .prepare("SELECT id, name, plan, plan_renews_on FROM hostels WHERE id = ?")
    .get<{ id: number; name: string; plan: string; plan_renews_on: string | null }>(hostelId);
  if (!hostel) return { ok: false, note: "no such hostel" };

  // Already paid up: only extend if this is a fresh checkout, never a retry.
  const already = hostel.plan === "pro" && (hostel.plan_renews_on ?? "") >= todayISO();
  const reference = typeof referenceOrHostelId === "string" ? referenceOrHostelId : "manual";
  const used = await db
    .prepare("SELECT 1 AS x FROM billing_events WHERE reference = ? AND kind = 'activated'")
    .get(reference);
  if (used) return { ok: true, hostelId, note: "already activated" };

  const renews = renewalDate(interval);
  await db
    .prepare(
      `UPDATE hostels SET plan = 'pro', plan_interval = @interval, plan_since = COALESCE(plan_since, @today),
         plan_renews_on = @renews, plan_cancelled = 0
       WHERE id = @id`
    )
    .run({ id: hostelId, interval, today: todayISO(), renews });

  await record({
    hostelId,
    kind: "activated",
    plan: "pro",
    interval,
    amountCents: PRICE_CENTS[interval],
    provider,
    reference,
    note: already ? "renewed" : "first month",
  });

  return { ok: true, hostelId, note: `${hostel.name} is on Pro until ${renews}` };
}

/**
 * Cancelling keeps Pro until the date already paid for. It is one click and it
 * does not require an email to anybody — the promise made on /pricing.
 */
export async function cancelSubscription(hostelId: number, by = "the hostel"): Promise<{ ok: boolean; note: string }> {
  const db = getDb();
  const hostel = await db
    .prepare("SELECT id, name, plan, plan_renews_on FROM hostels WHERE id = ?")
    .get<{ id: number; name: string; plan: string; plan_renews_on: string | null }>(hostelId);
  if (!hostel) return { ok: false, note: "no such hostel" };
  if (hostel.plan !== "pro") return { ok: true, note: "already on the free plan" };

  await db.prepare("UPDATE hostels SET plan_cancelled = 1 WHERE id = ?").run(hostelId);
  await record({
    hostelId,
    kind: "cancelled",
    plan: "pro",
    interval: "month",
    amountCents: 0,
    provider: billingProvider(),
    reference: `cancel_${hostelId}`,
    note: `cancelled by ${by}; Pro until ${hostel.plan_renews_on ?? "now"}`,
  });

  return { ok: true, note: `Pro stays on until ${hostel.plan_renews_on ?? "today"}` };
}

/** Brings a lapsed subscription down to free, and says so in the log. */
export async function settleLapsed(): Promise<number> {
  const db = getDb();
  const today = todayISO();
  const lapsed = await db
    .prepare("SELECT id, name FROM hostels WHERE plan = 'pro' AND plan_renews_on IS NOT NULL AND plan_renews_on < ?")
    .all<{ id: number; name: string }>(today);

  for (const hostel of lapsed) {
    await db.prepare("UPDATE hostels SET plan = 'free', plan_cancelled = 0 WHERE id = ?").run(hostel.id);
    await record({
      hostelId: hostel.id,
      kind: "expired",
      plan: "free",
      interval: "month",
      amountCents: 0,
      provider: billingProvider(),
      reference: `expire_${hostel.id}`,
      note: `${hostel.name} lapsed`,
    });
  }

  return lapsed.length;
}

export async function billingHistory(hostelId: number, limit = 12) {
  return getDb()
    .prepare(
      `SELECT id, kind, plan, interval, amount_cents, provider, reference, note, created_at
       FROM billing_events WHERE hostel_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all<{
      id: number;
      kind: string;
      plan: string;
      interval: string;
      amount_cents: number;
      provider: string;
      reference: string;
      note: string;
      created_at: string;
    }>(hostelId, limit);
}
