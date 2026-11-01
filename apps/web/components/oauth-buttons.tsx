import type { ReactNode } from "react";
import { appUrl } from "@/lib/constants";
import { listProviders, mockEnabled } from "@/lib/oauth";

/**
 * The three buttons, drawn only for providers that are actually configured.
 *
 * With no keys and no mock there is nothing here, which is the correct answer
 * on a deployment that hasn't set up OAuth: a button that leads to an error is
 * worse than no button.
 */

const ICONS: Record<string, { svg: ReactNode; label: string }> = {
  google: {
    label: "Google",
    svg: (
      <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    ),
  },
  facebook: {
    label: "Facebook",
    svg: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z" />
      </svg>
    ),
  },
  apple: {
    label: "Apple",
    svg: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="#111111"
          d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z"
        />
      </svg>
    ),
  },
};

export default function OAuthButtons({
  next = "/",
  label = "Continue with",
  divider,
}: {
  next?: string;
  label?: string;
  divider?: string;
}) {
  const providers = listProviders(appUrl());
  if (!providers.length) return null;

  return (
    <div className="oauth">
      {providers.map((provider) => (
        <a
          key={provider.id}
          className="oauth-btn"
          href={`/auth/${provider.id}?next=${encodeURIComponent(next)}`}
          rel="nofollow"
        >
          <span className="oauth-icon">{ICONS[provider.id]?.svg}</span>
          {`${label} ${provider.label}`}
        </a>
      ))}
      {providers.some((provider) => provider.mock) && mockEnabled() ? (
        <p className="oauth-mock">
          Mock provider — <code>OAUTH_MOCK=1</code> stands in for Google, Facebook and Apple locally.
        </p>
      ) : null}
      {divider ? (
        <div className="auth-divider">
          <span>{divider}</span>
        </div>
      ) : null}
    </div>
  );
}
