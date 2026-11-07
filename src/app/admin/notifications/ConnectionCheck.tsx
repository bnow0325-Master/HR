"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Result = { connection?: { status: string; remoteRoomId: string | null; remoteMessageSeq: number | null }; error?: string };

export default function ConnectionCheck() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  async function check() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/hr-notifications", { method: "POST", cache: "no-store" });
      const body = await response.json() as Result;
      setResult(response.ok ? body : { error: body.error || `HTTP ${response.status}` });
      if (response.ok) router.refresh();
    } catch { setResult({ error: "연결 확인 요청에 실패했습니다." }); }
    finally { setBusy(false); }
  }
  return <section className="mt-8 rounded-xl border p-5">
    <h2 className="text-lg font-semibold">대표 개인 채팅 연결 확인</h2>
    <p className="mt-2 text-sm text-slate-600">하루에 한 번 같은 확인 메시지만 보냅니다. 출퇴근·휴가·출장 기록은 생성하지 않습니다.</p>
    <button type="button" disabled={busy} onClick={check}
      className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-60">
      {busy ? "확인 중…" : "연결 확인 메시지 보내기"}
    </button>
    {result?.error && <p role="alert" className="mt-4 text-sm text-red-700">{result.error}</p>}
    {result?.connection && <p className="mt-4 break-all text-sm text-slate-700">
      상태: {result.connection.status} · 방 ID: {result.connection.remoteRoomId || "미확인"} · 메시지 번호: {result.connection.remoteMessageSeq ?? "미확인"}
    </p>}
  </section>;
}
