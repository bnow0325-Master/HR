"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  isEmployeePath,
  workboardLoginUrl,
} from "@/lib/workboardSsoClient";

type CurrentEmployee = {
  name: string;
  code: string;
  department: string | null;
};

export default function WorkboardUserStatus() {
  const pathname = usePathname();
  const isDevelopment = process.env.NODE_ENV === "development";
  const [employee, setEmployee] = useState<CurrentEmployee | null>(
    isDevelopment
      ? { name: "추동현", code: "DEV", department: "개발 사용자" }
      : null,
  );
  const [loading, setLoading] = useState(!isDevelopment);

  useEffect(() => {
    if (isDevelopment) return;

    let cancelled = false;
    setLoading(true);

    async function loadCurrentEmployee() {
      try {
        const response = await fetch("/api/auth/company/me", {
          cache: "no-store",
        });
        if (cancelled) return;

        if (response.ok) {
          const data = (await response.json()) as {
            employee?: CurrentEmployee;
          };
          setEmployee(data.employee ?? null);
          setLoading(false);
          return;
        }

        setEmployee(null);
        setLoading(false);
        if (response.status === 401 && isEmployeePath(pathname)) {
          window.location.replace(workboardLoginUrl(pathname));
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCurrentEmployee();
    return () => {
      cancelled = true;
    };
  }, [isDevelopment, pathname]);

  if (loading) {
    return (
      <div className="top-nav-user is-loading" aria-live="polite">
        <span className="top-nav-user-dot" />
        로그인 확인 중
      </div>
    );
  }

  if (employee) {
    return (
      <Link
        href="/profile"
        className="top-nav-user is-signed-in"
        aria-label={`${employee.name} 내 정보 관리`}
        title="내 정보 관리"
      >
        <span className="top-nav-user-dot" />
        <strong>{employee.name}</strong>
        <span>{employee.department || `사번 ${employee.code}`}</span>
      </Link>
    );
  }

  return (
    <Link href={workboardLoginUrl(pathname)} className="top-nav-user is-missing">
      <span className="top-nav-user-dot" />
      사내 통합 로그인
    </Link>
  );
}
