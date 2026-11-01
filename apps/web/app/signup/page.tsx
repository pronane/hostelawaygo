import Link from "next/link";
import { signupAction } from "@/app/actions/auth";
import OAuthButtons from "@/components/oauth-buttons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create an account" };

const ERRORS: Record<string, string> = {
  name: "Give us a name people can say hello to.",
  email: "That email doesn't look right.",
  password: "Passwords need at least 8 characters.",
  taken: "There's already an account with that email. Try signing in.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; name?: string; email?: string; next?: string }>;
}) {
  const { error, name = "", email = "", next = "/" } = await searchParams;

  return (
    <div className="auth">
      <div className="eyebrow">Two minutes, no email confirmation</div>
      <h1 className="page-title">Create an account</h1>
      <p className="page-sub">
        So hostels know who&apos;s coming, and so your bookings and chats survive a new phone.
      </p>

      {error ? (
        <div className="notice warn" role="alert" style={{ marginTop: 16 }}>
          <span aria-hidden="true">⚠️</span>
          <span>{ERRORS[error] ?? "Something went wrong."}</span>
        </div>
      ) : null}

      <OAuthButtons next={next} label="Sign up with" divider="or with your email" />

      <form action={signupAction} className="auth-form">
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" defaultValue={name} required maxLength={60} placeholder="Marta Kowalska" />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={email}
            required
            placeholder="you@example.com"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="At least 8 characters"
          />
        </div>
        <button type="submit" className="publish" style={{ marginTop: 12 }}>
          Create account
        </button>
      </form>

      <p style={{ fontSize: 12.5, color: "#7b6e64", marginTop: 14 }}>
        Already have one?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} style={{ textDecoration: "underline" }}>
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
