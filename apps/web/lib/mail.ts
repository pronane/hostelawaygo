/**
 * Transactional email. Sends through Resend's REST API when RESEND_API_KEY is
 * set (no SDK needed). Without a key nothing is sent, and the caller gets the
 * link back so development can show it on screen instead.
 */
export type MailResult = { sent: boolean };

export function mailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendMail(
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "Away <hello@away.app>",
      to: [to],
      subject,
      text,
      ...(html ? { html } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error("[mail] send failed", res.status, await res.text().catch(() => ""));
    return { sent: false };
  }
  return { sent: true };
}

/** Public base URL for links in emails. */
export function appUrl(fallbackOrigin?: string): string {
  return (process.env.APP_URL ?? fallbackOrigin ?? "http://localhost:3000").replace(/\/$/, "");
}
