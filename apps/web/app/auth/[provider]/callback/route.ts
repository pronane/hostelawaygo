import { redirect } from "next/navigation";
import { startSession } from "@/lib/auth";
import { OAuthError, finishAuth } from "@/lib/oauth";

export const dynamic = "force-dynamic";

type Input = { code: string | null; state: string | null; error: string | null };

/**
 * The provider sends the browser back here, once.
 *
 * Google and Facebook use a GET with a query string; Apple posts a form. Both
 * end in the same place: verified claims → a traveller → a session. Any failure
 * becomes a sentence on the login page, never a stack trace or a half-session.
 */
async function handle(request: Request, providerPromise: Promise<{ provider: string }>) {
  const { provider } = await providerPromise;

  let input: Input;
  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    input = {
      code: form ? String(form.get("code") ?? "") || null : null,
      state: form ? String(form.get("state") ?? "") || null : null,
      error: form ? String(form.get("error") ?? "") || null : null,
    };
  } else {
    const url = new URL(request.url);
    input = {
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      error: url.searchParams.get("error"),
    };
  }

  let result: Awaited<ReturnType<typeof finishAuth>>;
  try {
    result = await finishAuth(provider, request, input);
  } catch (error) {
    const oauth = error instanceof OAuthError ? error : new OAuthError("exchange", "sign-in failed");
    const detail = encodeURIComponent(oauth.message.slice(0, 140));
    redirect(`/login?error=oauth_${oauth.code}&detail=${detail}`);
  }

  await startSession(result.userId);
  const next = result.next;
  const separator = next.includes("?") ? "&" : "?";
  redirect(result.created ? `${next}${separator}welcome=1` : next);
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handle(request, params);
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handle(request, params);
}
