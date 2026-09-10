"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Employee = {
  code: string;
  name: string;
  department: string | null;
  position: string | null;
  workMinutesPerDay: number;
};
type LeaveRequest = {
  id: string;
  leaveType: "ANNUAL" | "AM_HALF" | "PM_HALF";
  leaveDate: string;
  unitsMinutes: number;
  reason: string | null;
  createdAt: string;
  employee: Employee;
};
type BusinessTrip = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  createdAt: string;
  employee: Employee;
};
type Queue = { leaveRequests: LeaveRequest[]; businessTrips: BusinessTrip[] };
type Kind = "leave" | "business-trip";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function leaveTypeLabel(type: LeaveRequest["leaveType"]) {
  if (type === "AM_HALF") return "오전 반차";
  if (type === "PM_HALF") return "오후 반차";
  return "연차";
}

export default function ApprovalQueue() {
  const [queue, setQueue] = useState<Queue>({ leaveRequests: [], businessTrips: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/approvals", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "결재 목록을 불러오지 못했습니다.");
      setQueue(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "결재 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function decide(kind: Kind, requestId: string, action: "APPROVE" | "REJECT") {
    const reviewerNote = window.prompt(
      action === "APPROVE" ? "승인 메모 (선택)" : "반려 사유 (선택)",
      "",
    );
    if (reviewerNote === null) return;
    setProcessingId(requestId);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, requestId, action, reviewerNote }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "결재 처리에 실패했습니다.");
      setMessage(action === "APPROVE" ? "승인했습니다." : "반려했습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "결재 처리에 실패했습니다.");
    } finally {
      setProcessingId(null);
    }
  }

  const total = queue.leaveRequests.length + queue.businessTrips.length;
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold tracking-[0.18em] text-blue-600">BNOW PEOPLE ADMIN</div>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">휴가·출장 결재</h1>
          <p className="mt-2 text-sm text-slate-500">접수된 신청을 확인하고 승인 또는 반려합니다.</p>
        </div>
        <Link href="/admin" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">관리자 대시보드</Link>
      </header>

      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-blue-950">
        <div className="text-sm font-medium">승인 대기</div>
        <div className="mt-1 text-3xl font-bold">{total}건</div>
      </div>

      {message && <div className="mb-5 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{message}</div>}
      {loading ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center text-slate-400">결재 목록을 불러오는 중입니다.</div> : (
        <div className="space-y-6">
          <ApprovalSection title="휴가 신청" empty="승인 대기 중인 휴가 신청이 없습니다.">
            {queue.leaveRequests.map((request) => (
              <ApprovalCard key={request.id} employee={request.employee} detail={`${formatDate(request.leaveDate)} · ${leaveTypeLabel(request.leaveType)} · ${request.unitsMinutes / request.employee.workMinutesPerDay}일`} reason={request.reason} processing={processingId === request.id} onApprove={() => decide("leave", request.id, "APPROVE")} onReject={() => decide("leave", request.id, "REJECT")} />
            ))}
          </ApprovalSection>
          <ApprovalSection title="출장 신청" empty="승인 대기 중인 출장 신청이 없습니다.">
            {queue.businessTrips.map((trip) => (
              <ApprovalCard key={trip.id} employee={trip.employee} detail={`${formatDate(trip.startDate)} ~ ${formatDate(trip.endDate)}`} reason={trip.reason} processing={processingId === trip.id} onApprove={() => decide("business-trip", trip.id, "APPROVE")} onReject={() => decide("business-trip", trip.id, "REJECT")} />
            ))}
          </ApprovalSection>
        </div>
      )}
    </main>
  );
}

function ApprovalSection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) && children.length > 0;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-xl font-bold text-slate-900">{title}</h2></div>{hasChildren ? <div className="divide-y divide-slate-100">{children}</div> : <div className="px-5 py-12 text-center text-sm text-slate-400">{empty}</div>}</section>;
}

function ApprovalCard({ employee, detail, reason, processing, onApprove, onReject }: { employee: Employee; detail: string; reason: string | null; processing: boolean; onApprove: () => void; onReject: () => void }) {
  return <article className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div><div className="font-semibold text-slate-900">{employee.name} <span className="font-normal text-slate-400">({employee.code})</span></div><div className="mt-1 text-sm text-slate-600">{detail}</div><div className="mt-1 text-xs text-slate-400">{[employee.department, employee.position].filter(Boolean).join(" · ") || "부서 미지정"}{reason ? ` · ${reason}` : ""}</div></div><div className="flex gap-2"><button type="button" disabled={processing} onClick={onReject} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">반려</button><button type="button" disabled={processing} onClick={onApprove} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{processing ? "처리 중..." : "승인"}</button></div></article>;
}
