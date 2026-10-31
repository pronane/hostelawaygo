import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav, MobileTabs } from "@/components/nav";
import { Aside } from "@/components/aside";
import { SwRegister } from "@/components/sw-register";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="rail">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">
                ◉
              </div>
              <div>
                <div className="brand-name">Away</div>
                <div className="brand-sub">Hostel guide</div>
              </div>
            </div>
            <Nav />
            <p className="rail-note">
              <b>HERE</b> is the city you&apos;re in. <b>NEXT</b> is the city you&apos;re going
              to, matched to your exact dates. Built for people sleeping in hostels.
            </p>
          </aside>

          <main>{children}</main>

          <aside className="aside">
            <Aside />
          </aside>
        </div>

        <MobileTabs />
        <SwRegister />
      </body>
    </html>
  );
}
