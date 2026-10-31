/**
 * One operator, one password.
 *
 * This tool emails strangers, so it is closed by default: with no
 * OUTREACH_PASSWORD and NODE_ENV=production the server refuses to start rather
 * than run open. The session is an HMAC, not a token store, so there is nothing
 * to leak and nothing to keep in sync.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { config, opsPassword } from "./config.js";
import { cookie, parseCookies } from "./http.js";
import { esc } from "./html.js";

const COOKIE = "away_outreach";

const signature = (secret) => createHmac("sha256", secret).update("ops").digest("base64url");

export function isSignedIn(request, secret) {
  const value = parseCookies(request.headers.cookie)[COOKIE];
  if (!value) return false;
  const expected = signature(secret);
  return value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export function signInCookie(secret) {
  return cookie(COOKIE, signature(secret), {
    secure: config.publicUrl.startsWith("https://"),
  });
}

export function signOutCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function checkPassword(candidate) {
  const expected = opsPassword();
  if (!expected) return false;
  const a = Buffer.from(String(candidate ?? ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function loginPage(flash = "") {
  const demo = !config.password && !config.isProduction;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Sign in · Away outreach</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(700px 500px at 20% 0,#fff3e6,transparent 60%),#efe9e2;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;color:#191310}
.card{background:#fff;border:1px solid #ede3d8;border-radius:20px;padding:28px;width:min(360px,90vw)}
h1{font-size:20px;margin:0 0 4px;letter-spacing:-.02em}
p{color:#7b6e64;font-size:13px;margin:0 0 18px;line-height:1.5}
input{width:100%;padding:11px 13px;border:1px solid #ede3d8;border-radius:11px;font:inherit;font-size:14px;box-sizing:border-box;margin-bottom:12px}
button{width:100%;padding:11px;border-radius:11px;border:0;background:#191310;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.note{background:#fff8e6;border:1px solid #f3e2b7;border-radius:10px;padding:9px 11px;font-size:12px;color:#6b4e00;margin-bottom:14px}
.note.bad{background:#fdeeee;border-color:#f2cfcf;color:#931f1f}
</style></head><body>
<form class="card" method="post" action="/login">
  <h1>Outreach</h1>
  <p>Finding hostels is automated. Sending is not.</p>
  ${flash ? `<div class="note ${flash.kind ?? ""}">${esc(flash.text)}</div>` : ""}
  ${demo ? `<div class="note">No <code>OUTREACH_PASSWORD</code> is set, so this is the development password: <b>outreach</b></div>` : ""}
  <input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus>
  <button type="submit">Sign in</button>
</form>
</body></html>`;
}
