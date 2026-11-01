/**
 * Social sign-in: Google, Facebook and Apple.
 *
 * Three flows that look different and are the same thing underneath — an
 * authorization code exchange, an identity claim, and a decision about which
 * traveller that claim belongs to. The decisions live here, next to the code
 * that proves who is calling:
 *
 *   - the provider's `sub` is the identity, not the email address. People
 *     change email addresses; `sub` doesn't.
 *   - an email that matches an existing account links to it, but only when the
 *     provider says the address is verified. Otherwise anyone who can type your
 *     address into a provider could take the account over.
 *   - an address that already has an unverified account gets that account, and
 *     the provider's proof verifies it.
 *
 * `OAUTH_MOCK=1` points all three at an in-app fake provider (never in
 * production) so the flow can be walked end to end without three developer
 * apps. The mock signs real RS256 JWTs, so it exercises the real verifier.
 */
import { createHash, createSign, randomBytes } from "node:crypto";
import { getDb } from "./db";
import { appUrl } from "./constants";
import { audienceMatches, emailVerified, verifyIdToken, type Claims } from "./jwt";

export type ProviderId = "google" | "facebook" | "apple";

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  /** Where the button goes. */
  href: string;
  mock: boolean;
};

export class OAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function mockEnabled(): boolean {
  if (process.env.OAUTH_MOCK !== "1") return false;
  // A mock provider mints identities. That is a development tool, and it must
  // not be able to exist on a deployment that real travellers use.
  if (process.env.NODE_ENV === "production" && process.env.OAUTH_MOCK_ALLOW_PROD !== "1") return false;
  return true;
}

export function publicOrigin(request: Request): string {
  const configured = process.env.APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

export function safeNext(value: unknown): string {
  const next = String(value ?? "/");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

type ProviderConfig = {
  id: ProviderId;
  label: string;
  clientId: string;
  clientSecret: string | (() => string);
  authorizeUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  issuer?: string;
  scope: string;
  responseMode?: "query" | "form_post";
  /** Facebook answers with an access token and no id_token; the rest are OIDC. */
  usesUserinfo?: boolean;
  userinfoUrl?: string;
  mock: boolean;
};

const LABELS: Record<ProviderId, string> = {
  google: "Google",
  facebook: "Facebook",
  apple: "Apple",
};

const APPLE_ISSUER = "https://appleid.apple.com";

function mockConfig(id: ProviderId, origin: string): ProviderConfig {
  return {
    id,
    label: LABELS[id],
    clientId: `mock-${id}-client`,
    clientSecret: "mock-secret",
    authorizeUrl: `${origin}/auth/mock/${id}/authorize`,
    tokenUrl: `${origin}/auth/mock/${id}/token`,
    jwksUrl: `${origin}/auth/mock/${id}/jwks`,
    issuer: `${origin}/auth/mock/${id}`,
    scope: "openid email profile",
    responseMode: id === "apple" ? "form_post" : "query",
    usesUserinfo: id === "facebook",
    userinfoUrl: `${origin}/auth/mock/${id}/userinfo`,
    mock: true,
  };
}

function realConfig(id: ProviderId): ProviderConfig | null {
  if (id === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      id,
      label: LABELS[id],
      clientId,
      clientSecret,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
      issuer: "https://accounts.google.com",
      scope: "openid email profile",
      responseMode: "query",
      mock: false,
    };
  }

  if (id === "facebook") {
    const clientId = process.env.FACEBOOK_APP_ID;
    const clientSecret = process.env.FACEBOOK_APP_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      id,
      label: LABELS[id],
      clientId,
      clientSecret,
      authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
      jwksUrl: "",
      scope: "email public_profile",
      responseMode: "query",
      usesUserinfo: true,
      userinfoUrl: "https://graph.facebook.com/v21.0/me?fields=id,name,email",
      mock: false,
    };
  }

  const clientId = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  if (!clientId || !teamId || !keyId || !privateKey) return null;

  return {
    id,
    label: LABELS[id],
    clientId,
    clientSecret: () => appleClientSecret(clientId, teamId, keyId, privateKey),
    authorizeUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    jwksUrl: "https://appleid.apple.com/auth/keys",
    issuer: APPLE_ISSUER,
    scope: "name email",
    // Apple posts the code back to you, not in the query string.
    responseMode: "form_post",
    mock: false,
  };
}

/**
 * Apple doesn't take a shared secret: the "client secret" is a short-lived JWT
 * signed with the .p8 key from the developer account. ES256, 5 minutes, and
 * regenerated per exchange.
 */
