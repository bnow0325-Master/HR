import Link from "next/link";
import { loadAdminAttendanceReport } from "@/lib/adminAttendanceReport";
import { formatWorkMinutes, kstDate, type ReportAttendanceDay } from "@/lib/attendanceReport";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

export const dynamic = "force-dynamic";

function adjacentMonth(month: string, delta: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function statusLabel(row: ReportAttendanceDay) {
  if (row.status === "미출근") return "기록 없음 · 확인 필요";
  if (row.status === "이관 공백") return "이관 기록 공백";
  return row.status;
}

function note(row: ReportAttendanceDay) {
  return [...row.notes, ...(row.importedLate ? ["이관 원장 지각"] : []), ...(row.importedEarlyLeave ? ["이관 원장 조퇴"] : [])].join(" · ");
}

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const employee = await getCurrentWorkboardEmployee("any");
  if (!employee) return <main className="mx-auto max-w-lg px-4 py-12"><h1 className="text-2xl font-bold">내 출퇴근 기록</h1><p className="mt-3 text-sm text-slate-600">회사 계정으로 로그인하면 본인의 기록을 볼 수 있습니다.</p><Link href="/api/auth/company/login?returnTo=%2Frecords" className="mt-5 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">회사 계정으로 로그인</Link></main>;

  const requested = (await searchParams).month;
  const month = typeof requested === "string" ? requested : kstDate(new Date()).slice(0, 7);
  const params = new URLSearchParams({ month });
  let report: Awaited<ReturnType<typeof loadAdminAttendanceReport>> | null = null;
  let error = "";
  try {
    report = await loadAdminAttendanceReport(params, employee.id);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "출퇴근 기록을 불러오지 못했습니다.";
  }

  const selectedMonth = report?.range.month ?? kstDate(new Date()).slice(0, 7);
  const rows = report?.rows ?? [];
  const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);

  return <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold tracking-[0.16em] text-blue-600">BNOW PEOPLE</p><h1 className="mt-2 text-2xl font-bold text-slate-950">내 출퇴근 기록</h1><p className="mt-2 text-sm text-slate-600">{employee.name}님의 날짜별 출근·퇴근 시각을 확인합니다.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/check" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">출퇴근 등록</Link>{employee.systemRole === "ADMIN" ? <Link href="/admin/attendance-records" className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">직원별 조회</Link> : null}</div>
    </header>

    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <form className="flex flex-wrap items-end gap-2"><label className="text-sm font-medium text-slate-700">조회 월<input name="month" type="month" defaultValue={selectedMonth} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" /></label><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">조회</button></form>
      <nav className="mt-4 flex items-center gap-2" aria-label="월 이동"><Link href={`/records?month=${adjacentMonth(selectedMonth, -1)}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">이전 달</Link><strong className="px-2 text-sm">{selectedMonth}</strong><Link href={`/records?month=${adjacentMonth(selectedMonth, 1)}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">다음 달</Link></nav>
      <p className="mt-3 text-xs text-slate-500">HR 출퇴근 기록을 우선 표시합니다. 기록이 없는 과거 날짜에는 네이버웍스 이관 기록과 승인된 휴가·출장을 확인합니다. 기록 없음은 무단결근 판정이 아닙니다. 시각 간격은 휴게시간을 공제하지 않습니다.</p>
    </section>

    {error ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}
    {report ? <><div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600"><span>{report.range.startDay} ~ {report.range.endDay} · {rows.length}일</span><span>출퇴근 시각 간격 합계 {formatWorkMinutes(totalMinutes)}</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => <article key={row.date} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2"><h2 className="font-bold text-slate-950">{row.date}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{statusLabel(row)}</span></div>
          <dl className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl bg-blue-50 p-3"><dt className="text-xs text-blue-700">출근</dt><dd className="mt-1 font-bold text-slate-900">{row.firstIn ?? "미등록"}</dd></div><div className="rounded-xl bg-emerald-50 p-3"><dt className="text-xs text-emerald-700">퇴근</dt><dd className="mt-1 font-bold text-slate-900">{row.lastOut ?? "미등록"}</dd></div></dl>
          <p className="mt-3 text-xs text-slate-600">원천: {row.source}{row.minutes ? ` · 시각 간격 ${formatWorkMinutes(row.minutes)}` : ""}</p>
          {row.sessions.length ? <p className="mt-1 text-xs text-slate-600">원장 기록: {row.sessions.join(" / ")}</p> : null}
          {note(row) ? <p className="mt-1 text-xs font-medium text-amber-800">확인: {note(row)}</p> : null}
          {row.cancelledCount ? <p className="mt-1 text-xs text-slate-600">취소된 등록 {row.cancelledCount}건 · 원장 확인 필요</p> : null}
        </article>)}
      </div>
      {rows.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">조회 기간에 해당하는 날짜가 없습니다.</p> : null}
    </> : null}
  </main>;
}
