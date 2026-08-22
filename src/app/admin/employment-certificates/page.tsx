import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import { todayInKorea } from "@/lib/employmentCertificate";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EmploymentCertificatesPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const employees = await prisma.employee.findMany({
    where: { active: true, terminationDate: null },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      department: true,
      position: true,
      hireDate: true,
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold tracking-[0.18em] text-blue-600">
            EMPLOYMENT CERTIFICATE
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            재직증명서 발급
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            재직 직원을 선택해 증명서를 미리보고 인쇄하거나 PDF로 저장합니다.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link
            href="/admin/employees"
            className="rounded-full border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
          >
            직원명부 관리
          </Link>
          <Link
            href="/admin"
            className="rounded-full border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
          >
            관리자 대시보드
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">발급 정보</h2>
              <p className="mt-1 text-sm text-slate-500">
                현재 재직 중인 직원 {employees.length}명을 조회했습니다.
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              관리자 전용
            </span>
          </div>

          <form
            action="/admin/employment-certificates/print"
            method="get"
            target="_blank"
            className="space-y-5"
          >
            <label className="block text-sm font-semibold text-slate-700">
              발급 대상 직원
              <select
                name="employeeId"
                required
                defaultValue=""
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="" disabled>
                  직원을 선택해 주세요
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.code} · {employee.name} · {employee.department || "소속 미지정"} · {employee.position || "직위 미지정"}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              발급 용도
              <input
                name="purpose"
                defaultValue="제출용"
                maxLength={80}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              발급일
              <input
                type="date"
                name="issuedOn"
                required
                defaultValue={todayInKorea()}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-xl bg-slate-950 px-5 py-3.5 text-base font-bold text-white transition hover:bg-blue-700"
            >
              증명서 미리보기 · 인쇄
            </button>
          </form>
        </section>

        <aside className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm sm:p-8">
          <div className="text-xs font-bold tracking-[0.16em] text-blue-300">
            A4 PRINT FORMAT
          </div>
          <h2 className="mt-3 text-2xl font-bold">출력 항목</h2>
          <ul className="mt-6 space-y-3 text-sm leading-6 text-slate-300">
            <li>증명번호와 발급일</li>
            <li>성명, 사번, 소속, 직위</li>
            <li>입사일과 현재 재직 상태</li>
            <li>발급 용도와 회사 법인정보</li>
          </ul>
          <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-4 text-xs leading-5 text-slate-300">
            인쇄 화면에서 프린터를 선택하거나 &quot;PDF로 저장&quot;을 선택할 수
            있습니다. 대외 제출본은 회사 직인을 날인한 후 사용해 주세요.
          </div>
        </aside>
      </div>
    </main>
  );
}
