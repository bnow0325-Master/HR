"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        router.replace("/admin");
        router.refresh();
      } else {
        setError(data.error ?? "로그인에 실패했습니다.");
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">관리자 로그인</h1>
        <p className="mt-1 text-sm text-slate-500">BNOW 인사관리 관리자 전용</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="관리자 비밀번호"
          autoFocus
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-brand px-6 py-3 text-lg font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {loading ? "확인 중…" : "로그인"}
        </button>
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-center text-sm text-red-600">
            {error}
          </p>
        )}
      </form>
      <Link
        href="/"
        className="text-center text-sm text-slate-400 hover:text-slate-600"
      >
        홈으로
      </Link>
    </main>
  );
}
