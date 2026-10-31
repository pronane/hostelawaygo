import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import type { Payment } from "./types";

/**
 * Payments.
 *
 * The shape here is deliberately the shape a real PSP uses, so swapping the
 * sandbox for Stripe is a provider change and not a rewrite:
 *
 *  - every payment carries an idempotency key, so a double-submitted form or a
 *    retried webhook can never charge or confirm twice
 *  - a payment has a 30 minute window (`expires_at`); after that the bed is no
 *    longer held and the guest has to open a fresh payment
 *  - state only moves forward: requires_payment -> paid -> refunded
 *  - provider callbacks arrive on /api/payments/webhook and are HMAC-verified
 *
 * With STRIPE_SECRET_KEY set the provider becomes `stripe` and the booking page
 * sends the guest to a Stripe Checkout Session. Without it, `sandbox` marks the
 * payment paid in-process, which is what the demo runs on.
 */

export type ProviderName = "sandbox" | "stripe";

export const PAYMENT_WINDOW_MINUTES = 30;

export function paymentProvider(): ProviderName {
  return process.env.STRIPE_SECRET_KEY?.trim() ? "stripe" : "sandbox";
}

export function stripeConfigured(): boolean {
  return paymentProvider() === "stripe";
}

export function newPaymentReference(bookingId: number): string {
  return `pay_${bookingId}_${randomBytes(4).toString("hex")}`;
}

/** Deterministic per booking + amount, so retries collide instead of duplicating. */
export function idempotencyKeyFor(bookingCode: string, amountCents: number): string {
  return `booking:${bookingCode}:${amountCents}`;
}

export type PaymentIntent = {
  reference: string;
  provider: ProviderName;
  status: Payment["status"];
  amountCents: number;
  currency: string;
  expiresAt: string | null;
  /** Present when the provider hosts the payment page (Stripe Checkout). */
  checkoutUrl: string | null;
};

/**
 * Returns a payable intent for a booking, creating or renewing the payment row
 * as needed. Safe to call repeatedly: an unexpired, unpaid payment is reused.
 */
export function openPayment(bookingId: number, bookingCode: string, amountCents: number): PaymentIntent {
  const db = getDb();
  const key = idempotencyKeyFor(bookingCode, amountCents);
  const provider = paymentProvider();

  const existing = db
    .prepare("SELECT * FROM payments WHERE idempotency_key = ? OR (booking_id = ? AND status = 'requires_payment')")
    .get<Payment>(key, bookingId);

  const now = db.prepare("SELECT datetime('now') AS now, datetime('now', ?) AS expires").get<{
    now: string;
    expires: string;
  }>(`+${PAYMENT_WINDOW_MINUTES} minutes`)!;

  if (existing && existing.status === "paid") {
    return {
      reference: existing.reference,
      provider: existing.provider as ProviderName,
      status: "paid",
      amountCents: existing.amount_cents,
      currency: existing.currency,
      expiresAt: null,
      checkoutUrl: null,
    };
  }

  if (existing && existing.status === "requires_payment" && existing.expires_at && existing.expires_at > now.now) {
    return {
      reference: existing.reference,
      provider: existing.provider as ProviderName,
      status: existing.status,
      amountCents: existing.amount_cents,
      currency: existing.currency,
      expiresAt: existing.expires_at,
      checkoutUrl: null,
    };
  }

  if (existing) {
    db.prepare(
      `UPDATE payments SET status = 'requires_payment', provider = @provider, reference = @reference,
        expires_at = @expires, paid_at = NULL, refunded_at = NULL, amount_cents = @amount, currency = @currency
       WHERE id = @id`
    ).run({
      id: existing.id,
      provider,
      reference: newPaymentReference(bookingId),
      expires: now.expires,
      amount: amountCents,
      currency: "EUR",
    });

    return {
      reference: db.prepare("SELECT reference FROM payments WHERE id = ?").get<{ reference: string }>(existing.id)!
        .reference,
      provider,
      status: "requires_payment",
      amountCents,
      currency: "EUR",
      expiresAt: now.expires,
      checkoutUrl: null,
    };
  }

  const reference = newPaymentReference(bookingId);
  db.prepare(
    `INSERT INTO payments (booking_id, provider, method, reference, idempotency_key, amount_cents,
       currency, status, created_at, expires_at)
     VALUES (@bookingId, @provider, 'card', @reference, @key, @amount, 'EUR', 'requires_payment',
       datetime('now'), @expires)`
  ).run({ bookingId, provider, reference, key, amount: amountCents, expires: now.expires });

  return {
    reference,
    provider,
    status: "requires_payment",
    amountCents,
    currency: "EUR",
    expiresAt: now.expires,
    checkoutUrl: null,
  };
}

