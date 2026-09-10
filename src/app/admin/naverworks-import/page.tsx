import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import NaverWorksImportForm from "./NaverWorksImportForm";

export const dynamic = "force-dynamic";

export default async function NaverWorksImportPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 sm:px-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-blue-600">NAVER WORKS MIGRATION</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">네이버웍스 출퇴근 원장</h1>
          <p className="mt-2 text-sm text-slate-500">일별 출퇴근 원장을 먼저 분석하고, 직원 매칭을 확인한 뒤에만 HR에 반영합니다.</p>
        </div>
        <Link href="/admin" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-500">관리자 홈</Link>
      </div>
      <NaverWorksImportForm />
      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        <h2 className="font-bold text-slate-900">가져오기 기준</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>네이버웍스 출퇴근 현황에서 내려받은 일별 원장만 지원합니다.</li>
          <li>분석 단계는 HR 데이터와 직원정보를 변경하지 않습니다.</li>
          <li>확정 반영 시에는 로그인 아이디를 우선 사용하고, 없으면 동명이인이 아닌 이름만 매칭합니다.</li>
        </ul>
      </section>
    </main>
  );
}
