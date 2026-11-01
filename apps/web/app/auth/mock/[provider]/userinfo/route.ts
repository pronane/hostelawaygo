import { mockEnabled } from "@/lib/oauth";
import { readMockToken } from "@/lib/oauth-mock";

export const dynamic = "force-dynamic";

/**
 * Facebook-shaped userinfo: an account id, a name, and an email only when the
 * person agreed to share one. The app has to cope with the address being
 * missing, which is exactly the case this exercises.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (!mockEnabled()) return new Response("Not found", { status: 404 });

  const { provider } = await params;
  const header = request.headers.get("authorization") ?? "";
  const entry = header ? readMockToken(header) : null;

  if (!entry || entry.provider !== provider) {
    return Response.json({ error: { message: "invalid token", type: "OAuthException" } }, { status: 401 });
  }

  return Response.json(
    {
      id: entry.subject,
      name: entry.name,
      ...(entry.email ? { email: entry.email } : {}),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
