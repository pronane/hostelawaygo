import { NextResponse } from "next/server";
import { activateSubscription, cancelSubscription } from "@/lib/billing";
import { getDb } from "@/lib/db";
import {
  applyWebhookEvent,
  completePaymentForBookingCode,
  verifyWebhookSignature,
  type WebhookEvent,
} from "@/lib/payments";

export const dynamic = "force-dynamic";

type StripeEvent = {
  type: string;
  data?: {
    object?: {
      client_reference_id?: string | null;
      id?: string | null;
      subscription?: string | null;
      metadata?: { hostel_id?: string } | null;
    };
  };
};

type PaymentEvent = WebhookEvent & { id?: string };

/**
 * Provider callbacks.
 *
 *  - `payment.paid` / `payment.refunded` / `payment.expired`: our own shape, used
 *    by the sandbox and by anything else we plug in later.
 *  - `checkout.session.completed`: Stripe's shape, matched back to a booking
 *    through `client_reference_id`.
 *
 * Everything must arrive signed (`t=<unix>,v1=<hmac-sha256>`); unsigned or stale
 * requests are rejected. Handlers are idempotent, so a retried delivery is safe.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature") ?? request.headers.get("x-away-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: PaymentEvent | StripeEvent;
  try {
    payload = JSON.parse(raw) as PaymentEvent | StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if ("type" in payload && payload.type === "checkout.session.completed") {
    const code = payload.data?.object?.client_reference_id ?? null;

    // One endpoint, two products: a booking reference looks like `pay_…`, a
    // subscription like `sub_…`. Pro is only ever switched on here — never by
    // the browser coming back to a success page.
    if (code?.startsWith("sub_")) {
      const result = await activateSubscription(code, "month", "stripe");
      return NextResponse.json(result, { status: result.ok ? 200 : 404 });
    }

    const payment = code ? await completePaymentForBookingCode(code) : null;
    return payment
      ? NextResponse.json({ ok: true, note: `paid ${payment.reference}` })
      : NextResponse.json({ ok: false, note: "unknown booking" }, { status: 404 });
  }

  if ("type" in payload && payload.type === "customer.subscription.deleted") {
    const object = payload.data?.object;
    const hostelId = Number(object?.metadata?.hostel_id ?? 0);
    const reference = object?.client_reference_id ?? null;
    const hostel =
      hostelId ||
      (reference
        ? (
            await getDb()
              .prepare("SELECT hostel_id FROM billing_events WHERE reference = ? ORDER BY id DESC LIMIT 1")
              .get<{ hostel_id: number }>(reference)
          )?.hostel_id ?? 0
        : 0);
    if (!hostel) return NextResponse.json({ ok: false, note: "unknown subscription" }, { status: 404 });
    const result = await cancelSubscription(hostel, "Stripe");
    return NextResponse.json(result);
  }

  const event = payload as PaymentEvent;
  if (!event.type || !event.data?.reference) {
    return NextResponse.json({ error: "Unsupported event" }, { status: 422 });
  }

  const result = await applyWebhookEvent(event);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}

export async function GET() {
  return NextResponse.json({
    endpoint: "payments webhook",
    accepts: ["payment.paid", "payment.refunded", "payment.expired", "checkout.session.completed"],
    signature: "t=<unix>,v1=<hmac-sha256 of `${t}.${body}`>",
    secretConfigured: Boolean(process.env.PAYMENT_WEBHOOK_SECRET),
    secretFallbackInUse: !process.env.PAYMENT_WEBHOOK_SECRET,
  });
}
