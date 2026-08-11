// 인사관리 집계 유틸. 기간(주/월/연) 범위 계산과 출퇴근 기록 → 직원별 요약.
// 모든 기간 경계는 한국 시간(KST, UTC+9) 기준으로 계산한다.

const KST_OFFSET_MIN = 9 * 60;

export type Period = "today" | "week" | "month" | "year";

function toKstParts(d: Date) {
  const k = new Date(d.getTime() + KST_OFFSET_MIN * 60000);
  return {
    y: k.getUTCFullYear(),
    m: k.getUTCMonth(),
    d: k.getUTCDate(),
    dow: k.getUTCDay(), // 0=일 .. 6=토
  };
}

/** KST 날짜(y, m, day)의 자정을 UTC Date로 변환. */
function kstMidnightUtc(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m, day) - KST_OFFSET_MIN * 60000);
}

/** 기간의 [시작, 끝] 범위(UTC)와 표시용 라벨을 반환. 끝은 now. */
export function periodRange(period: Period, now: Date) {
  const { y, m, d, dow } = toKstParts(now);
  let start: Date;
  let label: string;

  switch (period) {
    case "today":
      start = kstMidnightUtc(y, m, d);
      label = "오늘";
      break;
    case "week": {
      // 월요일 시작
      const backToMonday = (dow + 6) % 7;
      start = kstMidnightUtc(y, m, d - backToMonday);
      label = "이번 주";
      break;
    }
    case "month":
      start = kstMidnightUtc(y, m, 1);
      label = "이번 달";
      break;
    case "year":
      start = kstMidnightUtc(y, 0, 1);
      label = "올해";
      break;
  }

  return { start, end: now, label };
}

/** KST 기준 YYYY-MM-DD 문자열 (근무일 구분용). */
function kstDateKey(d: Date): string {
  const p = toKstParts(d);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

type RecordLite = {
  employeeId: string;
  type: string; // "IN" | "OUT"
  timestamp: Date;
  employee: { name: string; code: string; department: string | null };
};

export type EmployeeSummary = {
  employeeId: string;
  name: string;
  code: string;
  department: string | null;
  workDays: number; // 출근한 날 수
  sessions: number; // 완성된 출근-퇴근 쌍 수
  totalMinutes: number; // 총 근무 시간(분)
  firstIn: Date | null;
  lastOut: Date | null;
  openSession: boolean; // 퇴근 안 찍힌 진행중 세션 존재
};

/**
 * 출퇴근 이벤트를 직원별 근무 요약으로 집계한다.
 * IN → 다음 OUT을 짝지어 근무 세션을 만들고, 짝 없는 이벤트는 무시한다.
 */
export function aggregate(records: RecordLite[]): EmployeeSummary[] {
  const byEmp = new Map<string, RecordLite[]>();
  for (const r of records) {
    const arr = byEmp.get(r.employeeId) ?? [];
    arr.push(r);
    byEmp.set(r.employeeId, arr);
  }

  const summaries: EmployeeSummary[] = [];

  for (const [employeeId, recs] of byEmp) {
    recs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const workDays = new Set<string>();
    let sessions = 0;
    let totalMinutes = 0;
    let pendingIn: Date | null = null;
    let firstIn: Date | null = null;
    let lastOut: Date | null = null;

    for (const r of recs) {
      if (r.type === "IN") {
        workDays.add(kstDateKey(r.timestamp));
        if (!firstIn) firstIn = r.timestamp;
        // 이전 IN이 OUT 없이 또 IN이면 이전 것은 버리고 최신 IN 사용
        pendingIn = r.timestamp;
      } else if (r.type === "OUT") {
        lastOut = r.timestamp;
        if (pendingIn) {
          const diff =
            (r.timestamp.getTime() - pendingIn.getTime()) / 60000;
          if (diff > 0) {
            totalMinutes += diff;
            sessions += 1;
          }
          pendingIn = null;
        }
      }
    }

    const first = recs[0];
    summaries.push({
      employeeId,
      name: first.employee.name,
      code: first.employee.code,
      department: first.employee.department,
      workDays: workDays.size,
      sessions,
      totalMinutes: Math.round(totalMinutes),
      firstIn,
      lastOut,
      openSession: pendingIn !== null,
    });
  }

  summaries.sort((a, b) => a.code.localeCompare(b.code));
  return summaries;
}

/** 분 → "8시간 30분" 형태. */
export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}
