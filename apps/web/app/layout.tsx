import type { Metadata, Viewport } from "next";
import "./globals.css";
import Link from "next/link";
import { MobileTabs, Nav } from "@/components/nav";
import { AccountBlock } from "@/components/account-block";
import { Aside } from "@/components/aside";
import { SwRegister } from "@/components/sw-register";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { appUrl } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Absolute URLs for canonical, Open Graph and the sitemap. A relative
  // canonical is a canonical nobody can resolve.
  metadataBase: new URL(appUrl()),
  title: {
    default: "Away — what's on, here and next",
    template: "%s · Away",
  },
  description:
    "An event guide for hostel travellers: what's on where you are tonight, and what'll be on where you're going next.",
  applicationName: "Away",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Away" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    title: "Away — what's on, here and next",
    description: "What's on where you are, and what'll be on where you're going.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#ff5a36",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const staff = isStaff(user);

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="rail">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">
                ◉
              </span>
              <span>
                <span className="brand-name">Away</span>
                <span className="brand-sub">Hostel guide</span>
              </span>
            </Link>

            <Nav staff={staff} admin={user?.role === "admin"} />
            <AccountBlock user={user} />

            <p className="rail-note">
              <b>HERE</b> is the city you&apos;re in. <b>NEXT</b> is the city you&apos;re going
              to, matched to your exact dates.
            </p>
          </aside>

          <main>{children}</main>

          <aside className="aside">
            <Aside user={user} />
          </aside>
        </div>

        <MobileTabs />
        <SwRegister />
      </body>
    </html>
  );
}
