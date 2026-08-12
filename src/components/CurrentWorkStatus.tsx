"use client";

import { useEffect, useState } from "react";

type AttendanceEvent = {
  type?: "IN" | "OUT";
  timestamp: string;
  cancelledAt?: string | null;
};

type WorkStatus = {
  checkIn: Date;
  checkOut: Date | null;
};

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
    .filter((event) => !event.cancelledAt)
    .map((event) => ({
      type: event.type,
      timestamp: new Date(event.timestamp),
    }))
    .filter(
      (event) =>
        !Number.isNaN(event.timestamp.getTime()) &&
        kstDate(event.timestamp) === today,
    )
    .sort(
      (left, right) =>
        left.timestamp.getTime() - right.timestamp.getTime(),
    );

  if (todayEvents.length === 0) return null;

  const checkIn =
    todayEvents.find((event) => event.type === "IN") ?? todayEvents[0];
  const checkOut =
    [...todayEvents]
      .reverse()
      .find(
        (event) =>
          event.type === "OUT" &&
          event.timestamp.getTime() >= checkIn.timestamp.getTime(),
      ) ?? null;

  return {
    checkIn: checkIn.timestamp,
    checkOut: checkOut?.timestamp ?? null,
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

      const params = new URLSearchParams({
        mine: "1",
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
    if (!status || status.checkOut) return;

    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  if (!status) return null;

  const elapsedUntil = status.checkOut ?? now;
  const elapsed = formatElapsed(
    elapsedUntil.getTime() - status.checkIn.getTime(),
  );

  return (
    <section
      data-testid="current-work-status"
      className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-5 py-5 shadow-sm"
    >
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
          <div
            data-testid="elapsed-work-time"
            className="font-mono text-3xl font-bold tabular-nums text-blue-700"
          >
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