export function appleClientSecret(clientId: string, teamId: string, keyId: string, pem: string): string {
  const key = pem.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iss: teamId, iat: now, exp: now + 300, aud: APPLE_ISSUER, sub: clientId })
  ).toString("base64url");
  const signature = createSign("SHA256")
    .update(`${header}.${payload}`)
    .sign({ key, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

export function getProvider(id: string, origin: string): ProviderConfig | null {
  if (id !== "google" && id !== "facebook" && id !== "apple") return null;
  if (mockEnabled()) return mockConfig(id, origin);
  return realConfig(id);
}

export function listProviders(origin: string): ProviderInfo[] {
  return (["google", "facebook", "apple"] as ProviderId[])
    .map((id) => {
      const config = getProvider(id, origin);
      return config ? { id, label: config.label, href: `/auth/${id}`, mock: config.mock } : null;
    })
    .filter((entry): entry is ProviderInfo => entry !== null);
}

export function redirectUriFor(id: ProviderId, origin: string): string {
  return `${origin}/auth/${id}/callback`;
}

/* ------------------------------------------------------------------ PKCE -- */

const base64url = (buffer: Buffer) => buffer.toString("base64url");

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/* ---------------------------------------------------------------- start --- */

export type BeginResult = { url: string; state: string };

/**
 * Creates the single-use handshake row and returns the URL to send the browser
 * to. `state` is the CSRF token, `nonce` binds the id_token to this request,
 * `verifier` proves the token exchange comes from the same client.
 */
export async function beginAuth(id: string, request: Request, next: string): Promise<BeginResult> {
  const origin = publicOrigin(request);
  const config = getProvider(id, origin);
  if (!config) throw new OAuthError("provider", "That sign-in provider isn't available.");

  const state = randomBytes(24).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const { verifier, challenge } = createPkce();
  const now = new Date();

  await getDb()
    .prepare(
      `INSERT INTO oauth_states (id, provider, verifier, nonce, next, created_at, expires_at)
       VALUES (@id, @provider, @verifier, @nonce, @next, @createdAt, @expiresAt)`
    )
    .run({
      id: state,
      provider: config.id,
      verifier,
      nonce,
      next: safeNext(next),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    });

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUriFor(config.id, origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // OIDC only; Facebook's flow has no nonce to echo.
  if (config.id !== "facebook") url.searchParams.set("nonce", nonce);
  if (config.responseMode === "form_post") url.searchParams.set("response_mode", "form_post");
  if (config.id === "apple") {
    // Apple renders a name/email consent screen; asked for explicitly so the
    // first sign-in can carry a name (later ones don't).
    url.searchParams.set("scope", "name email");
  }

  return { url: url.toString(), state };
}

/* ---------------------------------------------------------------- finish -- */

type StateRow = {
  id: string;
  provider: string;
  verifier: string;
  nonce: string;
  next: string;
  expires_at: string;
};

async function takeState(state: string | null): Promise<StateRow> {
  if (!state) throw new OAuthError("state", "That sign-in link is missing its state.");
  const db = getDb();
  const row = await db.prepare("SELECT * FROM oauth_states WHERE id = ?").get<StateRow>(state);
  // Single use, whatever happens next.
  await db.prepare("DELETE FROM oauth_states WHERE id = ?").run(state);
  if (!row) throw new OAuthError("state", "That sign-in attempt is unknown or was already used.");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new OAuthError("state", "That sign-in took too long. Try again.");
  }
  return row;
}

type TokenResponse = { access_token?: string; id_token?: string; token_type?: string };

async function exchangeCode(config: ProviderConfig, code: string, verifier: string, origin: string): Promise<TokenResponse> {
  const secret = typeof config.clientSecret === "function" ? config.clientSecret() : config.clientSecret;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUriFor(config.id, origin),
    client_id: config.clientId,
    client_secret: secret,
    code_verifier: verifier,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(12_000),
  });

  const payload = (await response.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!response.ok || payload.error) {
    throw new OAuthError("exchange", payload.error_description ?? payload.error ?? `token endpoint ${response.status}`);
  }
  if (!payload.access_token) throw new OAuthError("exchange", "no access token");
  return payload;
}

type Identity = { subject: string; email: string; emailVerified: boolean; name: string };

async function claimsFor(config: ProviderConfig, tokens: TokenResponse, nonce: string): Promise<Identity> {
  if (config.usesUserinfo) {
    const url = new URL(config.userinfoUrl!);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${tokens.access_token}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: string; name?: string; email?: string; error?: { message?: string } };
    if (!response.ok || !payload.id) {
      throw new OAuthError("userinfo", payload.error?.message ?? "couldn't read the profile");
    }
    // Facebook only returns an address the account has confirmed, and there's
    // no flag to check — so its presence is the proof.
    return {
      subject: payload.id,
      email: (payload.email ?? "").trim().toLowerCase(),
      emailVerified: Boolean(payload.email),
      name: (payload.name ?? "").trim(),
    };
  }

  const claims: Claims = await verifyIdToken(tokens.id_token ?? "", {
    jwksUrl: config.jwksUrl,
    issuer: config.issuer,
    audience: config.clientId,
    nonce,
  }).catch((error: unknown) => {
    throw new OAuthError("token", error instanceof Error ? error.message : "invalid id_token");
  });

  // Google's issuer is stable; Apple's is fixed; both are checked above.
  const verified = emailVerified(claims.email_verified);
  return {
    subject: String(claims.sub ?? ""),
    email: String(claims.email ?? "").trim().toLowerCase(),
    emailVerified: verified,
    name: String(claims.name ?? "").trim(),
  };
}

/* --------------------------------------------------------------- account -- */

