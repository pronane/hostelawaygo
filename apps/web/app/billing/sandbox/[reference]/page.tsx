import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { confirmSandboxAction } from "@/app/actions/billing";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { getDb } from "@/lib/db";
import { renewalDate, type Interval } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sandbox checkout", robots: { index: false } };

type Props = { params: Promise<{ reference: string }> };

/**
 * The sandbox checkout.
 *
 * It exists so the gate can be demonstrated without a Stripe account — and so
 * that the shape of the real thing (a hosted page, then a signed callback) is
 * obvious rather than implied. No card, no charge, and it says so twice.
 */
export default async function SandboxCheckout({ params }: Props) {
  const { reference } = await params;
  const user = await getCurrentUser();
  if (!isStaff(user)) redirect(`/login?next=/billing/sandbox/${reference}`);

  const checkout = await getDb()
    .prepare(
      `SELECT b.reference, b.interval, b.amount_cents, h.id AS hostel_id, h.name, h.slug
       FROM billing_events b JOIN hostels h ON h.id = b.hostel_id
       WHERE b.reference = ? AND b.kind = 'checkout'`
    )
    .get<{ reference: string; interval: string; amount_cents: number; hostel_id: number; name: string; slug: string }>(
      reference
    );

  if (!checkout) notFound();
  if (user!.role !== "admin" && user!.hostel_id !== checkout.hostel_id) redirect("/hostel-admin");

  const interval = (checkout.interval === "year" ? "year" : "month") as Interval;

  return (
    <div style={{ maxWidth: 560 }}>
      <header className="page-head">
        <div className="eyebrow">Sandbox checkout · no card</div>
        <h1 className="page-title">Away Pro</h1>
        <p className="page-sub">
          {checkout.name} · {formatPrice(checkout.amount_cents)} per {interval} · first renewal{" "}
          {renewalDate(interval)}
        </p>
      </header>

      <div className="panel">
        <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6 }}>
          This deployment has no <code>STRIPE_SECRET_KEY</code>, so this page stands in for the
          hosted one. Pressing the button marks the hostel Pro and writes the same
          <code> billing_events </code> row a real payment would — nothing is charged, and no card
          details are involved anywhere in this app.
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "#7b6e64", lineHeight: 1.6 }}>
          Set <code>STRIPE_SECRET_KEY</code> and the same button sends you to Stripe Checkout
          instead, and only Stripe&apos;s signed webhook can switch Pro on.
        </p>
      </div>

      <div className="cta-row">
        <form action={confirmSandboxAction} style={{ flex: 1 }}>
          <input type="hidden" name="reference" value={reference} />
          <input type="hidden" name="interval" value={interval} />
          <button type="submit" className="btn primary" style={{ width: "100%" }}>
            Confirm — start Pro
          </button>
        </form>
        <Link href="/pricing?billing=cancelled" className="btn">
          Not now
        </Link>
      </div>
    </div>
  );
}
