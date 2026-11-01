/**
 * Environment switches, in one place, with no Next.js imports so plain Node
 * scripts can read them too.
 *
 * Two different questions, easily confused:
 *
 *  - `demoLoginEnabled()` — may anyone press a one-click demo button on /login?
 *  - `demoAccountsEnabled()` — do the seeded demo logins (marta@away.app and
 *    friends, all with password away1234, one of them an admin) exist at all?
 *
 * Turning the buttons off is not enough on a public deployment: the accounts
 * would still be there, and their password is in the README. So both default to
 * the same answer, and production turns both off.
 */

export function demoLoginEnabled(): boolean {
  if (process.env.DEMO_LOGIN === "1") return true;
  if (process.env.DEMO_LOGIN === "0") return false;
  return process.env.NODE_ENV !== "production";
}

export function demoAccountsEnabled(): boolean {
  if (process.env.AWAY_DEMO_ACCOUNTS === "1") return true;
  if (process.env.AWAY_DEMO_ACCOUNTS === "0") return false;
  return demoLoginEnabled();
}
