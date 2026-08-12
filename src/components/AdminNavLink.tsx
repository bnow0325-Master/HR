"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminNavLink() {
  const pathname = usePathname();
  const isDevelopment = process.env.NODE_ENV === "development";
  const [visible, setVisible] = useState(isDevelopment);

  useEffect(() => {
    if (isDevelopment) return;

    let cancelled = false;

    async function checkAdminRole() {
      try {
        const response = await fetch("/api/auth/workboard/me", {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;

        const data = (await response.json()) as {
          employee?: { systemRole?: string };
        };
        if (!cancelled) {
          setVisible(data.employee?.systemRole === "ADMIN");
        }
      } catch {
        if (!cancelled) setVisible(false);
      }
    }

    void checkAdminRole();
    return () => {
      cancelled = true;
    };
  }, [isDevelopment]);

  if (!visible) return null;

  const isActive = pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <li className="list-none">
      <Link
        href="/admin"
        className={`top-nav-link top-nav-admin-link ${isActive ? "is-active" : ""}`}
        aria-current={isActive ? "page" : undefined}
      >
        ADMIN
      </Link>
    </li>
  );
}
