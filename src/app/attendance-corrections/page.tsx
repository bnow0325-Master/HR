"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Correction = { id: string; workDate: string; checkInAt: string | null; checkOutAt: string | null; reason: string; status: string; reviewerNote: string | null; createdAt: string };

function displayTime(value: string | null) {
  return value ? new Date(value).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
}

export default function AttendanceCorrectionsPage() {
  const [workDate, setWorkDate] = useState("");
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [reason, setReason] = useState("");
  const [requests, setRequests] = useState<Correction[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const response = await fetch("/api/attendance-corrections", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "신청 내역을 불러오지 못했습니다.");
    setRequests(data.requests);
  }
  useEffect(() => { void reload().catch((error: Error) => setMessage(error.message)); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/attendance-corrections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workDate, checkInTime, checkOutTime, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "신청에 실패했습니다.");
      setCheckInTime(""); setCheckOutTime(""); setReason("");
      setMessage("대표이사에게 사후 출퇴근 등록을 요청했습니다. 승인 전에는 출퇴근 원장에 반영되지 않습니다.");
      await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "신청에 실패했습니다."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-3xl px-5 py-8">
    <div className="mb-6 flex items-center justify-between"><h1 className="text-2xl font-bold">출퇴근 사후 등록 요청</h1><Link href="/records" className="text-sm text-blue-700">기록부로</Link></div>
    <p className="mb-5 text-sm text-slate-600">등록을 놓친 출근·퇴근 시각만 입력하고 사유를 적어 주세요. 신청 사실과 대표이사 승인 이력은 별도로 남습니다.</p>
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-5">
      <label className="block text-sm font-semibold">근무 날짜<input required type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">누락된 출근 시각<input type="time" value={checkInTime} onChange={(event) => setCheckInTime(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
        <label className="block text-sm font-semibold">누락된 퇴근 시각<input type="time" value={checkOutTime} onChange={(event) => setCheckOutTime(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
      </div>
      <label className="block text-sm font-semibold">등록을 놓친 이유<textarea required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="mt-1 block w-full rounded border p-2" placeholder="해당 날짜의 실제 근무 내용과 등록 누락 사유를 적어 주세요." /></label>
      <button disabled={busy || !workDate || (!checkInTime && !checkOutTime) || !reason.trim()} className="rounded bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "신청 중…" : "대표이사에게 승인 요청"}</button>
    </form>
    {message && <p role="status" className="my-4 rounded bg-slate-100 p-3 text-sm">{message}</p>}
    <section className="mt-8"><h2 className="mb-3 text-lg font-bold">내 신청 내역</h2>
      <div className="space-y-3">{requests.length === 0 ? <p className="text-sm text-slate-500">신청 내역이 없습니다.</p> : requests.map((item) =>
        <article key={item.id} className="rounded border bg-white p-4 text-sm">
          <div className="flex justify-between gap-2"><strong>{item.workDate.slice(0, 10)} · 출근 {displayTime(item.checkInAt)} / 퇴근 {displayTime(item.checkOutAt)}</strong><span>{item.status === "PENDING" ? "검토 중" : item.status === "APPROVED" ? "승인" : "반려"}</span></div>
          <p className="mt-2 whitespace-pre-wrap text-slate-600">{item.reason}</p>
          {item.reviewerNote && <p className="mt-2 border-t pt-2 text-slate-600">대표이사 의견: {item.reviewerNote}</p>}
        </article>)}</div>
    </section>
  </main>;
}
