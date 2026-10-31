"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Here", icon: "◉", exact: true },
  { href: "/next", label: "Next", icon: "✈", exact: false },
  { href: "/post", label: "Post", icon: "＋", exact: false },
];

export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="nav" aria-label="Main">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} data-active={isActive(i.href, i.exact)}>
          <span className="nic" aria-hidden="true">{i.icon}</span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileTabs() {
  const pathname = usePathname();
  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="mobile-tabs">
      <div className="inner">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} data-active={isActive(i.href, i.exact)}>
            <span className="tic" aria-hidden="true">{i.icon}</span>
            {i.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
