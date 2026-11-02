"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RequestItem = { id: string; workDate: string; checkInAt: string | null; checkOutAt: string | null; reason: string; createdAt: string; employee: { name: string; code: string; department: string | null } };
function display(value: string | null) { return value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "—"; }

export default function CorrectionQueue() {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  async function reload() {
    const response = await fetch("/api/admin/attendance-corrections", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "결재 목록을 불러오지 못했습니다.");
    setItems(data.requests);
  }
  useEffect(() => { void reload().catch((error: Error) => setMessage(error.message)); }, []);
  async function decide(item: RequestItem, action: "APPROVE" | "REJECT") {
    const reviewerNote = notes[item.id]?.trim();
    if (!reviewerNote) return;
    setBusy(item.id); setMessage("");
    try {
      const response = await fetch("/api/admin/attendance-corrections", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: item.id, action, reviewerNote }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "결재에 실패했습니다.");
      setMessage(action === "APPROVE" ? "승인하여 사후 등록으로 원장에 반영했습니다." : "반려했습니다.");
      await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "결재에 실패했습니다."); }
    finally { setBusy(null); }
  }
  return <main className="mx-auto max-w-4xl px-5 py-8">
    <div className="mb-5 flex justify-between gap-3"><div><h1 className="text-2xl font-bold">출퇴근 사후 등록 결재</h1><p className="mt-2 text-sm text-slate-600">신청 사유와 기존 근태 기록을 대조한 뒤 결정해 주세요. 승인 이력은 사후 등록으로 구분됩니다.</p></div><Link href="/admin" className="text-sm text-blue-700">관리자 홈</Link></div>
    {message && <p role="status" className="mb-4 rounded bg-slate-100 p-3 text-sm">{message}</p>}
    <div className="space-y-4">{items.length === 0 ? <p className="rounded border p-5 text-sm text-slate-500">검토할 신청이 없습니다.</p> : items.map((item) => <article key={item.id} className="rounded-xl border bg-white p-5">
      <h2 className="font-bold">{item.employee.name} ({item.employee.code}) · {item.employee.department ?? "부서 미지정"}</h2>
      <p className="mt-2 text-sm">근무일 {item.workDate.slice(0, 10)} · 요청 출근 {display(item.checkInAt)} · 요청 퇴근 {display(item.checkOutAt)}</p>
      <p className="mt-1 text-xs text-slate-500">신청 시각 {display(item.createdAt)}</p>
      <p className="mt-3 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{item.reason}</p>
      <label className="mt-4 block text-sm font-semibold">승인·반려 사유<textarea maxLength={1000} value={notes[item.id] ?? ""} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} rows={3} className="mt-1 block w-full rounded border p-2" /></label>
      <div className="mt-3 flex gap-2"><button disabled={busy !== null || !notes[item.id]?.trim()} onClick={() => void decide(item, "REJECT")} className="rounded border px-4 py-2 text-sm disabled:opacity-50">반려</button><button disabled={busy !== null || !notes[item.id]?.trim()} onClick={() => void decide(item, "APPROVE")} className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50">사후 등록 승인</button></div>
    </article>)}</div>
  </main>;
}
