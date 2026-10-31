"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE = [
  { href: "/", label: "Here", icon: "◉", exact: true },
  { href: "/next", label: "Next", icon: "✈", exact: false },
  { href: "/explore", label: "Explore", icon: "◎", exact: false },
  { href: "/trips", label: "Trips", icon: "▤", exact: false },
];

const MOBILE = [...BASE, { href: "/you", label: "You", icon: "☺", exact: false }];

function useIsActive() {
  const pathname = usePathname();
  return (href: string, exact: boolean) => (exact ? pathname === href : pathname.startsWith(href));
}

export function Nav({ staff, admin }: { staff: boolean; admin: boolean }) {
  const isActive = useIsActive();

  return (
    <nav className="nav" aria-label="Main">
      {BASE.map((item) => (
        <Link key={item.href} href={item.href} data-active={isActive(item.href, item.exact)}>
          <span className="nic" aria-hidden="true">
            {item.icon}
          </span>
          {item.label}
        </Link>
      ))}

      {staff ? (
        <>
          <div className="nav-divider">Hostel</div>
          <Link href="/hostel-admin" data-active={isActive("/hostel-admin", false)}>
            <span className="nic" aria-hidden="true">
              ⌂
            </span>
            Portal
          </Link>
          <Link href="/post" data-active={isActive("/post", false)}>
            <span className="nic" aria-hidden="true">
              ＋
            </span>
            Post tonight
          </Link>
          <Link href="/hostel-admin/kit" data-active={isActive("/hostel-admin/kit", false)}>
            <span className="nic" aria-hidden="true">
              ▦
            </span>
            Partner kit
          </Link>
        </>
      ) : null}

      {admin ? (
        <>
          <div className="nav-divider">Ops</div>
          <Link href="/admin/cities" data-active={isActive("/admin/cities", false)}>
            <span className="nic" aria-hidden="true">
              ⊞
            </span>
            Cities
          </Link>
          <Link href="/admin/ingest" data-active={isActive("/admin/ingest", false)}>
            <span className="nic" aria-hidden="true">
              ⤓
            </span>
            Ingest
          </Link>
        </>
      ) : null}
    </nav>
  );
}

export function MobileTabs() {
  const isActive = useIsActive();

  return (
    <div className="mobile-tabs">
      <div className="inner">
        {MOBILE.map((item) => (
          <Link key={item.href} href={item.href} data-active={isActive(item.href, item.exact)}>
            <span className="tic" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
