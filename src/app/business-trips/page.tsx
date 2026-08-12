"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Employee = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  position: string | null;
  active: boolean;
};

type BusinessTrip = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "REGISTERED" | "CANCELLED";
  createdAt: string;
};

const DEVELOPMENT_EMPLOYEES_KEY = "checkinoutDevelopmentEmployees";
const DEVELOPMENT_TRIPS_KEY = "checkinoutDevelopmentBusinessTrips";
const DEVELOPMENT_EMPLOYEE: Employee = {
  id: "development-chu-dong-hyeon",
  code: "DEV",
  name: "추동현",
  department: "개발 사용자",
  position: "개발",
  active: true,
};

function todayInKorea() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

function parseDateOnly(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function dateKey(value: string) {
  return value.slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function tripDays(trip: BusinessTrip) {
  const start = parseDateOnly(trip.startDate);
  const end = parseDateOnly(trip.endDate);
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function tripState(trip: BusinessTrip) {
  if (trip.status === "CANCELLED") {
    return { label: "취소", tone: "bg-slate-100 text-slate-500" };
  }

  const today = todayInKorea();
  if (today < dateKey(trip.startDate)) {
    return { label: "예정", tone: "bg-blue-50 text-blue-600" };
  }
  if (today > dateKey(trip.endDate)) {
    return { label: "완료", tone: "bg-slate-100 text-slate-600" };
  }
  return { label: "출장 중", tone: "bg-emerald-50 text-emerald-700" };
}

function readDevelopmentEmployees() {
  try {
    const employees = JSON.parse(
      window.localStorage.getItem(DEVELOPMENT_EMPLOYEES_KEY) ?? "[]",
    ) as Employee[];
    return employees.length > 0 ? employees : [DEVELOPMENT_EMPLOYEE];
  } catch {
    return [DEVELOPMENT_EMPLOYEE];
  }
}

function readDevelopmentTrips() {
  try {
    return JSON.parse(
      window.localStorage.getItem(DEVELOPMENT_TRIPS_KEY) ?? "[]",
    ) as BusinessTrip[];
  } catch {
    return [];
  }
}

export default function BusinessTripsPage() {
  const isDevelopment = process.env.NODE_ENV === "development";
  const today = todayInKorea();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [trips, setTrips] = useState<BusinessTrip[]>([]);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);

    if (isDevelopment) {
      const employees = readDevelopmentEmployees();
      const storedEmployeeId =
        window.sessionStorage.getItem("workboardEmployeeId") ?? "";
      const storedEmployeeName =
        window.sessionStorage.getItem("workboardEmployeeName") ?? "";
      const matched =
        employees.find((item) => item.id === storedEmployeeId) ??
        employees.find((item) => item.name === storedEmployeeName) ??
        employees.find((item) => item.name === DEVELOPMENT_EMPLOYEE.name) ??
        DEVELOPMENT_EMPLOYEE;
      const localTrips = readDevelopmentTrips()
        .filter((trip) => trip.employeeId === matched.id)
        .sort((a, b) => b.startDate.localeCompare(a.startDate));

      setEmployee(matched);
      setTrips(localTrips);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/business-trips", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({
          ok: false,
          text: data.error ?? "출장일지를 불러오지 못했습니다.",
        });
        return;
      }
      setEmployee(data.employee);
      setTrips(data.trips);
    } catch {
      setMessage({ ok: false, text: "출장일지를 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitTrip(event: React.FormEvent) {
    event.preventDefault();
    if (!employee || !startDate || !endDate || !reason.trim()) {
      setMessage({
        ok: false,
        text: "출장 시작일, 종료일과 출장 사유를 입력해 주세요.",
      });
      return;
    }
    if (endDate < startDate) {
      setMessage({
        ok: false,
        text: "종료일은 시작일보다 빠를 수 없습니다.",
      });
      return;
    }

    const overlaps = trips.some(
      (trip) =>
        trip.status === "REGISTERED" &&
        dateKey(trip.startDate) <= endDate &&
        dateKey(trip.endDate) >= startDate,
    );
    if (overlaps) {
      setMessage({
        ok: false,
        text: "선택한 기간과 겹치는 출장일지가 이미 있습니다.",
      });
      return;
    }

    setSubmitting(true);

    if (isDevelopment) {
      const nextTrip: BusinessTrip = {
        id: `development-trip-${Date.now()}`,
        employeeId: employee.id,
        startDate: parseDateOnly(startDate).toISOString(),
        endDate: parseDateOnly(endDate).toISOString(),
        reason: reason.trim(),
        status: "REGISTERED",
        createdAt: new Date().toISOString(),
      };
      const allTrips = [nextTrip, ...readDevelopmentTrips()];
      window.localStorage.setItem(
        DEVELOPMENT_TRIPS_KEY,
        JSON.stringify(allTrips),
      );
      setReason("");
      setSubmitting(false);
      await load();
      setMessage({ ok: true, text: "출장일지를 등록했습니다." });
      return;
    }

    try {
      const response = await fetch("/api/business-trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          reason,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({
          ok: false,
          text: data.error ?? "출장일지 등록에 실패했습니다.",
        });
        return;
      }
      setReason("");
      await load();
      setMessage({ ok: true, text: "출장일지를 등록했습니다." });
    } catch {
      setMessage({ ok: false, text: "출장일지 등록에 실패했습니다." });
    } finally {
      setSubmitting(false);
    }
  }

  const registeredTrips = trips.filter(
    (trip) => trip.status === "REGISTERED",
  );
  const upcomingCount = registeredTrips.filter(
    (trip) => today < dateKey(trip.startDate),
  ).length;
  const activeCount = registeredTrips.filter(
    (trip) =>
      dateKey(trip.startDate) <= today && today <= dateKey(trip.endDate),
  ).length;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">출장 관리</h1>
          <p className="mt-2 text-sm text-slate-500">
            출장 기간과 사유를 등록하고 출장일지를 관리합니다.
          </p>
        </div>
        <Link
          href="/admin/employees"
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          직원정보 관리
        </Link>
      </div>

      {employee && (
        <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <div>
            <div className="font-semibold text-slate-900">
              {employee.name}{" "}
              <span className="font-normal text-slate-400">
                ({employee.code})
              </span>
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {[employee.department, employee.position]
                .filter(Boolean)
                .join(" · ") || "부서 미지정"}
            </div>
          </div>
          <div className="text-right text-sm text-slate-500">
            등록된 출장 {registeredTrips.length}건
          </div>
        </section>
      )}

      {loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center text-slate-400">
          출장일지를 불러오는 중입니다.
        </div>
      ) : employee ? (
        <>
          <section className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
            <TripSummaryCard label="전체 출장" value={registeredTrips.length} />
            <TripSummaryCard label="예정" value={upcomingCount} />
            <TripSummaryCard label="출장 중" value={activeCount} accent />
          </section>

          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <form
              onSubmit={submitTrip}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-xl font-bold text-slate-900">
                출장 일정 등록
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                달력에서 출장 시작일과 종료일을 선택하세요.
              </p>

              <div className="mt-4 grid gap-3">
                <label className="text-sm font-medium text-slate-600">
                  시작일
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => {
                      const nextStart = event.target.value;
                      setStartDate(nextStart);
                      if (endDate < nextStart) setEndDate(nextStart);
                    }}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800"
                  />
                </label>
                <label className="text-sm font-medium text-slate-600">
                  종료일
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800"
                  />
                </label>
                <label className="text-sm font-medium text-slate-600">
                  출장 사유
                  <textarea
                    value={reason}
                    maxLength={1000}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="출장 목적과 업무 내용을 입력해 주세요."
                    rows={5}
                    className="mt-1.5 w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800"
                  />
                </label>
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-1 rounded-lg bg-brand px-4 py-3 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                >
                  {submitting ? "등록 중..." : "출장일지 등록"}
                </button>
              </div>
            </form>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-xl font-bold text-slate-900">
                  내 출장일지
                </h2>
              </div>
              {trips.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">
                  등록된 출장일지가 없습니다.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {trips.map((trip) => {
                    const state = tripState(trip);
                    return (
                      <article key={trip.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="font-semibold text-slate-800">
                            {formatDate(trip.startDate)} ~{" "}
                            {formatDate(trip.endDate)}
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${state.tone}`}
                          >
                            {state.label}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">
                          {trip.reason}
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          총 {tripDays(trip)}일 · 등록일{" "}
                          {formatDate(trip.createdAt)}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center text-slate-400">
          직원정보를 확인할 수 없습니다.
        </div>
      )}

      {message && (
        <div
          className={`mt-5 rounded-lg px-4 py-3 text-sm ${
            message.ok
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </div>
      )}
    </main>
  );
}

function TripSummaryCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        accent
          ? "border-blue-200 bg-blue-600 text-white"
          : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`text-sm font-medium ${
          accent ? "text-blue-100" : "text-slate-500"
        }`}
      >
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold">
        {value}
        <span className="ml-1 text-base font-medium">건</span>
      </div>
    </div>
  );
}
