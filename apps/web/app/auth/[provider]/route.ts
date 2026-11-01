import { redirect } from "next/navigation";
import { OAuthError, beginAuth } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/**
 * "Continue with Google" lands here.
 *
 * Everything that follows is a redirect: to the provider with a state token, a
 * PKCE challenge and an OIDC nonce, and back to /auth/<provider>/callback.
 * Nothing is trusted on the way out, and nothing is accepted on the way back
 * that isn't verified there.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);

  try {
    const { url: authorizeUrl } = await beginAuth(provider, request, url.searchParams.get("next") ?? "/");
    return Response.redirect(authorizeUrl, 302);
  } catch (error) {
    const code = error instanceof OAuthError ? error.code : "provider";
    redirect(`/login?error=oauth_${code}`);
  }
}
