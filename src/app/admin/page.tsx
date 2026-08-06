import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/adminAuth";
import LogoutButton from "./LogoutButton";
import {
  aggregate,
  formatMinutes,
  periodRange,
  type Period,
} from "@/lib/stats";

// 관리자 대시보드 — 기간별(오늘/주간/월간/연간) 근태 집계 (서버 컴포넌트)
export const dynamic = "force-dynamic";

const TABS: { key: Period; label: string }[] = [
  { key: "today", label: "오늘" },
  { key: "week", label: "주간" },
  { key: "month", label: "월간" },
  { key: "year", label: "연간" },
];

function fmtTime(d: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtCoordinate(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return value.toFixed(6);
}

function fmtAddress(value: string | null | undefined) {
  return value?.trim() || "주소 없음";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const { period: periodParam } = await searchParams;
  const period: Period = TABS.some((t) => t.key === periodParam)
    ? (periodParam as Period)
    : "today";

  const now = new Date();
  const { start, end, label } = periodRange(period, now);

  const records = await prisma.attendanceRecord.findMany({
    where: {
      cancelledAt: null,
      timestamp: { gte: start, lte: end },
    },
    include: {
      employee: { select: { name: true, code: true, department: true } },
    },
    orderBy: { timestamp: period === "today" ? "desc" : "asc" },
    take: 2000,
  });

  const summaries = aggregate(records);
  const totalMinutes = summaries.reduce((s, e) => s + e.totalMinutes, 0);
  const activeEmployees = summaries.length;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">관리자 대시보드</h1>
          <p className="text-sm text-slate-500">근태 집계 · {label}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/admin/attendance"
            className="font-medium text-brand hover:underline"
          >
            LIVECARE 원장
          </Link>
          <Link
            href="/admin/employees"
            className="font-medium text-brand hover:underline"
          >
            직원 관리
          </Link>
          <LogoutButton />
          <Link href="/" className="text-slate-400 hover:text-slate-600">
            홈
          </Link>
        </div>
      </div>

      {/* 기간 탭 */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin?period=${t.key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              t.key === period
                ? "bg-brand text-white"
                : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </Link>
        ))}
        <a
          href={`/api/attendance/export?period=${period}`}
          className="ml-auto rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          ⬇ CSV 내보내기
        </a>
      </div>

      {/* 요약 카드 */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <SummaryCard label="출근 직원" value={`${activeEmployees}명`} />
        <SummaryCard label="총 기록" value={`${records.length}건`} />
        <SummaryCard label="총 근무시간" value={formatMinutes(totalMinutes)} />
      </div>

      {period === "today" ? (
        <TodayList records={records} />
      ) : (
        <SummaryTable summaries={summaries} />
      )}

      <p className="mt-4 text-xs text-slate-400">
        근무시간 = 출근-퇴근 쌍의 합계(한국 시간 기준). 퇴근 미기록 세션은 시간에
        포함되지 않습니다.
      </p>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-800">{value}</div>
    </div>
  );
}

function SummaryTable({
  summaries,
}: {
  summaries: ReturnType<typeof aggregate>;
}) {
  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-400">
        이 기간에 기록이 없습니다.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">직원</th>
            <th className="px-4 py-3 font-medium">부서</th>
            <th className="px-4 py-3 font-medium">출근일수</th>
            <th className="px-4 py-3 font-medium">근무세션</th>
            <th className="px-4 py-3 font-medium">총 근무시간</th>
            <th className="px-4 py-3 font-medium">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {summaries.map((e) => (
            <tr key={e.employeeId}>
              <td className="px-4 py-3">
                {e.name}
                <span className="ml-1 text-slate-400">({e.code})</span>
              </td>
              <td className="px-4 py-3 text-slate-500">
                {e.department ?? "-"}
              </td>
              <td className="px-4 py-3">{e.workDays}일</td>
              <td className="px-4 py-3">{e.sessions}회</td>
              <td className="px-4 py-3 font-medium">
                {formatMinutes(e.totalMinutes)}
              </td>
              <td className="px-4 py-3">
                {e.openSession ? (
                  <span className="text-amber-500">근무중</span>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TodayList({
  records,
}: {
  records: {
    id: string;
    type: string;
    timestamp: Date;
    verified: boolean;
    latitude: number | null;
    longitude: number | null;
    note: string | null;
    employee: { name: string; code: string; department: string | null };
  }[];
}) {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-400">
        오늘 기록이 아직 없습니다.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">시간</th>
            <th className="px-4 py-3 font-medium">직원</th>
            <th className="px-4 py-3 font-medium">부서</th>
            <th className="px-4 py-3 font-medium">구분</th>
            <th className="px-4 py-3 font-medium">위치</th>
            <th className="px-4 py-3 font-medium">확인</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3 font-mono text-slate-700">
                {fmtTime(r.timestamp)}
              </td>
              <td className="px-4 py-3">
                {r.employee.name}
                <span className="ml-1 text-slate-400">({r.employee.code})</span>
              </td>
              <td className="px-4 py-3 text-slate-500">
                {r.employee.department ?? "-"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    r.type === "IN"
                      ? "bg-blue-50 text-blue-600"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {r.type === "IN" ? "출근" : "퇴근"}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate-600">
                <div>{fmtAddress(r.note)}</div>
                <div>위도 {fmtCoordinate(r.latitude)}</div>
                <div>경도 {fmtCoordinate(r.longitude)}</div>
              </td>
              <td className="px-4 py-3">
                {r.verified ? (
                  <span className="text-emerald-600" title="위치 확인됨">
                    ✓ 현장확인
                  </span>
                ) : (
                  <span className="text-amber-500">미확인</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