const INITIALS = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AW";

export type AuthResult = { userId: number; created: boolean; linked: boolean; email: string };

/**
 * Decide which traveller just signed in. Three cases, in order:
 *   1. we've seen this provider subject before → that account;
 *   2. the address belongs to an account → link it (only if the provider
 *      vouches for the address);
 *   3. nobody → create a traveller, already verified, with no password.
 */
export async function resolveAccount(config: ProviderConfig, identity: Identity): Promise<AuthResult> {
  const db = getDb();
  if (!identity.subject) throw new OAuthError("token", "the provider didn't return a user id");

  const known = await db
    .prepare("SELECT traveller_id FROM identities WHERE provider = ? AND subject = ?")
    .get<{ traveller_id: number }>(config.id, identity.subject);

  if (known) {
    await db.prepare("UPDATE identities SET email = ?, name = ?, linked_at = ? WHERE provider = ? AND subject = ?").run(
      identity.email,
      identity.name,
      new Date().toISOString(),
      config.id,
      identity.subject
    );
    return { userId: known.traveller_id, created: false, linked: false, email: identity.email };
  }

  if (!identity.email) {
    throw new OAuthError(
      "no_email",
      `${config.label} didn't share an email address. Create an account with your email instead — it takes a minute.`
    );
  }

  const existing = await db
    .prepare("SELECT id, email_verified_at FROM travellers WHERE lower(email) = ?")
    .get<{ id: number; email_verified_at: string | null }>(identity.email);

  if (existing) {
    if (!identity.emailVerified) {
      throw new OAuthError(
        "unverified_email",
        `${config.label} hasn't confirmed ${identity.email}, so it can't be used to sign in to an existing account. Use your password instead.`
      );
    }
    await db.prepare(
      `INSERT INTO identities (traveller_id, provider, subject, email, name, linked_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, subject) DO UPDATE SET email = excluded.email, name = excluded.name`
    ).run(existing.id, config.id, identity.subject, identity.email, identity.name, new Date().toISOString());

    // Signing in with a provider proves the address, so an unverified account
    // becomes verified rather than sending someone a link they don't need.
    if (!existing.email_verified_at) {
      await db.prepare("UPDATE travellers SET email_verified_at = ? WHERE id = ?").run(new Date().toISOString(), existing.id);
    }
    return { userId: existing.id, created: false, linked: true, email: identity.email };
  }

  if (!identity.emailVerified) {
    throw new OAuthError("unverified_email", `${config.label} hasn't confirmed that email address.`);
  }

  const name = identity.name || identity.email.split("@")[0].replace(/[._-]+/g, " ");
  const now = new Date().toISOString();

  const userId = await db.transaction(async () => {
    const info = await db
      .prepare(
        `INSERT INTO travellers (name, initials, flag, colour, solo, languages, email, password_hash, role, email_verified_at)
         VALUES (@name, @initials, '🌍', '#FFD9A0', 1, 'English', @email, NULL, 'traveller', @verifiedAt)`
      )
      .run({ name, email: identity.email, initials: INITIALS(name), verifiedAt: now });

    await db.prepare(
      `INSERT INTO identities (traveller_id, provider, subject, email, name, linked_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(Number(info.lastInsertRowid), config.id, identity.subject, identity.email, identity.name, now);

    return Number(info.lastInsertRowid);
  });

  return { userId, created: true, linked: false, email: identity.email };
}

/* --------------------------------------------------------------- helpers -- */

export type CallbackInput = { code: string | null; state: string | null; error: string | null };

export async function finishAuth(id: string, request: Request, input: CallbackInput): Promise<{ userId: number; next: string; created: boolean; linked: boolean }> {
  const origin = publicOrigin(request);
  const config = getProvider(id, origin);
  if (!config) throw new OAuthError("provider", "That sign-in provider isn't available.");

  if (input.error) {
    throw new OAuthError("denied", input.error === "access_denied" ? "Sign-in was cancelled." : `The provider said: ${input.error}`);
  }

  const state = await takeState(input.state);
  if (state.provider !== config.id) throw new OAuthError("state", "That sign-in was for a different provider.");
  if (!input.code) throw new OAuthError("exchange", "The provider didn't return a code.");

  const tokens = await exchangeCode(config, input.code, state.verifier, origin);
  const identity = await claimsFor(config, tokens, state.nonce);
  const result = await resolveAccount(config, identity);

  return { userId: result.userId, next: safeNext(state.next), created: result.created, linked: result.linked };
}

export async function linkedProviders(travellerId: number): Promise<{ provider: string; email: string; linked_at: string }[]> {
  return getDb()
    .prepare("SELECT provider, email, linked_at FROM identities WHERE traveller_id = ? ORDER BY linked_at")
    .all<{ provider: string; email: string; linked_at: string }>(travellerId);
}

export const PROVIDER_LABEL: Record<string, string> = LABELS;

/** Absolute URL helper that works in route handlers and server components. */
export function absoluteUrl(path: string, request?: Request): string {
  const origin = request ? publicOrigin(request) : appUrl();
  return `${origin.replace(/\/$/, "")}${path}`;
}
