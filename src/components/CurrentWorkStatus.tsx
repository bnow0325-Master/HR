"use client";

import { useEffect, useState } from "react";

type AttendanceEvent = {
  timestamp: string;
};

type WorkStatus = {
  checkIn: Date;
};

const DEVELOPMENT_EMPLOYEE_ID = "development-chu-dong-hyeon";
const DEVELOPMENT_RECORDS_KEY = "checkinoutDevelopmentRecords";

function kstDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function formatClock(date: Date) {
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function summarizeToday(events: AttendanceEvent[]) {
  const today = kstDate(new Date());
  const todayEvents = events
    .map((event) => new Date(event.timestamp))
    .filter(
      (timestamp) =>
        !Number.isNaN(timestamp.getTime()) && kstDate(timestamp) === today,
    )
    .sort((left, right) => left.getTime() - right.getTime());

  if (todayEvents.length === 0) return null;

  return {
    checkIn: todayEvents[0],
  };
}

export default function CurrentWorkStatus({
  refreshKey = 0,
}: {
  refreshKey?: number;
}) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const [status, setStatus] = useState<WorkStatus | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    async function loadStatus() {
      if (isDevelopment) {
        try {
          const events = JSON.parse(
            window.localStorage.getItem(DEVELOPMENT_RECORDS_KEY) ?? "[]",
          ) as AttendanceEvent[];
          setStatus(summarizeToday(events));
        } catch {
          setStatus(null);
        }
        return;
      }

      const employeeId =
        window.sessionStorage.getItem("workboardEmployeeId") ?? "";
      if (!employeeId || employeeId === DEVELOPMENT_EMPLOYEE_ID) return;

      const params = new URLSearchParams({
        employeeId,
        date: kstDate(new Date()),
      });
      const response = await fetch(`/api/attendance?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) return;

      const data = await response.json();
      setStatus(summarizeToday(data.records ?? []));
    }

    void loadStatus();
  }, [isDevelopment, refreshKey]);

  useEffect(() => {
    if (!status) return;

    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  if (!status) return null;

  const elapsed = formatElapsed(now.getTime() - status.checkIn.getTime());

  return (
    <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-5 py-5 shadow-sm">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold tracking-wide text-blue-600">
            오늘 출근시간
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900">
            {formatClock(status.checkIn)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-bold tabular-nums text-blue-700">
            {elapsed}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-500">
            근무시간
          </div>
        </div>
      </div>
    </section>
  );
}
