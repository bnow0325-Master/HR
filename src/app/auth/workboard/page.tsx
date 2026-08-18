"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const WORKBOARD_URL = "https://main.bnow.co.kr/";
const ALLOWED_DESTINATIONS = new Set([
  "/attendance",
  "/check",
  "/records",
  "/leave",
  "/business-trips",
]);

function safeDestination(value: string | null) {
  return value && ALLOWED_DESTINATIONS.has(value) ? value : "/attendance";
}

export default function WorkboardLoginPage() {
  const [message, setMessage] = useState("워크보드 로그인을 확인하고 있습니다.");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    async function login() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = fragment.get("access_token")?.trim() ?? "";
      const destination = safeDestination(fragment.get("return_to"));

      window.history.replaceState(null, "", window.location.pathname);
      if (!accessToken) {
        setMessage("워크보드 로그인 정보가 없습니다. 워크보드에서 다시 열어 주세요.");
        setFailed(true);
        return;
      }

      try {
        const response = await fetch("/api/auth/workboard/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          setMessage(data.error ?? "워크보드 로그인 연결에 실패했습니다.");
          setFailed(true);
          return;
        }

        window.location.replace(destination);
      } catch {
        setMessage("워크보드 로그인 서버에 연결하지 못했습니다.");
        setFailed(true);
      }
    }

    void login();
  }, []);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-72px)] max-w-lg items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="text-sm font-semibold text-blue-600">BNOW WORKBOARD</div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">인사관리 로그인</h1>
        <p className={`mt-5 text-sm ${failed ? "text-red-600" : "text-slate-500"}`}>
          {message}
        </p>
        {failed && (
          <Link
            href={WORKBOARD_URL}
            className="mt-6 inline-flex rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            워크보드로 이동
          </Link>
        )}
      </section>
    </main>
  );
}
