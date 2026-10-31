import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import type { SessionUser } from "@/lib/auth";

export function AccountBlock({ user }: { user: SessionUser | null }) {
  if (!user) {
    return (
      <div className="account">
        <p className="account-guest">Not signed in. Joining, chatting and booking need an account.</p>
        <Link href="/login" className="btn small block">
          Sign in
        </Link>
      </div>
    );
  }

  const role =
    user.role === "hostel_staff"
      ? `${user.hostel_name ?? "Hostel"} staff`
      : user.role === "admin"
        ? "Away ops"
        : "Traveller";

  return (
    <div className="account">
      <Link href="/you" className="account-who">
        <span className="av" style={{ background: user.colour }} aria-hidden="true">
          {user.initials}
        </span>
        <span className="account-name">
          <b>{user.name}</b>
          <span>{role}</span>
        </span>
      </Link>
      <form action={logoutAction}>
        <button type="submit" className="linkish">
          Sign out
        </button>
      </form>
    </div>
  );
}
