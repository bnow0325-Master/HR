"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./approvalQueue.module.css";

type Employee = {
  code: string;
  name: string;
  department: string | null;
  position: string | null;
  workMinutesPerDay: number;
};
type QueueItem = {
  id: string;
  kind: "leave" | "business-trip";
  kindLabel: string;
  detail: string;
  reason: string | null;
  createdAt: string;
  employee: Employee;
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
type KindFilter = "all" | QueueItem["kind"];

const previewQueue: Queue = {
  leaveRequests: [
    {
      id: "preview-admin-leave", leaveType: "ANNUAL", leaveDate: "2026-09-29T00:00:00.000Z",
      unitsMinutes: 480, reason: "가족 행사", createdAt: "2026-09-18T01:15:00.000Z",
      employee: { code: "DEV-002", name: "테스트 신청자", department: "운영지원", position: "매니저", workMinutesPerDay: 480 },
    },
  ],
  businessTrips: [
    {
      id: "preview-admin-trip", startDate: "2026-10-05T00:00:00.000Z", endDate: "2026-10-07T00:00:00.000Z",
      reason: "파트너사 기술 협의", createdAt: "2026-09-17T04:20:00.000Z",
      employee: { code: "DEV-003", name: "테스트 담당자", department: "제품개발", position: "연구원", workMinutesPerDay: 480 },
    },
  ],
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function leaveTypeLabel(type: LeaveRequest["leaveType"]) {
  if (type === "AM_HALF") return "오전 반차";
  if (type === "PM_HALF") return "오후 반차";
  return "연차";
}

export default function ApprovalQueue({ preview = false }: { preview?: boolean }) {
  const [queue, setQueue] = useState<Queue>({ leaveRequests: [], businessTrips: [] });
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [reviewerNote, setReviewerNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const allItems = useMemo<QueueItem[]>(() => [
    ...queue.leaveRequests.map((request) => ({
      id: request.id,
      kind: "leave" as const,
      kindLabel: "휴가",
      detail: `${formatDate(request.leaveDate)} · ${leaveTypeLabel(request.leaveType)} · ${request.unitsMinutes / request.employee.workMinutesPerDay}일`,
      reason: request.reason,
      createdAt: request.createdAt,
      employee: request.employee,
    })),
    ...queue.businessTrips.map((trip) => ({
      id: trip.id,
      kind: "business-trip" as const,
      kindLabel: "출장",
      detail: `${formatDate(trip.startDate)} ~ ${formatDate(trip.endDate)}`,
      reason: trip.reason,
      createdAt: trip.createdAt,
      employee: trip.employee,
    })),
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)), [queue]);

  const filteredItems = kindFilter === "all" ? allItems : allItems.filter((item) => item.kind === kindFilter);

  async function load(focusKey?: string) {
    setLoading(true);
    if (preview) {
      setQueue(previewQueue);
      setLoading(false);
      if (focusKey) {
        const [kind, id] = focusKey.split(":", 2);
        const item = kind === "leave"
          ? previewQueue.leaveRequests.find((request) => request.id === id)
          : previewQueue.businessTrips.find((trip) => trip.id === id);
        if (item && kind === "leave") {
          const leave = item as LeaveRequest;
          setSelected({ id: leave.id, kind: "leave", kindLabel: "휴가", detail: `${formatDate(leave.leaveDate)} · ${leaveTypeLabel(leave.leaveType)} · ${leave.unitsMinutes / leave.employee.workMinutesPerDay}일`, reason: leave.reason, createdAt: leave.createdAt, employee: leave.employee });
        } else if (item && kind === "business-trip") {
          const trip = item as BusinessTrip;
          setSelected({ id: trip.id, kind: "business-trip", kindLabel: "출장", detail: `${formatDate(trip.startDate)} ~ ${formatDate(trip.endDate)}`, reason: trip.reason, createdAt: trip.createdAt, employee: trip.employee });
        }
      }
      return;
    }
    try {
      const response = await fetch("/api/admin/approvals", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "결재 목록을 불러오지 못했습니다.");
      setQueue(data);
      if (focusKey) {
        const [kind, id] = focusKey.split(":", 2);
        const leaves: QueueItem[] = data.leaveRequests.map((request: LeaveRequest) => ({
          id: request.id, kind: "leave", kindLabel: "휴가",
          detail: `${formatDate(request.leaveDate)} · ${leaveTypeLabel(request.leaveType)} · ${request.unitsMinutes / request.employee.workMinutesPerDay}일`,
          reason: request.reason, createdAt: request.createdAt, employee: request.employee,
        }));
        const trips: QueueItem[] = data.businessTrips.map((trip: BusinessTrip) => ({
          id: trip.id, kind: "business-trip", kindLabel: "출장",
          detail: `${formatDate(trip.startDate)} ~ ${formatDate(trip.endDate)}`,
          reason: trip.reason, createdAt: trip.createdAt, employee: trip.employee,
        }));
        const focused = [...leaves, ...trips].find((item) => item.kind === kind && item.id === id);
        if (focused) setSelected(focused);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "결재 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus") ?? undefined;
    void load(focus);
  }, [preview]);

  async function decide(action: "APPROVE" | "REJECT") {
    if (!selected || !reviewerNote.trim() || processing) return;
    setProcessing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: selected.kind, requestId: selected.id, action, reviewerNote }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "결재 처리에 실패했습니다.");
      setSelected(null);
      setReviewerNote("");
      setMessage(action === "APPROVE" ? "승인하고 신청자에게 알렸습니다." : "반려하고 신청자에게 알렸습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "결재 처리에 실패했습니다.");
    } finally {
      setProcessing(false);
    }
  }

  const leaveCount = allItems.filter((item) => item.kind === "leave").length;
  const tripCount = allItems.length - leaveCount;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>BNOW PEOPLE ADMIN</div>
          <h1>결재함</h1>
          <p>가장 오래 기다린 휴가·출장 신청부터 확인합니다.</p>
        </div>
        <Link href="/admin" className={styles.backLink}>관리자 대시보드</Link>
      </header>

      <section className={styles.summary}>
        <div><span>전체 미결</span><strong>{allItems.length}</strong><small>건</small></div>
        <div><span>휴가</span><strong>{leaveCount}</strong><small>건</small></div>
        <div><span>출장</span><strong>{tripCount}</strong><small>건</small></div>
      </section>

      <nav className={styles.filters} aria-label="결재 종류 필터">
        {([
          ["all", "전체", allItems.length],
          ["leave", "휴가", leaveCount],
          ["business-trip", "출장", tripCount],
        ] as const).map(([value, label, count]) => (
          <button key={value} type="button" onClick={() => setKindFilter(value)} className={kindFilter === value ? styles.active : ""}>
            {label}<span>{count}</span>
          </button>
        ))}
      </nav>

      {message && <div className={styles.notice}>{message}</div>}

      {loading ? <div className={styles.empty}>결재 목록을 불러오는 중입니다.</div> : filteredItems.length === 0 ? (
        <div className={styles.empty}>처리할 미결 신청이 없습니다.</div>
      ) : (
        <section className={styles.queue} aria-label="승인 대기 목록">
          {filteredItems.map((item, index) => (
            <button key={`${item.kind}:${item.id}`} type="button" className={styles.card} onClick={() => { setSelected(item); setReviewerNote(""); }}>
              <span className={styles.order}>{index + 1}</span>
              <span className={styles.cardBody}>
                <span className={styles.cardTop}><strong>{item.employee.name}</strong><em>{item.kindLabel}</em></span>
                <span className={styles.detail}>{item.detail}</span>
                <span className={styles.reason}>{item.reason || "사유 없음"}</span>
              </span>
              <span className={styles.waiting}>신청 {formatDateTime(item.createdAt)}<strong>검토하기</strong></span>
            </button>
          ))}
        </section>
      )}

      {selected && (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !processing) setSelected(null);
        }}>
          <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="review-title">
            <header>
              <div><span>{selected.kindLabel} 결재</span><h2 id="review-title">{selected.employee.name}님의 신청</h2></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="닫기" disabled={processing}>×</button>
            </header>
            <div className={styles.sheetBody}>
              <dl>
                <div><dt>직원</dt><dd>{selected.employee.name} ({selected.employee.code})</dd></div>
                <div><dt>소속</dt><dd>{[selected.employee.department, selected.employee.position].filter(Boolean).join(" · ") || "부서 미지정"}</dd></div>
                <div><dt>신청</dt><dd>{selected.detail}</dd></div>
                <div><dt>사유</dt><dd>{selected.reason || "사유 없음"}</dd></div>
                <div><dt>접수</dt><dd>{formatDateTime(selected.createdAt)}</dd></div>
              </dl>
              <label>결재 사유 <span>필수 · 감사 이력에 저장됩니다</span>
                <textarea autoFocus value={reviewerNote} maxLength={1000} rows={4} onChange={(event) => setReviewerNote(event.target.value)} placeholder="승인 또는 반려 판단의 사유를 입력해 주세요." />
              </label>
            </div>
            <footer>
              <button type="button" className={styles.reject} disabled={processing || !reviewerNote.trim()} onClick={() => void decide("REJECT")}>{processing ? "처리 중..." : "반려"}</button>
              <button type="button" className={styles.approve} disabled={processing || !reviewerNote.trim()} onClick={() => void decide("APPROVE")}>{processing ? "처리 중..." : "승인"}</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
