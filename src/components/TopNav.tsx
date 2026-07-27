"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "출퇴근관리" },
  { href: "/check", label: "출퇴근" },
];

const hiddenPrefixes = ["/kiosk"];

export default function TopNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="https://bnow0325-master.github.io/workboard/"
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
            isHome
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          비노우 메인보드
        </Link>

        <nav aria-label="주요 메뉴">
          <ul className="list-none flex items-center gap-2 text-sm font-medium">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <li key={item.href} className="list-none">
                  <Link
                    href={item.href}
                    className={`rounded-full px-4 py-2 transition ${
                      isActive
                        ? "bg-brand text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
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
