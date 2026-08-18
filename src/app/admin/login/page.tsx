import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

export default async function AdminLoginPage() {
  const employee = await getCurrentWorkboardEmployee("any");
  if (!employee) {
    redirect("/api/auth/company/login?returnTo=%2Fadmin");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
        <div className="text-sm font-semibold text-amber-700">BNOW IDENTITY</div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">관리자 권한 필요</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {employee.name} 계정에는 HR 관리자 권한이 없습니다. 직원명부의 시스템
          권한을 확인해 주세요.
        </p>
        <Link
          href="/attendance"
          className="mt-6 inline-flex rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
        >
          인사관리로 이동
        </Link>
      </section>
    </main>
  );
}
