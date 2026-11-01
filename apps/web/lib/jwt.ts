/**
 * The smallest thing that can verify an OIDC `id_token`, and sign one.
 *
 * Every provider we support (Google, Apple, Facebook's limited OIDC) signs with
 * RS256 and publishes a JWKS. So: decode, find the key by `kid`, verify the
 * signature with Node's crypto, then check `iss`, `aud`, `exp` and `nonce` —
 * which is the part people forget, and the part that stops a token minted for
 * another app (or replayed from another login) being accepted here.
 *
 * No dependency, no `jsonwebtoken`: this is ~120 lines including the cache.
 */
import { createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from "node:crypto";

export type Claims = Record<string, unknown> & {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
};

export function decodeJwt(token: string) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) throw new Error("malformed id_token");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as {
    alg?: string;
    kid?: string;
    typ?: string;
  };
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Claims;
  return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2], "base64url") };
}

export function audienceMatches(aud: Claims["aud"], clientId: string): boolean {
  if (Array.isArray(aud)) return aud.includes(clientId);
  return aud === clientId;
}

export function emailVerified(value: Claims["email_verified"]): boolean {
  return value === true || value === "true";
}

type Jwk = { kid?: string; kty: string; n?: string; e?: string; alg?: string; use?: string };
type JwkSet = { keys: Jwk[] };

const CACHE_TTL_MS = 10 * 60 * 1000;
const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();

async function loadJwks(url: string): Promise<Jwk[]> {
  const cached = jwksCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.keys;

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`JWKS ${response.status}`);
  const body = (await response.json()) as JwkSet;
  if (!Array.isArray(body.keys)) throw new Error("JWKS has no keys");
  jwksCache.set(url, { at: Date.now(), keys: body.keys });
  return body.keys;
}

/** Used by the self-test and by /auth/mock: forget cached keys so a restart is visible. */
export function clearJwksCache(): void {
  jwksCache.clear();
}

export type VerifyOptions = {
  jwksUrl: string;
  issuer?: string;
  audience: string;
  nonce?: string;
  now?: number;
  toleranceSec?: number;
};

/**
 * Verifies signature + claims. Throws with a short, user-safe reason; the
 * callback turns that into "we couldn't finish signing you in".
 */
export async function verifyIdToken(token: string, options: VerifyOptions): Promise<Claims> {
  const { header, payload, signingInput, signature } = decodeJwt(token);

  if (header.alg !== "RS256") throw new Error(`unsupported alg ${header.alg ?? "none"}`);

  const keys = await loadJwks(options.jwksUrl);
  const jwk = header.kid ? keys.find((key) => key.kid === header.kid) : keys[0];
  if (!jwk) throw new Error("no matching key");

  const key = createPublicKey({ key: jwk as unknown as JsonWebKey, format: "jwk" });
  const ok = cryptoVerify("RSA-SHA256", Buffer.from(signingInput), key, signature);
  if (!ok) throw new Error("bad signature");

  const now = Math.floor((options.now ?? Date.now()) / 1000);
  const tolerance = options.toleranceSec ?? 120;

  if (options.issuer && payload.iss !== options.issuer) throw new Error(`wrong issuer ${payload.iss}`);
  if (!audienceMatches(payload.aud, options.audience)) throw new Error("wrong audience");
  if (typeof payload.exp !== "number" || payload.exp + tolerance < now) throw new Error("expired");
  if (typeof payload.iat === "number" && payload.iat - tolerance > now) throw new Error("issued in the future");
  if (options.nonce && payload.nonce !== options.nonce) throw new Error("nonce mismatch");

  return payload;
}

/* --------------------------------------------------------------- signing ---
 * Only the mock provider signs tokens. Keeping it in this file means the mock
 * exercises the same verification path production uses — if the verifier is
 * wrong, the self-test fails.
 */

type MockKey = { publicKey: KeyObject; privateKey: KeyObject };

const globalForKeys = globalThis as unknown as { __awayMockKey?: MockKey; __awayMockKid?: string };

function ensureMockKey(): MockKey {
  if (!globalForKeys.__awayMockKey) {
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    globalForKeys.__awayMockKey = { publicKey: pair.publicKey, privateKey: pair.privateKey };
    globalForKeys.__awayMockKid = "mock-key-1";
  }
  return globalForKeys.__awayMockKey;
}

export function mockSigningKey(): { privateKey: KeyObject; kid: string } {
  const key = ensureMockKey();
  return { privateKey: key.privateKey, kid: globalForKeys.__awayMockKid ?? "mock-key-1" };
}

export function mockPublicJwks(): JwkSet {
  const { publicKey } = ensureMockKey();
  const jwk = publicKey.export({ format: "jwk" }) as Jwk;
  return { keys: [{ ...jwk, kid: globalForKeys.__awayMockKid, alg: "RS256", use: "sig" }] };
}

export function signJwt(claims: Claims, kid: string): string {
  const { privateKey } = mockSigningKey();
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid })).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = cryptoSign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey);
  return `${header}.${body}.${signature.toString("base64url")}`;
}
