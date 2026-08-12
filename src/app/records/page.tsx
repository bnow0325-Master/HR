"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Employee = {
  id: string;
  code: string;
  name: string;
  department: string | null;
};

type DevelopmentEmployee = Employee & {
  active?: boolean;
  attendanceEnabled?: boolean;
};

type RecordRow = {
  date: string;
  day: number;
  checkIn: string | null;
  checkOut: string | null;
  checkInAddress: string;
  checkOutAddress: string;
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

type DevelopmentRecord = {
  type: "IN" | "OUT";
  timestamp: string;
  address: string;
  cancelledAt?: string | null;
};

const DEVELOPMENT_EMPLOYEE: Employee = {
  id: "development-chu-dong-hyeon",
  code: "DEV",
  name: "추동현",
  department: "개발 사용자",
};

const DEVELOPMENT_RECORDS_KEY = "checkinoutDevelopmentRecords";
const DEVELOPMENT_EMPLOYEES_KEY = "checkinoutDevelopmentEmployees";

function loadDevelopmentEmployees() {
  try {
    const storedEmployees = JSON.parse(
      window.localStorage.getItem(DEVELOPMENT_EMPLOYEES_KEY) ?? "[]",
    ) as DevelopmentEmployee[];
    const availableEmployees = storedEmployees.filter(
      (employee) =>
        employee.active !== false && employee.attendanceEnabled !== false,
    );

    return availableEmployees.length > 0
      ? availableEmployees
      : [DEVELOPMENT_EMPLOYEE];
  } catch {
    return [DEVELOPMENT_EMPLOYEE];
  }
}

function currentMonth() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}

function formatDuration(milliseconds: number) {
  if (milliseconds <= 0) return "-";

  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}시간 ${minutes}분`;
}

function weekday(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(`${date}T00:00:00+09:00`));
}

function buildDevelopmentRecords(
  month: string,
  employee: Employee,
): RecordsResponse {
  let storedRecords: DevelopmentRecord[] = [];

  try {
    storedRecords = JSON.parse(
      window.localStorage.getItem(DEVELOPMENT_RECORDS_KEY) ?? "[]",
    ) as DevelopmentRecord[];
  } catch {
    storedRecords = [];
  }

  const grouped = new Map<string, DevelopmentRecord[]>();
  for (const record of storedRecords) {
    if (record.cancelledAt) continue;
    const date = formatDate(new Date(record.timestamp));
    if (!date.startsWith(month)) continue;
    grouped.set(date, [...(grouped.get(date) ?? []), record]);
  }

  let totalMilliseconds = 0;
  const rows = Array.from(grouped.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, dayRecords]) => {
      const sortedDayRecords = [...dayRecords].sort(
        (left, right) =>
          new Date(left.timestamp).getTime() -
          new Date(right.timestamp).getTime(),
      );
      const checkIn = sortedDayRecords[0] ?? null;
      const checkOut =
        sortedDayRecords.length > 1 ? sortedDayRecords.at(-1) ?? null : null;
      const checkInDate = checkIn ? new Date(checkIn.timestamp) : null;
      const checkOutDate = checkOut ? new Date(checkOut.timestamp) : null;
      const workMilliseconds =
        checkInDate && checkOutDate
          ? Math.max(0, checkOutDate.getTime() - checkInDate.getTime())
          : 0;

      totalMilliseconds += workMilliseconds;

      return {
        date,
        day: Number(date.slice(-2)),
        checkIn: checkInDate ? formatTime(checkInDate) : null,
        checkOut: checkOutDate ? formatTime(checkOutDate) : null,
        checkInAddress: checkIn?.address || "-",
        checkOutAddress: checkOut?.address || "-",
        workTime: formatDuration(workMilliseconds),
        open: Boolean(checkIn && !checkOut),
      };
    });

  return {
    month,
    monthLabel: formatMonthLabel(month),
    isManager: false,
    employees: [employee],
    groups: [
      {
        employee,
        rows,
        totalTime: formatDuration(totalMilliseconds),
      },
    ],
  };
}

function RecordsPageContent() {
  const isDevelopment = process.env.NODE_ENV === "development";
  const [employees, setEmployees] = useState<Employee[]>(
    isDevelopment ? [DEVELOPMENT_EMPLOYEE] : [],
  );
  const [employeeId, setEmployeeId] = useState(
    isDevelopment ? DEVELOPMENT_EMPLOYEE.id : "",
  );
  const [month, setMonth] = useState(currentMonth);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<RecordsResponse | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (isDevelopment) {
      setEmployees(loadDevelopmentEmployees());
      return;
    }

    fetch("/api/employees", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error ?? "직원 정보를 불러오지 못했습니다.");
        }
        return response.json();
      })
      .then((data) => {
        setEmployees((data.employees ?? []) as Employee[]);
      })
      .catch((loadError: Error) => {
        setEmployees([]);
        setError(loadError.message);
      });
  }, [isDevelopment]);

  useEffect(() => {
    if (employees.length === 0) return;

    const matched = employees[0] ?? null;

    if (!matched) {
      setError("로그인한 사용자의 기록을 찾지 못했습니다.");
      return;
    }

    setEmployeeId(matched.id);
    setError("");
    window.sessionStorage.setItem("workboardEmployeeName", matched.name);
    window.sessionStorage.setItem("workboardEmployeeId", matched.id);
  }, [employees]);

  useEffect(() => {
    if (!employeeId) return;

    if (isDevelopment) {
      const employee =
        employees.find((item) => item.id === employeeId) ??
        DEVELOPMENT_EMPLOYEE;
      setRecords(buildDevelopmentRecords(month, employee));
      setError("");
      return;
    }

    let cancelled = false;

    async function loadRecords() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month }),
        });
        const data = (await response.json()) as RecordsResponse;
        if (cancelled) return;

        if (!response.ok) {
          setError(data.error ?? "기록을 불러오지 못했습니다.");
          return;
        }
        setRecords(data);
      } catch {
        if (!cancelled) {
          setError("기록을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRecords();

    return () => {
      cancelled = true;
    };
  }, [employeeId, employees, isDevelopment, month, refreshKey]);

  const currentEmployee =
    employees.find((employee) => employee.id === employeeId) ??
    (isDevelopment ? DEVELOPMENT_EMPLOYEE : null);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">출퇴근 기록부</h1>
          <p className="text-sm text-slate-500">
            로그인한 사용자의 월간 출퇴근 시간과 접속 위치를 확인합니다.
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
            {currentEmployee
              ? `${currentEmployee.name} (${currentEmployee.code})`
              : "로그인 사용자 확인 중"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowMonthPicker((value) => !value)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            월별 보기
          </button>
          <span className="text-sm font-semibold text-slate-700">
            {formatMonthLabel(month)}
          </span>
          {showMonthPicker && (
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          )}
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading || !employeeId}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "조회 중" : "조회"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {error}
          </div>
        )}
      </section>

      {loading || !records ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center text-slate-400">
          로그인한 사용자의 기록을 불러오는 중입니다.
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

              {group.rows.length === 0 ? (
                <div className="px-4 py-16 text-center text-sm text-slate-400">
                  이 달에 등록된 출퇴근 기록이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
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
                            {row.checkInAddress}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {row.checkOutAddress}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800">
                            {row.workTime}
                          </td>
                          <td className="px-4 py-3">
                            {row.open ? (
                              <span className="text-amber-500">근무중</span>
                            ) : (
                              <span className="text-slate-400">완료</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

export default function RecordsPage() {
  return <RecordsPageContent />;
}
