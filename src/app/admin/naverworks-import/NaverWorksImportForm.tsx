"use client";

import { useState } from "react";

type Preview = { parsedRows: number; matchedEmployees: number; pendingMappings: number; unmatchedRows: number; dateMin: string | null; dateMax: string | null; unmatchedSamples: Array<{ rowNumber: number; name: string; loginId: string }> };
type ImportResult = { importedRows: number; updatedMappings: number; unmatchedRows: number; unmatchedSamples: Array<{ rowNumber: number; name: string; loginId: string }> };

export default function NaverWorksImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"preview" | "import" | null>(null);

  async function submit(kind: "preview" | "import") {
    if (!file) { setError("네이버웍스에서 내려받은 일별 출퇴근 원장 파일을 선택해 주세요."); return; }
    setError("");
    if (kind === "preview") { setPreview(null); setResult(null); }
    setLoading(kind);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch(`/api/admin/naverworks/${kind}`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "요청을 처리하지 못했습니다."); return; }
      if (kind === "preview") setPreview(data.summary as Preview); else setResult(data.summary as ImportResult);
    } catch { setError("네트워크 오류로 요청을 처리하지 못했습니다."); }
    finally { setLoading(null); }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <label className="block text-sm font-semibold text-slate-800">일별 출퇴근 원장 (.xlsx)
      <input type="file" accept=".xlsx" className="mt-3 block w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setResult(null); setError(""); }} />
    </label>
    <p className="mt-2 text-xs text-slate-500">월 근로시간 합계 파일은 원장 검증용이며, 일별 출퇴근 파일을 먼저 가져오세요.</p>
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="button" onClick={() => void submit("preview")} disabled={loading !== null} className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{loading === "preview" ? "분석 중" : "파일 분석"}</button>
      <button type="button" onClick={() => void submit("import")} disabled={!preview || loading !== null} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{loading === "import" ? "반영 중" : "확정 반영"}</button>
    </div>
    {error && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
    {preview && <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-slate-700"><h2 className="font-bold text-blue-900">분석 완료, 아직 HR에는 반영되지 않았습니다.</h2><dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3"><dt>원장 행</dt><dd className="font-semibold">{preview.parsedRows.toLocaleString()}건</dd><dt>매칭 직원</dt><dd className="font-semibold">{preview.matchedEmployees}명</dd><dt>신규 로그인 ID 매핑</dt><dd className="font-semibold">{preview.pendingMappings}명</dd><dt>기간</dt><dd className="font-semibold">{preview.dateMin ?? "-"} ~ {preview.dateMax ?? "-"}</dd><dt>미매칭 행</dt><dd className="font-semibold">{preview.unmatchedRows}건</dd></dl>{preview.unmatchedSamples.length > 0 && <p className="mt-4 text-xs text-rose-700">미매칭 예시: {preview.unmatchedSamples.map((item) => `${item.rowNumber}행 ${item.name}`).join(", ")}</p>}</section>}
    {result && <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-slate-700"><h2 className="font-bold text-emerald-800">HR 반영이 완료되었습니다.</h2><p className="mt-2">일별 원장 {result.importedRows.toLocaleString()}건, 로그인 ID 매핑 {result.updatedMappings}명을 반영했습니다.</p>{result.unmatchedRows > 0 && <p className="mt-2 text-amber-800">미매칭 {result.unmatchedRows}건은 반영하지 않았습니다.</p>}</section>}
  </section>;
}
