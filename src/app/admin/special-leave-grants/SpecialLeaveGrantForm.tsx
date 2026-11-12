"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Employee = { id: string; name: string; code: string };
type Result = { ok?: boolean; error?: string; employeeName?: string; sourceWorkDate?: string; grantedDays?: number };

export default function SpecialLeaveGrantForm({ employees, today }: { employees: Employee[]; today: string }) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [sourceWorkDate, setSourceWorkDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/admin/special-leave-grants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId, sourceWorkDate, reason }) });
      const data = await response.json() as Result;
      setResult(response.ok ? data : { error: data.error || "부여하지 못했습니다." });
      if (response.ok) router.refresh();
    } catch { setResult({ error: "네트워크 오류로 부여하지 못했습니다." }); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <label className="block text-sm font-semibold">직원
      <select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3">
        <option value="">선택해 주세요</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.code}</option>)}
      </select>
    </label>
    <label className="block text-sm font-semibold">부여 근거 근무일
      <input required type="date" max={today} value={sourceWorkDate} onChange={(event) => setSourceWorkDate(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3" />
    </label>
    <label className="block text-sm font-semibold">부여 사유
      <textarea required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="mt-2 w-full rounded-lg border border-slate-300 p-3" />
    </label>
    {employeeId && sourceWorkDate && reason.trim() && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
      <p className="font-semibold">부여 내용 확인</p>
      <p className="mt-1">{employees.find((employee) => employee.id === employeeId)?.name} · 근거 근무일 {sourceWorkDate} · 유급 특별휴가 1일</p>
      <p className="mt-1">{reason.trim()}</p>
    </div>}
    <button disabled={busy} type="submit" className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? "부여 중…" : "유급 특별휴가 1일 부여"}</button>
    {result?.error && <p role="alert" className="text-sm text-red-700">{result.error}</p>}
    {result?.ok && <p role="status" className="text-sm text-green-800">{result.employeeName} · {result.sourceWorkDate} 근무에 대해 1일 부여했습니다.</p>}
  </form>;
}
