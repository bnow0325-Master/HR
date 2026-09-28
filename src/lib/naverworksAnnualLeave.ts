import { readNaverWorksWorkbookRows } from "./naverworksCommute";

const REQUIRED_HEADERS = [
  "연차 그룹", "이름*", "로그인 아이디", "부서", "입사일", "연차 시작일", "연차 종료일",
  "연차 발생", "1년 미만 연차 발생", "1년 미만 이월 연차", "이월 일수", "사용 일수", "조정 일수", "잔여 일수",
] as const;

export type NaverWorksAnnualLeaveRow = {
  rowNumber: number;
  group: string;
  name: string;
  loginId: string;
  department: string;
  cycleStart: Date;
  cycleEnd: Date;
  annualGrantedMinutes: number;
  firstYearGrantedMinutes: number;
  firstYearCarryoverMinutes: number;
  carryoverMinutes: number;
  usedMinutes: number;
  adjustedMinutes: number;
  remainingMinutes: number;
};

function parseDate(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function parseMinutes(value: string) {
  const days = Number(value.trim().replace(/,/g, ""));
  return Number.isFinite(days) ? Math.round(days * 480) : 0;
}

export function parseNaverWorksAnnualLeaveWorkbook(buffer: Buffer) {
  const rows = readNaverWorksWorkbookRows(buffer);
  const headers = rows[0]?.map((value) => value.trim()) ?? [];
  const positions = new Map(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_HEADERS.filter((header) => !positions.has(header));
  if (missing.length > 0) throw new Error(`연차 원장 형식이 아닙니다. 누락 컬럼: ${missing.join(", ")}`);

  const get = (row: string[], header: (typeof REQUIRED_HEADERS)[number]) =>
    (row[positions.get(header) ?? -1] ?? "").trim();

  return rows.slice(1).flatMap((row, index): NaverWorksAnnualLeaveRow[] => {
    const name = get(row, "이름*").replace(/^\[삭제\]/, "").trim();
    const loginId = get(row, "로그인 아이디");
    const cycleStart = parseDate(get(row, "연차 시작일"));
    const cycleEnd = parseDate(get(row, "연차 종료일"));
    if (!name || !cycleStart || !cycleEnd) return [];

    return [{
      rowNumber: index + 2,
      group: get(row, "연차 그룹"),
      name,
      loginId,
      department: get(row, "부서"),
      cycleStart,
      cycleEnd,
      annualGrantedMinutes: parseMinutes(get(row, "연차 발생")),
      firstYearGrantedMinutes: parseMinutes(get(row, "1년 미만 연차 발생")),
      firstYearCarryoverMinutes: parseMinutes(get(row, "1년 미만 이월 연차")),
      carryoverMinutes: parseMinutes(get(row, "이월 일수")),
      usedMinutes: parseMinutes(get(row, "사용 일수")),
      adjustedMinutes: parseMinutes(get(row, "조정 일수")),
      remainingMinutes: parseMinutes(get(row, "잔여 일수")),
    }];
  });
}