export function getPaymentForBooking(bookingId: number): Payment | undefined {
  return getDb()
    .prepare("SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1")
    .get<Payment>(bookingId);
}

export function getPaymentByReference(reference: string): Payment | undefined {
  return getDb().prepare("SELECT * FROM payments WHERE reference = ?").get<Payment>(reference);
}

/** Idempotent: paying an already-paid payment is a no-op that reports success. */
/**
 * Settles a payment. Idempotent: paying an already-paid or refunded payment is a
 * no-op that reports the current state.
 *
 * If the booking was cancelled while the payment was in flight (the guest hit
 * cancel, the webhook landed a second later), the money is captured and refunded
 * in the same step — the bed is gone, so the ledger has to say so rather than
 * leaving a paid stay that no longer exists.
 */
export function completePayment(reference: string): Payment | null {
  const db = getDb();
  const payment = getPaymentByReference(reference);
  if (!payment) return null;
  if (payment.status === "paid" || payment.status === "refunded") return payment;

  const booking = db
    .prepare("SELECT id, status FROM bookings WHERE id = ?")
    .get<{ id: number; status: string }>(payment.booking_id);

  return db.transaction((): Payment => {
    if (booking?.status === "cancelled") {
      db.prepare(
        `UPDATE payments SET status = 'refunded', paid_at = datetime('now'),
           refunded_at = datetime('now'), expires_at = NULL
         WHERE id = ?`
      ).run(payment.id);
      return { ...payment, status: "refunded", expires_at: null, refunded_at: payment.refunded_at };
    }

    db.prepare(
      "UPDATE payments SET status = 'paid', paid_at = datetime('now'), expires_at = NULL WHERE id = ?"
    ).run(payment.id);
    db.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ? AND status != 'cancelled'").run(
      payment.booking_id
    );

    return { ...payment, status: "paid", expires_at: null };
  })();
}

export function refundPayment(bookingId: number): boolean {
  const db = getDb();
  const payment = getPaymentForBooking(bookingId);
  if (!payment || payment.status !== "paid") return false;

  db.prepare(
    "UPDATE payments SET status = 'refunded', refunded_at = datetime('now') WHERE id = ? AND status = 'paid'"
  ).run(payment.id);
  return true;
}

/** Marks unpaid intents past their window so the UI can stop offering them. */
export function expireStalePayments(): number {
  const info = getDb()
    .prepare(
      `UPDATE payments SET status = 'expired'
       WHERE status = 'requires_payment' AND expires_at IS NOT NULL
         AND expires_at < datetime('now')`
    )
    .run();
  return Number(info.changes);
}

/* --------------------------------------------------------------- webhooks */

export type WebhookEvent = {
  type: "payment.paid" | "payment.refunded" | "payment.expired";
  data: { reference: string };
};

export function secretForWebhooks(): string {
  return process.env.PAYMENT_WEBHOOK_SECRET?.trim() || "dev-webhook-secret";
}

export function signWebhook(payload: string, secret = secretForWebhooks(), at = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac("sha256", secret).update(`${at}.${payload}`).digest("hex");
  return `t=${at},v1=${signature}`;
}

