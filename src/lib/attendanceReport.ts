const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 93;

export type AttendanceEvent = {
  employeeId: string;
  type: string;
  timestamp: Date;
  cancelledAt: Date | null;
};

export type ReportEmployee = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  hireDate: Date | null;
  terminationDate: Date | null;
};

export type AttendanceDay = {
  employeeId: string;
  code: string;
  name: string;
  department: string | null;
  date: string;
  firstIn: string | null;
  lastOut: string | null;
  sessions: string[];
  minutes: number;
  status: "완료" | "근무 중" | "퇴근 미등록" | "출근 누락" | "미출근" | "기록 없음" | "예정";
  cancelledCount: number;
};

export function kstDate(date: Date): string {
  const local = new Date(date.getTime() + KST_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

export function kstTime(date: Date): string {
  const local = new Date(date.getTime() + KST_OFFSET_MS);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : parsed;
}

export function parseAttendanceRange(params: URLSearchParams, now = new Date()) {
  const month = params.get("month") ?? kstDate(now).slice(0, 7);
  const startParam = params.get("start");
  const endParam = params.get("end");
  let startDay: Date | null;
  let endDay: Date | null;

  if (startParam !== null || endParam !== null) {
    startDay = parseDay(startParam ?? "");
    endDay = parseDay(endParam ?? "");
  } else if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    const [year, monthNumber] = month.split("-").map(Number);
    startDay = new Date(Date.UTC(year, monthNumber - 1, 1));
    endDay = new Date(Date.UTC(year, monthNumber, 0));
  } else {
    startDay = null;
    endDay = null;
  }

  if (!startDay || !endDay || startDay > endDay) {
    throw new Error("올바른 조회 기간을 입력해 주세요.");
  }
  const days = Math.round((endDay.getTime() - startDay.getTime()) / DAY_MS) + 1;
  if (days > MAX_DAYS) throw new Error("한 번에 최대 93일까지 조회할 수 있습니다.");

  const start = new Date(startDay.getTime() - KST_OFFSET_MS);
  const endExclusive = new Date(endDay.getTime() + DAY_MS - KST_OFFSET_MS);
  return {
    month,
    startDay: startDay.toISOString().slice(0, 10),
    endDay: endDay.toISOString().slice(0, 10),
    start,
    endExclusive,
    days,
    employeeId: params.get("employeeId") ?? "",
  };
}

export function buildAttendanceDays(
  employees: ReportEmployee[],
  events: AttendanceEvent[],
  range: ReturnType<typeof parseAttendanceRange>,
  now = new Date(),
): AttendanceDay[] {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const rows = new Map<string, AttendanceDay>();
  const today = kstDate(now);
  const firstDay = parseDay(range.startDay)!;

  for (const employee of employees) {
    for (let i = 0; i < range.days; i++) {
      const day = new Date(firstDay.getTime() + i * DAY_MS);
      const date = day.toISOString().slice(0, 10);
      const hire = employee.hireDate && kstDate(employee.hireDate);
      const termination = employee.terminationDate && kstDate(employee.terminationDate);
      if ((hire && date < hire) || (termination && date > termination)) continue;
      const weekday = day.getUTCDay();
      const status = date > today ? "예정" : weekday === 0 || weekday === 6 ? "기록 없음" : "미출근";
      rows.set(`${employee.id}:${date}`, {
        employeeId: employee.id,
        code: employee.code,
        name: employee.name,
        department: employee.department,
        date,
        firstIn: null,
        lastOut: null,
        sessions: [],
        minutes: 0,
        status,
        cancelledCount: 0,
      });
    }
  }

  const sorted = [...events].sort((a, b) =>
    a.employeeId.localeCompare(b.employeeId) || a.timestamp.getTime() - b.timestamp.getTime(),
  );
  const open = new Map<string, Date>();
  const getRow = (employeeId: string, date: string) => rows.get(`${employeeId}:${date}`);

  for (const event of sorted) {
    if (!employeeById.has(event.employeeId)) continue;
    const date = kstDate(event.timestamp);
    if (event.cancelledAt) {
      const row = getRow(event.employeeId, date);
      if (row) row.cancelledCount++;
      continue;
    }
    if (event.type === "IN") {
      const prior = open.get(event.employeeId);
      if (prior) {
        const priorRow = getRow(event.employeeId, kstDate(prior));
        if (priorRow) {
          priorRow.firstIn ??= kstTime(prior);
          priorRow.sessions.push(`${kstTime(prior)}–미등록`);
          priorRow.status = "퇴근 미등록";
        }
      }
      open.set(event.employeeId, event.timestamp);
    } else if (event.type === "OUT") {
      const prior = open.get(event.employeeId);
      const duration = prior ? event.timestamp.getTime() - prior.getTime() : -1;
      if (prior && duration >= 0 && duration <= DAY_MS) {
        const row = getRow(event.employeeId, kstDate(prior));
        if (row) {
          row.firstIn ??= kstTime(prior);
          row.lastOut = `${date === row.date ? "" : `${date} `}${kstTime(event.timestamp)}`;
          row.sessions.push(`${kstTime(prior)}–${row.lastOut}`);
          row.minutes += Math.round(duration / 60000);
          if (row.status !== "퇴근 미등록") row.status = "완료";
        }
        open.delete(event.employeeId);
      } else {
        if (prior) {
          const priorRow = getRow(event.employeeId, kstDate(prior));
          if (priorRow) {
            priorRow.firstIn ??= kstTime(prior);
            priorRow.sessions.push(`${kstTime(prior)}–미등록`);
            priorRow.status = "퇴근 미등록";
          }
          open.delete(event.employeeId);
        }
        const row = getRow(event.employeeId, date);
        if (row) {
          row.lastOut = kstTime(event.timestamp);
          row.sessions.push(`출근 누락–${kstTime(event.timestamp)}`);
          if (row.status !== "퇴근 미등록") row.status = "출근 누락";
        }
      }
    }
  }

  for (const [employeeId, timestamp] of open) {
    const row = getRow(employeeId, kstDate(timestamp));
    if (row) {
      const inProgress = now.getTime() >= timestamp.getTime() && now.getTime() - timestamp.getTime() <= DAY_MS;
      row.firstIn ??= kstTime(timestamp);
      row.sessions.push(`${kstTime(timestamp)}–${inProgress ? "진행 중" : "미등록"}`);
      if (row.status !== "퇴근 미등록") row.status = inProgress ? "근무 중" : "퇴근 미등록";
    }
  }

  return [...rows.values()].sort((a, b) => b.date.localeCompare(a.date) || a.code.localeCompare(b.code));
}

export function formatWorkMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}시간 ${String(minutes % 60).padStart(2, "0")}분`;
}

export function attendanceCsv(rows: AttendanceDay[]) {
  const safe = (value: string | number) => {
    const text = String(value);
    const guarded = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${guarded.replaceAll('"', '""')}"`;
  };
  const header = ["날짜", "사번", "직원", "부서", "첫 출근", "마지막 퇴근", "근무 세션", "근무시간(분)", "상태", "취소 기록 수"];
  return `\uFEFF${[header, ...rows.map((row) => [row.date, row.code, row.name, row.department ?? "", row.firstIn ?? "", row.lastOut ?? "", row.sessions.join(" / "), row.minutes, row.status, row.cancelledCount])].map((line) => line.map(safe).join(",")).join("\r\n")}\r\n`;
}
