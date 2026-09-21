"use client";

import { useState } from "react";

type Preview = { parsedRows: number; matchedRows: number; unmatchedRows: number; dateMin: string | null; dateMax: string | null; unmatchedSamples: Array<{ rowNumber: number; name: string }> };
type Result = { importedRows: number; unmatchedRows: number; unmatchedSamples: Array<{ rowNumber: number; name: string }> };

export default function NaverWorksAbsenceImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"preview" | "import" | null>(null);

  async function submit(kind: "preview" | "import") {
    if (!file) { setError("네이버웍스 부재 일정 현황에서 내려받은 .xlsx 파일을 선택해 주세요."); return; }
    setError(""); setLoading(kind);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch(`/api/admin/naverworks/absence/${kind}`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "요청을 처리하지 못했습니다."); return; }
      if (kind === "preview") { setPreview(data.summary as Preview); setResult(null); } else setResult(data.summary as Result);
    } catch { setError("네트워크 오류로 요청을 처리하지 못했습니다."); }
    finally { setLoading(null); }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-bold text-slate-950">휴가·출장 원장 (.xlsx)</h2>
    <p className="mt-1 text-sm text-slate-500">부재 일정 현황의 다운로드 파일을 문서번호 기준으로 보관합니다. 기존 HR 신청 건은 수정하지 않습니다.</p>
    <input type="file" accept=".xlsx" className="mt-4 block w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setResult(null); setError(""); }} />
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="button" onClick={() => void submit("preview")} disabled={loading !== null} className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{loading === "preview" ? "분석 중" : "파일 분석"}</button>
      <button type="button" onClick={() => void submit("import")} disabled={!preview || loading !== null} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{loading === "import" ? "반영 중" : "확정 반영"}</button>
    </div>
    {error && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
    {preview && <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-slate-700"><h3 className="font-bold text-blue-900">분석 완료, 아직 HR에는 반영되지 않았습니다.</h3><dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3"><dt>원장 행</dt><dd className="font-semibold">{preview.parsedRows.toLocaleString()}건</dd><dt>직원 매칭</dt><dd className="font-semibold">{preview.matchedRows.toLocaleString()}건</dd><dt>기간</dt><dd className="font-semibold">{preview.dateMin ?? "-"} ~ {preview.dateMax ?? "-"}</dd><dt>미매칭</dt><dd className="font-semibold">{preview.unmatchedRows.toLocaleString()}건</dd></dl></section>}
    {result && <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-slate-700"><h3 className="font-bold text-emerald-800">휴가·출장 원장을 HR에 반영했습니다.</h3><p className="mt-2">문서번호 기준으로 {result.importedRows.toLocaleString()}건을 저장했습니다.</p>{result.unmatchedRows > 0 && <p className="mt-2 text-amber-800">미매칭 {result.unmatchedRows}건은 저장하지 않았습니다.</p>}</section>}
  </section>;
}
