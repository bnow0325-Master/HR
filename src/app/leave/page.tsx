"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  currentLeavePeriod,
  minutesToDays,
  statutoryAnnualLeaveDays,
} from "@/lib/annualLeave";

type Employee = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  position: string | null;
  email: string | null;
  hireDate: string | null;
  workMinutesPerDay: number;
  active: boolean;
};

type LeaveRequest = {
  id: string;
  employeeId?: string;
  leaveType: "ANNUAL" | "AM_HALF" | "PM_HALF";
  leaveDate: string;
  unitsMinutes: number;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "CHANGE_REQUESTED" | "CANCELLED";
  createdAt: string;
};

type LeaveSummary = {
  grantedDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  periodStart: string;
  periodEnd: string;
};

const DEVELOPMENT_EMPLOYEES_KEY = "checkinoutDevelopmentEmployees";
const DEVELOPMENT_LEAVE_REQUESTS_KEY =
  "checkinoutDevelopmentLeaveRequests";
const DEVELOPMENT_EMPLOYEE: Employee = {
  id: "development-chu-dong-hyeon",
  code: "DEV",
  name: "추동현",
  department: "개발 사용자",
  position: "개발",
  email: null,
  hireDate: "2024-01-01",
  workMinutesPerDay: 480,
  active: true,
};

