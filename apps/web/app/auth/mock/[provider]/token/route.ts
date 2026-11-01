import { createHash } from "node:crypto";
import { issueMockToken, takeMockCode } from "@/lib/oauth-mock";
import { mockEnabled, publicOrigin } from "@/lib/oauth";
import { mockSigningKey, signJwt } from "@/lib/jwt";

export const dynamic = "force-dynamic";

/**
 * The mock token endpoint: checks the code, checks PKCE, and signs a real
 * RS256 id_token with `iss`, `aud`, `nonce` and `exp` exactly as Google's does.
 * The app then verifies that token against the mock's JWKS endpoint, which is
 * the point — the verifier isn't being bypassed for the mock.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (!mockEnabled()) return new Response("Not found", { status: 404 });

  const { provider } = await params;
  const origin = publicOrigin(request);
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "invalid_request" }, { status: 400 });

  const code = String(form.get("code") ?? "");
  const verifier = String(form.get("code_verifier") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const clientSecret = String(form.get("client_secret") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");

  const entry = takeMockCode(code);
  if (!entry) return Response.json({ error: "invalid_grant", error_description: "code is unknown or expired" }, { status: 400 });
  if (entry.provider !== provider) return Response.json({ error: "invalid_grant", error_description: "code was issued for another provider" }, { status: 400 });
  if (clientSecret !== "mock-secret") return Response.json({ error: "invalid_client" }, { status: 401 });
  if (entry.clientId && clientId !== entry.clientId) return Response.json({ error: "invalid_client" }, { status: 401 });
  if (redirectUri && entry.redirectUri && redirectUri !== entry.redirectUri) {
    return Response.json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, { status: 400 });
  }

  // PKCE: the verifier must hash to the challenge we were given at the start.
  const computed = createHash("sha256").update(verifier).digest("base64url");
  if (!entry.challenge || computed !== entry.challenge) {
    return Response.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const { kid } = mockSigningKey();
  const idToken = signJwt(
    {
      iss: `${origin}/auth/mock/${provider}`,
      aud: entry.clientId || clientId,
      sub: entry.subject,
      email: entry.email,
      email_verified: entry.emailVerified,
      name: entry.name,
      nonce: entry.nonce,
      iat: now,
      exp: now + 300,
    },
    kid
  );

  const accessToken = issueMockToken({
    provider,
    subject: entry.subject,
    email: entry.email,
    name: entry.name,
  });

  return Response.json(
    { access_token: accessToken, id_token: idToken, token_type: "Bearer", expires_in: 300, scope: "openid email profile" },
    { headers: { "cache-control": "no-store" } }
  );
}