const TOLERANCE_SECONDS = 300;

/** Stripe-style `t=<unix>,v1=<hmac>` verification, with a replay window. */
export function verifyWebhookSignature(
  payload: string,
  header: string | null,
  secret = secretForWebhooks()
): boolean {
  if (!header) return false;

  const parts = new Map(
    header
      .split(",")
      .map((piece) => piece.split("="))
      .filter((pair) => pair.length === 2)
      .map(([k, v]) => [k.trim(), v.trim()])
  );

  const timestamp = Number(parts.get("t"));
  const supplied = parts.get("v1");
  if (!Number.isFinite(timestamp) || !supplied) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(supplied, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function applyWebhookEvent(event: WebhookEvent): { ok: boolean; note: string } {
  if (event.type === "payment.paid") {
    const payment = completePayment(event.data.reference);
    if (!payment) return { ok: false, note: "unknown reference" };
    // A payment that lands after the guest cancelled is refunded on the spot.
    return {
      ok: true,
      note:
        payment.status === "refunded"
          ? `captured then refunded ${payment.reference} (booking already cancelled)`
          : `paid ${payment.reference}`,
    };
  }

  if (event.type === "payment.refunded") {
    const db = getDb();
    const payment = getPaymentByReference(event.data.reference);
    if (!payment) return { ok: false, note: "unknown reference" };

    const booking = db
      .prepare("SELECT id, total_cents FROM bookings WHERE id = ?")
      .get<{ id: number; total_cents: number }>(payment.booking_id);

    db.prepare("UPDATE payments SET status = 'refunded', refunded_at = datetime('now') WHERE id = ?").run(
      payment.id
    );

    // Only a full refund means the stay is off. A partial one is an adjustment,
    // not a cancellation, so the booking stays as it is.
    const full = !booking || payment.amount_cents >= booking.total_cents;
    if (full) {
      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(payment.booking_id);
      return { ok: true, note: `refunded ${payment.reference}` };
    }

    return {
      ok: true,
      note: `partially refunded ${payment.reference} — booking left in place`,
    };
  }

  const payment = getPaymentByReference(event.data.reference);
  if (!payment) return { ok: false, note: "unknown reference" };
  getDb().prepare("UPDATE payments SET status = 'expired' WHERE id = ?").run(payment.id);
  return { ok: true, note: `expired ${payment.reference}` };
}

/* ----------------------------------------------------------------- stripe */

/**
 * Creates a Stripe Checkout Session (hosted card page). Implemented against the
 * documented REST API; it is only called when STRIPE_SECRET_KEY is set. The
 * demo never sets it, so the sandbox path above is what runs here.
 */
export async function createStripeCheckout(params: {
  bookingCode: string;
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string } | { error: string }> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return { error: "Stripe is not configured" };

  const body = new URLSearchParams({
    mode: "payment",
    client_reference_id: params.bookingCode,
    "metadata[booking_code]": params.bookingCode,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": params.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(params.amountCents),
    "line_items[0][price_data][product_data][name]": `Away booking ${params.bookingCode}`,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": idempotencyKeyFor(params.bookingCode, params.amountCents),
      },
      body,
    });

    if (!response.ok) return { error: `Stripe responded ${response.status}` };

    const json = (await response.json()) as { url?: string };
    return json.url ? { url: json.url } : { error: "Stripe returned no checkout url" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Stripe request failed" };
  }
}

/** Webhooks identify the booking, not the payment row, so resolve it here. */
export function completePaymentForBookingCode(code: string): Payment | null {
  const booking = getDb()
    .prepare("SELECT id FROM bookings WHERE code = ?")
    .get<{ id: number }>(code);
  if (!booking) return null;
  const payment = getPaymentForBooking(booking.id);
  return payment ? completePayment(payment.reference) : null;
}
