import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import {
  getLivecareAttendanceDashboard,
  livecareSqlConfigured,
  type LivecareAttendanceDashboard,
} from "@/lib/livecareAttendance";
import LogoutButton from "../LogoutButton";

export const dynamic = "force-dynamic";

function formatDays(value: number | null) {
  if (value === null) return "-";
  return `${Number(value).toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
  })}일`;
}

function formatMinutes(value: number | null) {
  if (value === null || value < 0) return "-";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}시간 ${minutes}분`;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return value.replace(" ", " · ");
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </section>
  );
}

function ConnectionSetup() {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <p className="text-sm font-bold text-amber-900">
        LIVECARE 읽기 연결 설정이 필요합니다.
      </p>
      <p className="mt-2 text-sm leading-6 text-amber-800">
        아래 값을 로컬 <code>.env</code>와 Vercel 서버 환경변수에 등록하면
        이 화면에서 운영 원장을 조회할 수 있습니다. 비밀번호는 Git에 저장하지
        않습니다.
      </p>
      <div className="mt-4 grid gap-2 font-mono text-xs text-amber-950 sm:grid-cols-2">
        <code>LIVECARE_DB_HOST</code>
        <code>LIVECARE_DB_PORT</code>
        <code>LIVECARE_DB_NAME</code>
        <code>LIVECARE_DB_USER</code>
        <code>LIVECARE_DB_PASSWORD</code>
      </div>
    </section>
  );
}

function LoadError() {
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <p className="text-sm font-bold text-red-800">
        LIVECARE 근태 원장을 불러오지 못했습니다.
      </p>
      <p className="mt-2 text-sm leading-6 text-red-700">
        SQL Server 접속 허용 IP, 계정 권한과 Vercel 환경변수를 확인해 주세요.
        기존 출퇴근·휴가·출장 기능은 이 오류와 관계없이 계속 사용할 수
        있습니다.
      </p>
    </section>
  );
}

function EmployeeTable({ dashboard }: { dashboard: LivecareAttendanceDashboard }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-bold text-slate-950">직원·연차 원장</h2>
        <p className="mt-1 text-xs text-slate-500">
          LIVECARE에 적재된 재직상태, 기록 범위와 최신 연차 잔액입니다.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">직원</th>
              <th className="px-4 py-3 font-semibold">재직상태</th>
              <th className="px-4 py-3 font-semibold">입사·퇴사</th>
              <th className="px-4 py-3 font-semibold">기록 범위</th>
              <th className="px-4 py-3 text-right font-semibold">기록</th>
              <th className="px-4 py-3 text-right font-semibold">발생</th>
              <th className="px-4 py-3 text-right font-semibold">사용</th>
              <th className="px-4 py-3 text-right font-semibold">잔여</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dashboard.employees.map((employee) => (
              <tr key={employee.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{employee.name}</p>
                  <p className="text-xs text-slate-400">
                    {employee.department || "부서 미등록"} · {employee.code}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      employee.active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {employee.active ? "재직" : "퇴사"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs leading-5 text-slate-600">
                  <p>입사 {employee.hiredOn || "-"}</p>
                  <p>퇴사 {employee.resignedOn || "-"}</p>
                </td>
                <td className="px-4 py-3 text-xs leading-5 text-slate-600">
                  <p>{formatDateTime(employee.firstRecordedAt)}</p>
                  <p>{formatDateTime(employee.lastRecordedAt)}</p>
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {employee.recordCount.toLocaleString("ko-KR")}건
                </td>
                <td className="px-4 py-3 text-right">
                  {formatDays(employee.grantedDays)}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatDays(employee.usedDays)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-blue-700">
                  {formatDays(employee.remainingDays)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AttendanceTable({
  dashboard,
}: {
  dashboard: LivecareAttendanceDashboard;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-bold text-slate-950">일자별 출퇴근</h2>
        <p className="mt-1 text-xs text-slate-500">
          하루 최초 출근과 최종 퇴근을 기준으로 근무시간을 계산합니다.
        </p>
      </div>
      {dashboard.attendanceDays.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-slate-400">
          선택한 조건에 해당하는 출퇴근 기록이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">근무일</th>
                <th className="px-4 py-3 font-semibold">직원</th>
                <th className="px-4 py-3 font-semibold">출근</th>
                <th className="px-4 py-3 font-semibold">퇴근</th>
                <th className="px-4 py-3 font-semibold">근무시간</th>
                <th className="px-4 py-3 text-right font-semibold">원본 이벤트</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.attendanceDays.map((row) => (
                <tr
                  key={`${row.employeeId}-${row.workDate}`}
                  className="hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-mono text-slate-700">
                    {row.workDate}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{row.name}</p>
                    <p className="text-xs text-slate-400">{row.code}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-blue-700">
                    {row.checkIn || "-"}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">
                    {row.checkOut || "-"}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {formatMinutes(row.workMinutes)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {row.eventCount}건
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function LivecareAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; employee?: string }>;
}) {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const { month, employee } = await searchParams;
  const configured = livecareSqlConfigured();
  let dashboard: LivecareAttendanceDashboard | null = null;
  let loadFailed = false;

  if (configured) {
    try {
      dashboard = await getLivecareAttendanceDashboard({
        month,
        employeeCode: employee,
      });
    } catch (error) {
      loadFailed = true;
      console.error("Failed to load LIVECARE attendance dashboard", error);
    }
  }

  const activeEmployees =
    dashboard?.employees.filter((item) => item.active).length ?? 0;
  const totalRecords =
    dashboard?.employees.reduce((sum, item) => sum + item.recordCount, 0) ?? 0;
  const totalRemainingLeave =
    dashboard?.employees.reduce(
      (sum, item) => sum + (item.remainingDays ?? 0),
      0,
    ) ?? 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              LIVECARE · 읽기 전용
            </span>
            <span className="text-xs text-slate-400">원장 기준 2026-07-21</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            통합 근태관리
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            운영 원장의 출퇴근 기록, 직원 상태와 연차 잔액을 한 번에 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/admin" className="font-semibold text-blue-700 hover:underline">
            현재 시스템 기록
          </Link>
          <Link
            href="/admin/employees"
            className="font-semibold text-slate-600 hover:text-slate-950"
          >
            직원 관리
          </Link>
          <LogoutButton />
        </div>
      </header>

      {!configured ? <ConnectionSetup /> : null}
      {loadFailed ? <LoadError /> : null}

      {dashboard ? (
        <div className="space-y-6">
          <form
            method="get"
            className="livecare-filters grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <label className="text-xs font-bold text-slate-600">
              조회 월
              <input
                type="month"
                name="month"
                defaultValue={dashboard.month}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              직원
              <select
                name="employee"
                defaultValue={employee ?? ""}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">전체 직원</option>
                {dashboard.employees.map((item) => (
                  <option key={item.id} value={item.code}>
                    {item.name} · {item.code}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="self-end rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
            >
              조회
            </button>
          </form>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="등록 직원"
              value={`${dashboard.employees.length}명`}
              detail={`재직 ${activeEmployees}명`}
            />
            <SummaryCard
              label="전체 원본 기록"
              value={`${totalRecords.toLocaleString("ko-KR")}건`}
              detail={`최신 적재 월 ${dashboard.latestMonth ?? "-"}`}
            />
            <SummaryCard
              label={`${dashboard.month} 근무일`}
              value={`${dashboard.attendanceDays.length}일`}
              detail="직원별 일자 합계"
            />
            <SummaryCard
              label="연차 잔여 합계"
              value={formatDays(totalRemainingLeave)}
              detail="최신 연차 원장 기준"
            />
          </div>

          <EmployeeTable dashboard={dashboard} />
          <AttendanceTable dashboard={dashboard} />

          <p className="rounded-xl bg-slate-100 px-4 py-3 text-xs leading-5 text-slate-500">
            이 화면은 LIVECARE 원장을 조회만 합니다. 직원 상태·퇴사일 수정과 신규
            출퇴근 입력은 운영 DB 백업 및 전용 쓰기 계정 준비 후 별도 단계로
            활성화합니다.
          </p>
        </div>
      ) : null}
    </main>
  );
}
