"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import WorkboardUserStatus from "@/components/WorkboardUserStatus";

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
  {
    href: "/admin/employees",
    label: "명부관리",
    matches: ["/admin/employees"],
  },
];

const hiddenPrefixes = ["/kiosk", "/auth/workboard"];

export default function TopNav() {
  const pathname = usePathname();
  const isAttendanceHome = pathname === "/" || pathname === "/attendance";

  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <Link
          href="https://bnow0325-master.github.io/workboard/"
          className="top-nav-workboard"
        >
          BNOW WORKBOARD
        </Link>

        <Link
          href="/attendance"
          className={`top-nav-center ${isAttendanceHome ? "is-active" : ""}`}
          aria-current={isAttendanceHome ? "page" : undefined}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3 10 9-7 9 7" />
            <path d="M5 9v11h14V9" />
            <path d="M9 20v-6h6v6" />
          </svg>
          <span>인사관리 홈</span>
        </Link>

        <div className="top-nav-right">
          <WorkboardUserStatus />
          <nav aria-label="주요 메뉴" className="top-nav-actions">
            <ul>
              {navItems.map((item) => {
                const isActive = item.matches.some((prefix) =>
                  prefix === "/" || prefix === "/admin"
                    ? pathname === prefix
                    : pathname.startsWith(prefix),
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
      </div>
    </header>
  );
}
