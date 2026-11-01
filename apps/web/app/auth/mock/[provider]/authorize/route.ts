import { issueMockCode, resetMockState } from "@/lib/oauth-mock";
import { mockEnabled, publicOrigin } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/**
 * The stand-in consent screen. Development only — see lib/oauth-mock.ts.
 *
 * It deliberately looks like a consent screen rather than part of Away, because
 * that's what it is: a stand-in for the thing Google shows, so the redirect,
 * the code exchange and the JWKS verification can be exercised locally.
 */

const LABELS: Record<string, { name: string; colour: string; account: string }> = {
  google: { name: "Google", colour: "#1a73e8", account: "you@gmail.com" },
  facebook: { name: "Facebook", colour: "#1877f2", account: "you@facebook.com" },
  apple: { name: "Apple", colour: "#111111", account: "you@icloud.com" },
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (!mockEnabled()) return new Response("Not found", { status: 404 });

  const { provider } = await params;
  const theme = LABELS[provider];
  if (!theme) return new Response("Unknown provider", { status: 400 });

  const url = new URL(request.url);
  const query = url.searchParams;
  const origin = publicOrigin(request);
  const redirectUri = query.get("redirect_uri") ?? "";
  const allowed = redirectUri.startsWith(`${origin}/auth/`) || query.get("allow_any") === "1";

  if (!allowed) return new Response("redirect_uri is not on this site", { status: 400 });

  const state = query.get("state") ?? "";
  const defaults = `mock.${provider}@away.app`;

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Sign in with ${theme.name} (mock)</title>
<style>
  :root { color-scheme: light; }
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f1f3f4;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#202124}
  .card{background:#fff;border-radius:18px;padding:28px;width:min(420px,92vw);box-shadow:0 1px 3px rgba(60,64,67,.18),0 8px 30px rgba(60,64,67,.08)}
  .badge{display:inline-flex;align-items:center;gap:8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5f6368;margin-bottom:16px}
  .dot{width:10px;height:10px;border-radius:50%;background:${theme.colour}}
  h1{font-size:21px;margin:0 0 6px;letter-spacing:-.01em}
  p{font-size:13.5px;line-height:1.55;color:#5f6368;margin:0 0 18px}
  label{display:block;font-size:12px;font-weight:600;color:#3c4043;margin:0 0 5px}
  input[type=text],input[type=email]{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #dadce0;border-radius:10px;font:inherit;font-size:14px}
  .field{margin-bottom:14px}
  .check{display:flex;gap:9px;align-items:flex-start;font-size:13px;color:#5f6368;margin:2px 0 18px}
  .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:8px}
  button{font:inherit;font-weight:600;font-size:14px;padding:10px 18px;border-radius:999px;border:1px solid #dadce0;background:#fff;color:#1a73e8;cursor:pointer}
  button.primary{background:${theme.colour};border-color:${theme.colour};color:#fff}
  .note{margin-top:18px;padding-top:14px;border-top:1px solid #eceff1;font-size:11.5px;color:#80868b;line-height:1.5}
  code{background:#f1f3f4;padding:1px 5px;border-radius:4px}
</style></head>
<body>
<form class="card" method="post" action="/auth/mock/${provider}/authorize">
  <div class="badge"><span class="dot"></span> ${theme.name} · mock consent</div>
  <h1>Sign in with ${theme.name}</h1>
  <p>This stands in for ${theme.name}'s real consent screen so the flow can be tested locally. It only exists when <code>OAUTH_MOCK=1</code>, and the tokens it signs are verified by exactly the same code that verifies the real thing.</p>

  <div class="field"><label for="email">Email</label>
    <input id="email" name="email" type="email" value="${escapeHtml(defaults)}" required></div>
  <div class="field"><label for="name">Name</label>
    <input id="name" name="name" type="text" value="Mock Traveller"></div>
  <label class="check"><input type="checkbox" name="share_email" value="1" checked> Share my email address with Away</label>
  <label class="check"><input type="checkbox" name="verified" value="1" checked> This address is verified (Google and Apple always say yes; untick to test the "unverified" path)</label>

  <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
  <input type="hidden" name="state" value="${escapeHtml(state)}">
  <input type="hidden" name="client_id" value="${escapeHtml(query.get("client_id") ?? "")}">
  <input type="hidden" name="code_challenge" value="${escapeHtml(query.get("code_challenge") ?? "")}">
  <input type="hidden" name="nonce" value="${escapeHtml(query.get("nonce") ?? "")}">
  <input type="hidden" name="response_mode" value="${escapeHtml(query.get("response_mode") ?? "query")}">
  <input type="hidden" name="account_hint" value="${escapeHtml(theme.account)}">

  <div class="actions">
    <button type="submit" name="decision" value="cancel">Cancel</button>
    <button class="primary" type="submit" name="decision" value="allow">Continue</button>
  </div>

  <div class="note">Nothing is sent to ${theme.name}. Untick the email box to see what happens when a provider only shares an account id.</div>
</form>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (!mockEnabled()) return new Response("Not found", { status: 404 });

  const { provider } = await params;
  const origin = publicOrigin(request);
  const form = await request.formData();

  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const decision = String(form.get("decision") ?? "allow");

  if (!redirectUri.startsWith(`${origin}/auth/`) && !redirectUri.startsWith("/")) {
    return new Response("redirect_uri is not on this site", { status: 400 });
  }

  const target = new URL(redirectUri.startsWith("/") ? `${origin}${redirectUri}` : redirectUri);
  target.searchParams.set("state", state);

  if (decision !== "allow") {
    target.searchParams.set("error", "access_denied");
    return Response.redirect(target.toString(), 303);
  }

  const shareEmail = String(form.get("share_email") ?? "") === "1";
  const verified = shareEmail && String(form.get("verified") ?? "") === "1";
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const subject = `mock-${provider}-${Buffer.from(email || "anon").toString("base64url").slice(0, 18)}`;

  const code = issueMockCode({
    provider,
    clientId: String(form.get("client_id") ?? ""),
    redirectUri: target.toString().split("?")[0],
    challenge: String(form.get("code_challenge") ?? ""),
    nonce: String(form.get("nonce") ?? ""),
    email: shareEmail ? email : "",
    emailVerified: verified && Boolean(email),
    name: name || (shareEmail ? email.split("@")[0] : ""),
    subject,
  });

  target.searchParams.set("code", code);

  // Apple posts the code back to the app rather than appending it to a URL, so
  // the mock posts too — otherwise the POST branch of the callback is dead code
  // that only production exercises.
  if (String(form.get("response_mode") ?? "query") === "form_post") {
    const html = `<!doctype html><html><body onload="document.forms[0].submit()">
<form method="post" action="${escapeHtml(target.origin + target.pathname)}">
  <input type="hidden" name="code" value="${escapeHtml(code)}">
  <input type="hidden" name="state" value="${escapeHtml(state)}">
  <noscript><button type="submit">Continue</button></noscript>
</form></body></html>`;
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  return Response.redirect(target.toString(), 303);
}

/** Only used by tests to clear mock state between cases. */
export async function DELETE() {
  if (!mockEnabled()) return new Response("Not found", { status: 404 });
  resetMockState();
  return Response.json({ ok: true });
}
