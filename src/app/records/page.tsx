"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Employee = {
  id: string;
  code: string;
  name: string;
  department: string | null;
};

type RecordRow = {
  date: string;
  day: number;
  checkIn: string | null;
  checkOut: string | null;
  checkInAddress: string;
  checkOutAddress: string;
  checkInLatitude: number | null;
  checkInLongitude: number | null;
  checkOutLatitude: number | null;
  checkOutLongitude: number | null;
  workTime: string;
  open: boolean;
};

type RecordGroup = {
  employee: Employee;
  rows: RecordRow[];
  totalTime: string;
};

type RecordsResponse = {
  month: string;
  monthLabel: string;
  isManager: boolean;
  employees: Employee[];
  groups: RecordGroup[];
  error?: string;
};

function currentMonth() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

function weekday(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(`${date}T00:00:00+09:00`));
}

export default function RecordsPage() {
  const searchParams = useSearchParams();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<RecordsResponse | null>(null);
  const [error, setError] = useState("");

  const requestedEmployeeName = useMemo(
    () => searchParams.get("name")?.trim() ?? "",
    [searchParams],
  );

  useEffect(() => {
    fetch("/api/employees")
      .then((res) => res.json())
      .then((data) => setEmployees(data.employees ?? []))
      .catch(() => setEmployees([]));
  }, []);

  async function loadRecords(nextEmployeeId = employeeId, nextMonth = month) {
    setError("");
    setRecords(null);
    if (!nextEmployeeId) {
      setError("로그인된 사용자의 기록을 찾지 못했습니다.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: nextEmployeeId,
          month: nextMonth,
        }),
      });
      const data = (await res.json()) as RecordsResponse;
      if (!res.ok) {
        setError(data.error ?? "기록을 불러오지 못했습니다.");
        return;
      }
      setRecords(data);
    } catch {
      setError("기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (employees.length === 0) return;

    const storedEmployeeId =
      typeof window === "undefined"
        ? ""
        : window.sessionStorage.getItem("workboardEmployeeId") ?? "";
    const storedEmployeeName =
      typeof window === "undefined"
        ? ""
        : window.sessionStorage.getItem("workboardEmployeeName") ?? "";

    const matchedById =
      storedEmployeeId &&
      employees.find((employee) => employee.id === storedEmployeeId);
    const matchedByName =
      (requestedEmployeeName || storedEmployeeName) &&
      employees.find(
        (employee) =>
          employee.name.trim() ===
          (requestedEmployeeName || storedEmployeeName).trim(),
      );
    const matched = matchedById ?? matchedByName ?? null;

    if (!matched) {
      setError("로그인된 사용자의 기록을 찾지 못했습니다.");
      return;
    }

    window.sessionStorage.setItem("workboardEmployeeName", matched.name);
    window.sessionStorage.setItem("workboardEmployeeId", matched.id);

    if (employeeId === matched.id && records) {
      return;
    }

    setEmployeeId(matched.id);
    void loadRecords(matched.id, month);
  }, [employeeId, employees, month, records, requestedEmployeeName]);

  function changeMonth(value: string) {
    setMonth(value);
    if (records) {
      void loadRecords(employeeId, value);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">출퇴근 기록부</h1>
          <p className="text-sm text-slate-500">
            로그인된 사용자의 월간 출퇴근 시간과 접속 위치를 확인합니다.
          </p>
        </div>
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-600">
          홈
        </Link>
      </div>

      <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span className="font-medium text-slate-800">조회 대상</span>
          <span className="ml-2">
            {records?.groups[0]?.employee
              ? `${records.groups[0].employee.name} (${records.groups[0].employee.code})`
              : "로그인 사용자 확인 중…"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowMonthPicker((value) => !value)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            월별보기
          </button>
          <span className="text-sm font-semibold text-slate-700">
            {monthLabel(month)}
          </span>
          {showMonthPicker && (
            <input
              type="month"
              value={month}
              onChange={(event) => changeMonth(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {error}
          </div>
        )}
      </section>

      {!records ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center text-slate-400">
          로그인된 사용자의 기록을 불러오는 중입니다.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {records.groups.map((group) => (
            <section
              key={group.employee.id}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h2 className="font-bold text-slate-800">
                    {group.employee.name}
                    <span className="ml-1 text-sm font-normal text-slate-400">
                      ({group.employee.code})
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    {group.employee.department ?? "부서 미지정"} ·{" "}
                    {records.monthLabel}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  합산 {group.totalTime}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="bg-white text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">일자</th>
                      <th className="px-4 py-3 font-medium">출근</th>
                      <th className="px-4 py-3 font-medium">퇴근</th>
                      <th className="px-4 py-3 font-medium">출근 위치</th>
                      <th className="px-4 py-3 font-medium">퇴근 위치</th>
                      <th className="px-4 py-3 font-medium">근무시간</th>
                      <th className="px-4 py-3 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.rows.map((row) => (
                      <tr key={row.date}>
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {row.day}일
                          <span className="ml-1 text-xs text-slate-400">
                            {weekday(row.date)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {row.checkIn ?? "-"}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {row.checkOut ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <div>{row.checkInAddress}</div>
                          {row.checkInLatitude !== null &&
                          row.checkInLongitude !== null ? (
                            <div className="mt-1 text-slate-400">
                              {row.checkInLatitude.toFixed(6)} / {row.checkInLongitude.toFixed(6)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <div>{row.checkOutAddress}</div>
                          {row.checkOutLatitude !== null &&
                          row.checkOutLongitude !== null ? (
                            <div className="mt-1 text-slate-400">
                              {row.checkOutLatitude.toFixed(6)} / {row.checkOutLongitude.toFixed(6)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {row.workTime}
                        </td>
                        <td className="px-4 py-3">
                          {row.open ? (
                            <span className="text-amber-500">근무중</span>
                          ) : row.checkIn || row.checkOut ? (
                            <span className="text-slate-400">완료</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50">
                    <tr>
                      <td className="px-4 py-3 font-bold" colSpan={5}>
                        월 합산
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-700">
                        {group.totalTime}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
