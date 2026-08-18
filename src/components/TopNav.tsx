"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AdminNavLink from "@/components/AdminNavLink";
import WorkboardUserStatus from "@/components/WorkboardUserStatus";

const navItems = [
  {
    href: "/check",
    label: "출퇴근",
    matches: ["/check", "/records"],
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

const hiddenPrefixes = ["/kiosk", "/auth/company"];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isAttendanceHome = pathname === "/" || pathname === "/attendance";

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/attendance");
  }

  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <div className="top-nav-left">
          <button
            type="button"
            className="top-nav-back"
            onClick={handleBack}
            aria-label="이전 화면으로 돌아가기"
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
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>뒤로가기</span>
          </button>

          <Link
            href="https://main.bnow.co.kr/"
            className="top-nav-workboard"
          >
            BNOW WORKBOARD
          </Link>
        </div>

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
              <AdminNavLink />
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}
