import Link from "next/link";

export default function CompanyLoginPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-72px)] max-w-lg items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="text-sm font-semibold text-blue-600">BNOW IDENTITY</div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">사내 통합 로그인</h1>
        <p className="mt-5 text-sm text-red-600">로그인 또는 HR 사용 권한을 확인해 주세요.</p>
        <Link href="/api/auth/company/login?returnTo=%2Fattendance" className="mt-6 inline-flex rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
          다시 로그인
        </Link>
      </section>
    </main>
  );
}
