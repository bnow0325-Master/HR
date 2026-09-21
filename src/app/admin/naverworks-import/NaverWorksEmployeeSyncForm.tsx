"use client";

import { useState } from "react";

type Summary = {
  sourceRows: number;
  matchedEmployees: number;
  loginMappings: number;
  unchangedRows: number;
  unmatchedRows: number;
  inactiveRows: number;
  conflictingRows: number;
  appliedMappings?: number;
};

export default function NaverWorksEmployeeSyncForm() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"preview" | "import" | null>(null);

  async function submit(kind: "preview" | "import") {
    if (!file) { setError("네이버웍스 근로시간 원장 파일을 선택해 주세요."); return; }
    setError("");
    setLoading(kind);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/admin/naverworks/employees/${kind}`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "요청을 처리하지 못했습니다."); return; }
      setSummary(data.summary as Summary);
    } catch { setError("네트워크 오류로 요청을 처리하지 못했습니다."); }
    finally { setLoading(null); }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-bold text-slate-950">재직자 계정 동기화</h2>
    <p className="mt-2 text-sm text-slate-500">네이버웍스 근로 시간 현황에서 내려받은 월별 원장으로 HR 직원의 워크보드 로그인 ID를 대조합니다.</p>
    <label className="mt-4 block text-sm font-semibold text-slate-800">근로 시간 원장 (.xlsx)
      <input type="file" accept=".xlsx" className="mt-3 block w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setSummary(null); setError(""); }} />
    </label>
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="button" onClick={() => void submit("preview")} disabled={loading !== null} className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{loading === "preview" ? "분석 중" : "직원 대조"}</button>
      <button type="button" onClick={() => void submit("import")} disabled={!summary || loading !== null} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{loading === "import" ? "반영 중" : "로그인 ID 반영"}</button>
    </div>
    {error && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
    {summary && <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-slate-700"><h3 className="font-bold text-blue-900">직원 대조 결과</h3><dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3"><dt>원장 직원</dt><dd className="font-semibold">{summary.sourceRows}명</dd><dt>HR 매칭</dt><dd className="font-semibold">{summary.matchedEmployees}명</dd><dt>로그인 ID 보완</dt><dd className="font-semibold">{summary.loginMappings}명</dd><dt>이미 일치</dt><dd className="font-semibold">{summary.unchangedRows}명</dd><dt>미매칭</dt><dd className="font-semibold">{summary.unmatchedRows}명</dd><dt>비활성 직원</dt><dd className="font-semibold">{summary.inactiveRows}명</dd><dt>계정 충돌</dt><dd className="font-semibold">{summary.conflictingRows}명</dd></dl>{summary.appliedMappings !== undefined && <p className="mt-4 font-semibold text-emerald-800">로그인 ID {summary.appliedMappings}명을 HR에 반영했습니다.</p>}<p className="mt-4 text-xs text-slate-500">원장에 없거나 근무 방식이 미배정인 직원은 퇴사 처리하지 않습니다. 퇴사일은 직원명부에서 별도로 확인·수정합니다.</p></section>}
  </section>;
}
