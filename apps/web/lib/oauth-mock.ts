/**
 * A fake identity provider, for development only.
 *
 * It exists because "sign in with Google" is the one feature you cannot test
 * without a Google developer console, three redirect URIs and a phone number on
 * file — and an integration nobody can run is an integration nobody trusts. The
 * mock speaks the same protocol the real ones do: authorization code, PKCE,
 * a signed RS256 id_token with `iss`/`aud`/`nonce`, and a JWKS endpoint. The app
 * verifies it with the same code it verifies Google with.
 *
 * It is off unless `OAUTH_MOCK=1`, and it refuses to run in production.
 */
import { randomBytes } from "node:crypto";

export type MockCode = {
  provider: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  nonce: string;
  email: string;
  emailVerified: boolean;
  name: string;
  subject: string;
  createdAt: number;
  used?: boolean;
};

export type MockToken = { provider: string; subject: string; email: string; name: string; createdAt: number };

type Store = {
  codes: Map<string, MockCode>;
  tokens: Map<string, MockToken>;
};

const globalForMock = globalThis as unknown as { __awayMockOAuth?: Store };

function store(): Store {
  if (!globalForMock.__awayMockOAuth) {
    globalForMock.__awayMockOAuth = { codes: new Map(), tokens: new Map() };
  }
  return globalForMock.__awayMockOAuth;
}

const TTL_MS = 5 * 60_000;

function sweep(map: Map<string, { createdAt: number }>) {
  for (const [key, value] of map) if (Date.now() - value.createdAt > TTL_MS) map.delete(key);
}

export function issueMockCode(input: Omit<MockCode, "createdAt">): string {
  const { codes } = store();
  sweep(codes);
  const code = randomBytes(18).toString("base64url");
  codes.set(code, { ...input, createdAt: Date.now() });
  return code;
}

export function takeMockCode(code: string): MockCode | null {
  const { codes } = store();
  const entry = codes.get(code);
  if (!entry || entry.used || Date.now() - entry.createdAt > TTL_MS) return null;
  entry.used = true;
  codes.delete(code);
  return entry;
}

export function issueMockToken(input: Omit<MockToken, "createdAt">): string {
  const { tokens } = store();
  sweep(tokens);
  const token = `mock-at-${randomBytes(16).toString("base64url")}`;
  tokens.set(token, { ...input, createdAt: Date.now() });
  return token;
}

export function readMockToken(token: string): MockToken | null {
  const { tokens } = store();
  const entry = tokens.get(token.replace(/^Bearer\s+/i, ""));
  if (!entry || Date.now() - entry.createdAt > TTL_MS) return null;
  return entry;
}

/** Test hook: wipe state between runs in the same process. */
export function resetMockState(): void {
  store().codes.clear();
  store().tokens.clear();
}
