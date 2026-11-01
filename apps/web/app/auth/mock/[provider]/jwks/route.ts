import { mockEnabled } from "@/lib/oauth";
import { mockPublicJwks } from "@/lib/jwt";

export const dynamic = "force-dynamic";

/** The mock's public keys, in the shape a real JWKS endpoint returns. */
export async function GET(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (!mockEnabled()) return new Response("Not found", { status: 404 });
  const { provider } = await params;
  return Response.json(mockPublicJwks(), {
    headers: { "cache-control": "no-store", "x-mock-provider": provider },
  });
}
