import { readNaverWorksWorkbookRows } from "./naverworksCommute";

const REQUIRED_HEADERS = ["문서 번호", "이름", "부서", "부재 항목", "일수", "기간", "작성일(취소일)"] as const;

export type NaverWorksAbsenceRow = {
  rowNumber: number;
  documentNo: string;
  name: string;
  department: string;
  absenceType: string;
  unitsMinutes: number;
  periodText: string;
  requestedOn: Date | null;
};

function parseDate(value: string) {
  const match = /^(\d{4})[.-](\d{2})[.-](\d{2})/.exec(value.trim());
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function parseUnits(value: string) {
  const units = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(units) && units > 0 ? Math.round(units * 480) : 0;
}

export function parseNaverWorksAbsenceWorkbook(buffer: Buffer) {
  const rows = readNaverWorksWorkbookRows(buffer);
  const headers = rows[0]?.map((value) => value.trim()) ?? [];
  const positions = new Map(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_HEADERS.filter((header) => !positions.has(header));
  if (missing.length > 0) throw new Error(`부재 일정 원장 형식이 아닙니다. 누락 컬럼: ${missing.join(", ")}`);
  const get = (row: string[], header: (typeof REQUIRED_HEADERS)[number]) => (row[positions.get(header) ?? -1] ?? "").trim();

  return rows.slice(1).flatMap((row, index): NaverWorksAbsenceRow[] => {
    const documentNo = get(row, "문서 번호");
    const name = get(row, "이름").replace(/^\[삭제\]/, "").trim();
    const absenceType = get(row, "부재 항목");
    const periodText = get(row, "기간");
    if (!documentNo || !name || !absenceType || !periodText) return [];
    return [{
      rowNumber: index + 2,
      documentNo,
      name,
      department: get(row, "부서"),
      absenceType,
      unitsMinutes: parseUnits(get(row, "일수")),
      periodText,
      requestedOn: parseDate(get(row, "작성일(취소일)")),
    }];
  });
}
