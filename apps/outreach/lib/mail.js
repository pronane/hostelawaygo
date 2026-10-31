/**
 * Sending. Three transports, chosen by OUTREACH_MAIL_TRANSPORT:
 *
 *   file   (default) — write a .eml to outbox/. Nothing leaves the machine.
 *   resend           — POST to Resend's REST API, same as the product's mailer.
 *   http             — POST the payload to OUTREACH_MAIL_URL. Used by the tests,
 *                      and by anyone who wants the bot behind their own relay.
 *
 * The List-Unsubscribe headers are built here rather than in the letter, so
 * every transport carries them and no template can forget them.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

const addressOf = (from) => {
  const match = /<([^>]+)>/.exec(from ?? "");
  return (match?.[1] ?? from ?? "hello@away.app").trim();
};

export function headersFor({ to, unsubUrl, replyTo = config.sender.replyTo }) {
  const headers = {};
  if (unsubUrl) {
    headers["list-unsubscribe"] = `<${unsubUrl}>, <mailto:${replyTo}?subject=unsubscribe>`;
    // RFC 8058: the mailbox provider can unsubscribe with one POST.
    headers["list-unsubscribe-post"] = "List-Unsubscribe=One-Click";
  }
  headers["auto-submitted"] = "auto-generated";
  headers["x-outreach-to"] = to;
  return headers;
}

export async function sendMail({ to, subject, text, html, unsubUrl, tags = {} }) {
  const transport = config.mail.transport;
  const headers = headersFor({ to, unsubUrl });

  if (transport === "resend") {
    return sendResend({ to, subject, text, html, headers, tags });
  }
  if (transport === "http") {
    return sendHttp({ to, subject, text, html, headers, tags });
  }
  return sendFile({ to, subject, text, html, headers });
}

async function sendResend({ to, subject, text, html, headers }) {
  if (!config.mail.resendKey) return { ok: false, transport: "resend", error: "RESEND_API_KEY is not set" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.mail.resendKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: config.sender.from,
        to: [to],
        reply_to: config.sender.replyTo,
        subject,
        text,
        ...(html ? { html } : {}),
        headers,
        tags: Object.entries({ kind: "outreach", ...(tags ?? {}) }).map(([name, value]) => ({ name, value: String(value) })),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, transport: "resend", error: `${response.status} ${payload?.message ?? ""}`.trim() };
    }
    return { ok: true, transport: "resend", id: payload?.id ?? "" };
  } catch (error) {
    return { ok: false, transport: "resend", error: String(error?.message ?? error) };
  }
}

async function sendHttp({ to, subject, text, html, headers, tags }) {
  if (!config.mail.captureUrl) return { ok: false, transport: "http", error: "OUTREACH_MAIL_URL is not set" };
  try {
    const response = await fetch(config.mail.captureUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: config.sender.from,
        replyTo: config.sender.replyTo,
        to,
        subject,
        text,
        html,
        headers,
        tags,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, transport: "http", error: `${response.status}`, id: payload?.id ?? "" };
    return { ok: true, transport: "http", id: payload?.id ?? "" };
  } catch (error) {
    return { ok: false, transport: "http", error: String(error?.message ?? error) };
  }
}

/**
 * A real message file: open it in any client to see exactly what would land.
 * Named so the outbox sorts chronologically.
 */
async function sendFile({ to, subject, text, html, headers }) {
  try {
    await mkdir(config.mail.outbox, { recursive: true });
    const id = `local-${randomUUID().slice(0, 8)}`;
    const messageId = `<${id}@${addressOf(config.sender.from).split("@")[1] ?? "away.app"}>`;
    const headerLines = [
      `From: ${config.sender.from}`,
      `To: ${to}`,
      `Reply-To: ${config.sender.replyTo}`,
      `Subject: ${subject.replace(/[\r\n]+/g, " ")}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${messageId}`,
      `MIME-Version: 1.0`,
      ...Object.entries(headers)
        .filter(([key]) => !["auto-submitted", "x-outreach-to"].includes(key))
        .map(([key, value]) => `${key.replace(/(^|-)([a-z])/g, (_, dash, letter) => dash + letter.toUpperCase())}: ${value}`),
    ];

    let body;
    if (html) {
      const boundary = `away-${randomUUID().slice(0, 8)}`;
      headerLines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      body = [
        `--${boundary}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        text,
        "",
        `--${boundary}`,
        "Content-Type: text/html; charset=utf-8",
        "",
        html,
        "",
        `--${boundary}--`,
      ].join("\r\n");
    } else {
      headerLines.push("Content-Type: text/plain; charset=utf-8");
      body = text;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeTo = to.replace(/[^a-z0-9@._-]/gi, "_");
    const file = join(config.mail.outbox, `${stamp}-${safeTo}.eml`);
    await writeFile(file, `${headerLines.join("\r\n")}\r\n\r\n${body}`, "utf8");
    return { ok: true, transport: "file", id: file };
  } catch (error) {
    return { ok: false, transport: "file", error: String(error?.message ?? error) };
  }
}
