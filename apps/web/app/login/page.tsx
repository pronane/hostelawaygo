import Link from "next/link";
import { demoLoginAction, loginAction } from "@/app/actions/auth";
import { ACCOUNTS } from "@/lib/seed-extra";
import { demoLoginEnabled } from "@/lib/auth";
import OAuthButtons from "@/components/oauth-buttons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  credentials: "That email and password don't match. Try again, or use a demo account below.",
  demo: "That demo account doesn't exist any more — reset the database and it will come back.",
  demo_off: "Demo sign-in is switched off on this site.",
  oauth_provider: "That sign-in method isn't set up on this site.",
  oauth_state: "That sign-in link expired or was already used. Try again.",
  oauth_denied: "Sign-in was cancelled, so nothing changed.",
  oauth_token: "The provider's answer didn't check out. Try again.",
  oauth_exchange: "We couldn't finish the handshake with the provider. Try again.",
  oauth_no_email: "That provider didn't share an email address. Create an account with your email instead.",
  oauth_unverified_email: "That provider hasn't confirmed the email address, so it can't open an existing account. Sign in with your password.",
  oauth_userinfo: "The provider wouldn't share your profile. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; detail?: string }>;
}) {
  const { error, next = "/", detail } = await searchParams;
  const message = error ? (ERRORS[error] ?? detail ?? "Something went wrong.") : null;

  return (
    <div className="auth">
      <div className="eyebrow">Welcome back</div>
      <h1 className="page-title">Sign in</h1>
      <p className="page-sub">
        Your trips, your bookings and your event chats are tied to this account.
      </p>

      {message ? (
        <div className="notice warn" role="alert" style={{ marginTop: 16 }}>
          <span aria-hidden="true">⚠️</span>
          <span>{message}</span>
        </div>
      ) : null}

      <OAuthButtons next={next} divider="or with your email" />

      <form action={loginAction} className="auth-form">
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        </div>
        <button type="submit" className="publish" style={{ marginTop: 12 }}>
          Sign in
        </button>
      </form>

      <p style={{ fontSize: 12.5, color: "#7b6e64", marginTop: 14 }}>
        No account? <Link href={`/signup?next=${encodeURIComponent(next)}`} style={{ textDecoration: "underline" }}>Create one</Link>.
      </p>

      {demoLoginEnabled() ? (
        <>
          <div className="auth-divider">
            <span>or jump straight in</span>
          </div>

          <div className="demo-accounts">
            {ACCOUNTS.map((account) => (
              <form action={demoLoginAction} key={account.email}>
                <input type="hidden" name="email" value={account.email} />
                <input type="hidden" name="next" value={next} />
                <button type="submit" className="demo-account">
                  <span className="demo-who">
                    <b>{account.name}</b>
                    <span>{account.demoBlurb}</span>
                  </span>
                  <span className="demo-role">
                    {account.role === "hostel_staff" ? "Hostel staff" : account.role === "admin" ? "Ops" : "Traveller"}
                  </span>
                </button>
              </form>
            ))}
          </div>

          <p className="auth-footnote">
            These are seeded demo accounts. The password for all of them is <code>away1234</code> — one
            click signs you in without typing it.
          </p>
        </>
      ) : null}
    </div>
  );
}
