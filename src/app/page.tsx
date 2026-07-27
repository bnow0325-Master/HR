import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold">출퇴근</h1>
        <p className="mt-2 text-slate-500">BNOW 출퇴근 기록 시스템</p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/check"
          className="rounded-xl bg-brand px-6 py-4 text-center text-lg font-semibold text-white shadow-sm transition hover:bg-brand-dark"
        >
          출퇴근
        </Link>
        <Link
          href="/records"
          className="rounded-xl border border-slate-300 bg-white px-6 py-4 text-center text-lg font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          출퇴근 기록부
        </Link>
        <Link
          href="/admin"
          className="rounded-xl border border-slate-300 bg-white px-6 py-4 text-center text-lg font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          관리자 — 기록 보기
        </Link>
      </div>

      <p className="text-center text-xs text-slate-400">
        워크보드 로그인 사용자와 현재 접속 위치를 함께 기록합니다
      </p>
    </main>
  );
}
