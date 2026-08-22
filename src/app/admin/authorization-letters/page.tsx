import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import { defaultAuthorizationForm } from "@/lib/authorizationLetter";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuthorizationLettersPage() {
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
    },
  });
  const defaults = defaultAuthorizationForm();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold tracking-[0.18em] text-rose-700">
            LETTER OF AUTHORIZATION
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            위임장 발급
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            재직 직원을 수임인으로 지정해 업무 범위가 명확한 위임장을 발급합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/admin/employment-certificates"
            className="rounded-full border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
          >
            재직증명서 발급
          </Link>
          <Link
            href="/admin"
            className="rounded-full border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
          >
            관리자 대시보드
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">위임 정보</h2>
              <p className="mt-1 text-sm text-slate-500">
                현재 재직 중인 직원 {employees.length}명을 조회했습니다.
              </p>
            </div>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
              관리자 전용
            </span>
          </div>

          <form
            action="/admin/authorization-letters/print"
            method="get"
            target="_blank"
            className="space-y-5"
          >
            <label className="block text-sm font-semibold text-slate-700">
              수임 직원
              <select
                name="employeeId"
                required
                defaultValue=""
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
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
              위임 대상 기관
              <input
                name="organization"
                required
                maxLength={100}
                placeholder="예: 대전창조경제혁신센터"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-950 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">
                행사·업무 일자
                <input
                  type="date"
                  name="eventDate"
                  required
                  defaultValue={defaults.eventDate}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-950 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                작성일
                <input
                  type="date"
                  name="issuedOn"
                  required
                  defaultValue={defaults.issuedOn}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-950 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                />
              </label>
            </div>

            <label className="block text-sm font-semibold text-slate-700">
              위임 업무명
              <input
                name="title"
                required
                defaultValue={defaults.title}
                maxLength={120}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-950 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              세부 위임 범위
              <textarea
                name="scope"
                required
                defaultValue={defaults.scope}
                maxLength={500}
                rows={4}
                className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-base leading-7 text-slate-950 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-xl bg-slate-950 px-5 py-3.5 text-base font-bold text-white transition hover:bg-rose-800"
            >
              위임장 미리보기 · 인쇄
            </button>
          </form>
        </section>

        <aside className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm sm:p-8">
          <div className="text-xs font-bold tracking-[0.16em] text-rose-300">
            AUTHORITY SCOPE
          </div>
          <h2 className="mt-3 text-2xl font-bold">발급 원칙</h2>
          <ul className="mt-6 space-y-3 text-sm leading-6 text-slate-300">
            <li>수임인은 재직 직원만 선택</li>
            <li>대상 기관과 행사일 명시</li>
            <li>대리 수행 업무 범위 제한</li>
            <li>계약·금전·법률행위 권한 자동 제외</li>
          </ul>
          <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-4 text-xs leading-5 text-slate-300">
            작성일과 실제 위임일을 구분합니다. 법률행위나 계약 체결 권한이 필요한
            경우에는 별도의 법무 검토를 거쳐 위임 범위를 구체적으로 작성해 주세요.
          </div>
        </aside>
      </div>
    </main>
  );
}