function parseDateOnly(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function leaveTypeLabel(type: LeaveRequest["leaveType"]) {
  if (type === "AM_HALF") return "오전 반차";
  if (type === "PM_HALF") return "오후 반차";
  return "연차";
}

function statusLabel(status: LeaveRequest["status"]) {
  if (status === "APPROVED") return "확정";
  if (status === "CHANGE_REQUESTED") return "시기변경 요청";
  if (status === "CANCELLED") return "취소";
  return "신청 중";
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

function readDevelopmentRequests() {
  try {
    return JSON.parse(
      window.localStorage.getItem(DEVELOPMENT_LEAVE_REQUESTS_KEY) ?? "[]",
    ) as LeaveRequest[];
  } catch {
    return [];
  }
}

function buildDevelopmentSummary(
  employee: Employee,
  requests: LeaveRequest[],
) {
  if (!employee.hireDate) return null;

  const hireDate = parseDateOnly(employee.hireDate);
  const now = new Date();
  const period = currentLeavePeriod(hireDate, now);
  const periodRequests = requests.filter((request) => {
    const date = new Date(request.leaveDate);
    return (
      (request.employeeId === undefined ||
        request.employeeId === employee.id) &&
      date >= period.start &&
      date < period.end
    );
  });
  const approvedMinutes = periodRequests
    .filter((request) => request.status === "APPROVED")
    .reduce((sum, request) => sum + request.unitsMinutes, 0);
  const pendingMinutes = periodRequests
    .filter((request) => request.status === "PENDING")
    .reduce((sum, request) => sum + request.unitsMinutes, 0);
  const grantedDays = statutoryAnnualLeaveDays(hireDate, now);
  const grantedMinutes = grantedDays * employee.workMinutesPerDay;

  return {
    summary: {
      grantedDays,
      usedDays: minutesToDays(
        approvedMinutes,
        employee.workMinutesPerDay,
      ),
      pendingDays: minutesToDays(
        pendingMinutes,
        employee.workMinutesPerDay,
      ),
      remainingDays: minutesToDays(
        Math.max(0, grantedMinutes - approvedMinutes - pendingMinutes),
        employee.workMinutesPerDay,
      ),
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
    },
    requests: periodRequests,
  };
}

export default function LeavePage() {
  const isDevelopment = process.env.NODE_ENV === "development";
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [summary, setSummary] = useState<LeaveSummary | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [leaveType, setLeaveType] =
    useState<LeaveRequest["leaveType"]>("ANNUAL");
  const [leaveDate, setLeaveDate] = useState("");
  const [reason, setReason] = useState("");

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
      const localRequests = readDevelopmentRequests();
      const result = buildDevelopmentSummary(matched, localRequests);

      setEmployee(matched);
      setRequests(result?.requests ?? []);
      setSummary(result?.summary ?? null);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/leave", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ ok: false, text: data.error });
        return;
      }
      setEmployee(data.employee);
      setSummary(data.summary);
      setRequests(data.requests);
    } catch {
      setMessage({ ok: false, text: "휴가 정보를 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!employee || !summary || !leaveDate) {
      setMessage({ ok: false, text: "휴가 날짜를 선택해 주세요." });
      return;
    }

    const unitsMinutes =
      leaveType === "ANNUAL"
        ? employee.workMinutesPerDay
        : Math.round(employee.workMinutesPerDay / 2);

    if (isDevelopment) {
      const selectedDate = parseDateOnly(leaveDate);
      const periodStart = new Date(summary.periodStart);
      const periodEnd = new Date(summary.periodEnd);
      if (selectedDate < periodStart || selectedDate >= periodEnd) {
        setMessage({
          ok: false,
          text: "현재 연차기간 안의 날짜를 선택해 주세요.",
        });
        return;
      }
      if (
        minutesToDays(unitsMinutes, employee.workMinutesPerDay) >
        summary.remainingDays
      ) {
        setMessage({ ok: false, text: "사용 가능한 연차가 부족합니다." });
        return;
      }
      if (
        requests.some(
          (request) =>
            request.leaveDate.slice(0, 10) === leaveDate &&
            ["PENDING", "APPROVED"].includes(request.status),
        )
      ) {
        setMessage({
          ok: false,
          text: "해당 날짜에 이미 신청한 휴가가 있습니다.",
        });
        return;
      }

      const nextRequests: LeaveRequest[] = [
        {
          id: `development-leave-${Date.now()}`,
          employeeId: employee.id,
          leaveType,
          leaveDate: selectedDate.toISOString(),
          unitsMinutes,
          reason: reason.trim() || null,
          status: "PENDING",
          createdAt: new Date().toISOString(),
        },
        ...readDevelopmentRequests(),
      ];
      window.localStorage.setItem(
        DEVELOPMENT_LEAVE_REQUESTS_KEY,
        JSON.stringify(nextRequests),
      );
      setLeaveDate("");
      setReason("");
      await load();
      setMessage({ ok: true, text: "휴가 신청을 등록했습니다." });
      return;
    }

    const response = await fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leaveType,
        leaveDate,
        reason,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage({
        ok: false,
        text: data.error ?? "휴가 신청에 실패했습니다.",
      });
      return;
    }

    setLeaveDate("");
    setReason("");
    await load();
    setMessage({ ok: true, text: "휴가 신청을 등록했습니다." });
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">휴가 관리</h1>
          <p className="mt-2 text-sm text-slate-500">
            연차 현황을 한눈에 확인하고 휴가를 신청할 수 있습니다.
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
            <div>입사일 {employee.hireDate?.slice(0, 10) ?? "미등록"}</div>
            {summary && (
              <div className="mt-1">
                연차기간 {formatDate(summary.periodStart)} ~{" "}
                {formatDate(
                  new Date(new Date(summary.periodEnd).getTime() - 86400000),
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center text-slate-400">
          휴가 정보를 불러오는 중입니다.
        </div>
      ) : summary ? (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard label="발생 연차" value={summary.grantedDays} />
            <SummaryCard label="사용한 연차" value={summary.usedDays} />
            <SummaryCard label="승인 대기" value={summary.pendingDays} />
            <SummaryCard
              label="사용 가능 연차"
              value={summary.remainingDays}
              accent
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <form
              onSubmit={submitRequest}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-xl font-bold text-slate-900">휴가 신청</h2>
              <p className="mt-1 text-sm text-slate-500">
                휴가 종류와 날짜를 선택해 신청하세요.
              </p>
              <div className="mt-4 flex flex-col gap-3">
                <label className="text-sm font-medium text-slate-600">
                  휴가 종류
                  <select
                    value={leaveType}
                    onChange={(event) =>
                      setLeaveType(
                        event.target.value as LeaveRequest["leaveType"],
                      )
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800"
                  >
                    <option value="ANNUAL">연차</option>
                    <option value="AM_HALF">오전 반차</option>
                    <option value="PM_HALF">오후 반차</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-600">
                  사용 날짜
                  <input
                    type="date"
                    value={leaveDate}
                    onChange={(event) => setLeaveDate(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800"
                  />
                </label>
                <label className="text-sm font-medium text-slate-600">
                  사유
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="선택 입력"
                    rows={3}
                    className="mt-1.5 w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800"
                  />
                </label>
                <button
                  type="submit"
                  className="mt-1 rounded-lg bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark"
                >
                  휴가 신청
                </button>
              </div>
            </form>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-xl font-bold text-slate-900">
                  내 신청 내역
                </h2>
              </div>
              {requests.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">
                  신청한 휴가가 없습니다.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {requests.map((request) => (
                    <div
                      key={request.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                    >
                      <div>
                        <div className="font-semibold text-slate-800">
                          {formatDate(request.leaveDate)} ·{" "}
                          {leaveTypeLabel(request.leaveType)}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {request.reason || "사유 없음"}
                        </div>
                      </div>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                        {statusLabel(request.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center text-slate-400">
          입사일을 등록하면 연차 현황을 계산할 수 있습니다.
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

function SummaryCard({
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
        <span className="ml-1 text-base font-medium">일</span>
      </div>
    </div>
  );
}
