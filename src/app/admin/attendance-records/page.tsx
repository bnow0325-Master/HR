import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import { loadAdminAttendanceReport } from "@/lib/adminAttendanceReport";
import { formatWorkMinutes, kstDate, type ReportAttendanceDay } from "@/lib/attendanceReport";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function adjacentMonth(month: string, delta: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function AdminAttendanceRecordsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const input = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["month", "start", "end", "employeeId"]) {
    const value = input[key];
    if (typeof value === "string") params.set(key, value);
  }

  let report: Awaited<ReturnType<typeof loadAdminAttendanceReport>> | null = null;
  let error = "";
  try {
    report = await loadAdminAttendanceReport(params);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "조회에 실패했습니다.";
  }

  const month = report?.range.month ?? params.get("month") ?? kstDate(new Date()).slice(0, 7);
  const employeeId = report?.range.employeeId ?? params.get("employeeId") ?? "";
  const exportParams = new URLSearchParams();
  if (report) {
    exportParams.set("start", report.range.startDay);
    exportParams.set("end", report.range.endDay);
    if (employeeId) exportParams.set("employeeId", employeeId);
  }
  const completed = report?.rows.filter((row) => row.status === "완료").length ?? 0;
  const working = report?.rows.filter((row) => row.status === "근무 중").length ?? 0;
  const exceptions = report?.rows.filter((row) => ["퇴근 미등록", "출근 누락", "이관 공백", "미출근"].includes(row.status)).length ?? 0;
  const minutes = report?.rows.reduce((sum, row) => sum + row.minutes, 0) ?? 0;
  const today = kstDate(new Date());

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-blue-600">BNOW PEOPLE ADMIN</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">직원별 출퇴근</h1>
          <p className="mt-2 text-sm text-slate-600">직원별 출근·퇴근 시각과 근태 상태를 한 줄씩 확인합니다.</p>
        </div>
        <Link href="/admin" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">관리자 홈</Link>
      </header>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/attendance-records?start=${today}&end=${today}`} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">오늘</Link>
          <Link href={`/admin/attendance-records?month=${today.slice(0, 7)}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">이번 달</Link>
        </div>
        <details className="mt-3 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-blue-700">기간·직원 필터</summary>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <form className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-slate-700">조회 월
              <input name="month" type="month" defaultValue={month} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">직원
              <select name="employeeId" defaultValue={employeeId} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="">전체 직원</option>
                {report?.directory.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.code})</option>)}
              </select>
            </label>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">월 조회</button>
            </form>
            <form className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-slate-700">시작일
              <input name="start" type="date" defaultValue={report?.range.startDay ?? ""} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">종료일
              <input name="end" type="date" defaultValue={report?.range.endDay ?? ""} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">직원
              <select name="employeeId" defaultValue={employeeId} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="">전체 직원</option>
                {report?.directory.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.code})</option>)}
              </select>
            </label>
            <button className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700">기간 조회</button>
            </form>
          </div>
          <nav className="mt-4 flex flex-wrap items-center gap-2" aria-label="월 이동">
            <Link href={`/admin/attendance-records?month=${adjacentMonth(month, -1)}&employeeId=${encodeURIComponent(employeeId)}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">이전 달</Link>
            <strong className="px-2 text-sm text-slate-800">{month}</strong>
            <Link href={`/admin/attendance-records?month=${adjacentMonth(month, 1)}&employeeId=${encodeURIComponent(employeeId)}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">다음 달</Link>
          </nav>
          <p className="mt-3 text-xs text-slate-500">한국시간 기준 · 최대 93일 · HR 기록 우선, 없는 날짜에 네이버웍스 이관 원장 표시 · 시각 간격은 휴게시간을 공제하지 않습니다. 미출근은 기록 부재이며 무단결근 판정이 아닙니다. 공휴일과 근무제별 지각·조퇴 자동 판정은 제공하지 않습니다.</p>
        </details>
      </section>

      {error ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}
      {report ? <>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">{report.range.startDay} ~ {report.range.endDay} · {report.rows.length}개 직원·일</div>
          <a href={`/api/admin/attendance-records/export?${exportParams.toString()}`} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">현재 조건 CSV</a>
        </div>
        <section className="mb-4 flex flex-wrap gap-2">
          <Metric label="완료" value={`${completed}일`} />
          <Metric label="근무 중" value={`${working}일`} />
          <Metric label="확인 필요" value={`${exceptions}일`} />
          <Metric label="출퇴근 시각 간격 합계" value={formatWorkMinutes(minutes)} />
          <Metric label="취소 기록" value={`${report.rows.reduce((sum, row) => sum + row.cancelledCount, 0)}건`} />
        </section>
        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white" aria-label="직원별 일일 출퇴근 기록">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <caption className="sr-only">직원별 날짜, 출근·퇴근 시각, 근무시간, 근태 상태</caption>
            <thead className="bg-slate-50 text-slate-600"><tr>
              <th scope="col" className="sticky left-0 z-10 whitespace-nowrap bg-slate-50 px-2 py-3 sm:px-3">직원</th>
              <th scope="col" className="whitespace-nowrap px-2 py-3 sm:px-3">날짜</th>
              <th scope="col" className="whitespace-nowrap px-2 py-3 sm:px-3">상태</th>
              <th scope="col" className="whitespace-nowrap px-2 py-3 sm:px-3">출근</th>
              <th scope="col" className="whitespace-nowrap px-2 py-3 sm:px-3">퇴근</th>
              <th scope="col" className="whitespace-nowrap px-2 py-3 sm:px-3">간격</th>
              <th scope="col" className="whitespace-nowrap px-2 py-3 sm:px-3">상세</th>
            </tr></thead>
            <tbody>{report.rows.map((row) => <tr key={`${row.employeeId}:${row.date}`} className="border-t border-slate-100 align-middle">
              <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-2.5 font-semibold text-slate-900 sm:px-3" title={`${row.code} · ${row.department ?? "부서 미지정"}`}>{row.name}</th>
              <td className="whitespace-nowrap px-2 py-2.5 tabular-nums text-slate-600 sm:px-3" title={row.date}>{row.date.slice(5).replace("-", ".")}</td>
              <td className="whitespace-nowrap px-2 py-2.5 sm:px-3"><span className={statusTone(row)}>{statusLabel(row)}</span></td>
              <td className="whitespace-nowrap px-2 py-2.5 tabular-nums sm:px-3">{row.firstIn ?? "—"}</td>
              <td className="whitespace-nowrap px-2 py-2.5 tabular-nums sm:px-3">{row.lastOut ?? "—"}</td>
              <td className="whitespace-nowrap px-2 py-2.5 tabular-nums sm:px-3">{row.minutes ? formatWorkMinutes(row.minutes) : "—"}</td>
              <td className="px-2 py-2.5 sm:px-3"><details className="text-slate-600"><summary className="cursor-pointer whitespace-nowrap font-medium text-blue-700">보기</summary><div className="min-w-40 py-2 text-xs leading-5"><p>사번 {row.code} · {row.department ?? "부서 미지정"}</p><p>원천: {row.source}</p>{row.sessions.length ? <p>세션: {row.sessions.join(" / ")}</p> : null}{row.notes.includes("출장 승인") && row.sessions.length ? <p>근태: {row.status}</p> : null}{recordNotes(row) ? <p>확인: {recordNotes(row)}</p> : null}{row.cancelledCount ? <p>취소 기록: {row.cancelledCount}건</p> : null}</div></details></td>
            </tr>)}</tbody>
          </table>
          {report.rows.length === 0 ? <p className="p-6 text-sm text-slate-500">이 조건에 해당하는 기록이 없습니다.</p> : null}
        </section>
        <p className="mt-2 text-xs text-slate-500">간격은 출근~퇴근 시각 차이이며 휴게시간은 공제하지 않습니다.</p>
      </> : null}
    </main>
  );
}

function recordNotes(row: ReportAttendanceDay) {
  return [...row.notes, ...(row.importedLate ? ["이관 원장 지각"] : []), ...(row.importedEarlyLeave ? ["이관 원장 조퇴"] : [])].join(" · ");
}

function statusLabel(row: ReportAttendanceDay) {
  if (row.status === "승인 출장" || row.notes.includes("출장 승인")) return "출장";
  if (row.status === "승인 휴가") return "휴가";
  if (row.status === "미출근") return "확인 필요";
  if (row.status === "이관 공백") return "이관 공백";
  return row.status;
}

function statusTone(row: ReportAttendanceDay) {
  if (row.status === "완료" || row.status === "근무 중") return "font-semibold text-emerald-700";
  if (row.status === "승인 출장" || row.notes.includes("출장 승인")) return "font-semibold text-blue-700";
  if (row.status === "승인 휴가") return "font-semibold text-violet-700";
  if (["퇴근 미등록", "출근 누락", "미출근", "이관 공백"].includes(row.status)) return "font-semibold text-rose-700";
  return "text-slate-600";
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2"><span className="text-xs text-slate-500">{label}</span><strong className="text-sm text-slate-900">{value}</strong></div>;
}
