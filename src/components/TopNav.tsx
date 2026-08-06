"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/check",
    label: "출퇴근",
    matches: ["/check", "/records", "/admin"],
  },
  {
    href: "/leave",
    label: "휴가관리",
    matches: ["/leave"],
  },
  {
    href: "/business-trips",
    label: "출장관리",
    matches: ["/business-trips"],
  },
];

const hiddenPrefixes = ["/kiosk"];

export default function TopNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <Link
          href="https://bnow0325-master.github.io/workboard/"
          className={`top-nav-workboard ${isHome ? "is-active" : ""}`}
        >
          BNOW WORKBOARD
        </Link>

        <Link href="/admin/attendance" className="top-nav-center">
          근태관리
        </Link>

        <nav aria-label="주요 메뉴" className="top-nav-actions">
          <ul>
            {navItems.map((item) => {
              const isActive = item.matches.some((prefix) =>
                prefix === "/" ? pathname === "/" : pathname.startsWith(prefix),
              );

              return (
                <li key={item.href} className="list-none">
                  <Link
                    href={item.href}
                    className={`top-nav-link ${isActive ? "is-active" : ""}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
