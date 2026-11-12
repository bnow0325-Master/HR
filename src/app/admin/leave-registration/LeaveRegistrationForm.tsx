"use client";

import { useState } from "react";

type Employee = { id: string; name: string; code: string };
type Result = { ok?: boolean; error?: string; employeeName?: string; leaveDate?: string; grantedDays?: number; usedDays?: number; remainingDays?: number };

export default function LeaveRegistrationForm({ employees, today }: { employees: Employee[]; today: string }) {
  const [employeeId, setEmployeeId] = useState("");
  const [leaveDate, setLeaveDate] = useState(today);
  const [leaveType, setLeaveType] = useState("ANNUAL");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/admin/leave-registration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId, leaveDate, leaveType }) });
      const data = await response.json() as Result;
      setResult(response.ok ? data : { error: data.error || "등록에 실패했습니다." });
    } catch { setResult({ error: "네트워크 오류로 등록하지 못했습니다." }); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
    <label className="block text-sm font-semibold text-slate-700">직원
      <select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3">
        <option value="">선택해 주세요</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.code}</option>)}
      </select>
    </label>
    <label className="block text-sm font-semibold text-slate-700">휴가 날짜
      <input required type="date" value={leaveDate} onChange={(event) => setLeaveDate(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3" />
    </label>
    <label className="block text-sm font-semibold text-slate-700">휴가 종류
      <select value={leaveType} onChange={(event) => setLeaveType(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3">
        <option value="ANNUAL">연차 1일</option><option value="AM_HALF">오전 반차</option><option value="PM_HALF">오후 반차</option>
      </select>
    </label>
    <button disabled={busy} type="submit" className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? "등록 중…" : "승인 상태로 등록"}</button>
    {result?.error && <p role="alert" className="text-sm text-red-700">{result.error}</p>}
    {result?.ok && <div role="status" className="rounded-lg bg-green-50 p-4 text-sm text-green-900">
      <p>{result.employeeName} · {result.leaveDate} 휴가 등록 완료</p>
      <p className="mt-2">발생 {result.grantedDays}일 · 사용 {result.usedDays}일 · 잔여 {result.remainingDays}일</p>
    </div>}
  </form>;
}
