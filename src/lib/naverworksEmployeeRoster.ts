import { readNaverWorksWorkbookRows } from "./naverworksCommute";

const REQUIRED_HEADERS = ["근무 방식", "이름", "로그인 아이디", "부서"] as const;

export type NaverWorksEmployeeRosterRow = {
  rowNumber: number;
  name: string;
  loginId: string;
  department: string;
  workStyle: string;
};

export function parseNaverWorksEmployeeRosterWorkbook(buffer: Buffer) {
  const rows = readNaverWorksWorkbookRows(buffer);
  const headers = rows[0]?.map((value) => value.trim()) ?? [];
  const positions = new Map(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_HEADERS.filter((header) => !positions.has(header));
  if (missing.length > 0) {
    throw new Error(`네이버웍스 근로시간 원장 형식이 아닙니다. 누락 컬럼: ${missing.join(", ")}`);
  }

  const get = (row: string[], header: (typeof REQUIRED_HEADERS)[number]) =>
    (row[positions.get(header) ?? -1] ?? "").trim();

  return rows.slice(1).flatMap((row, index): NaverWorksEmployeeRosterRow[] => {
    const name = get(row, "이름");
    const loginId = get(row, "로그인 아이디").toLowerCase();
    if (!name || !loginId) return [];
    return [{
      rowNumber: index + 2,
      name,
      loginId,
      department: get(row, "부서"),
      workStyle: get(row, "근무 방식"),
    }];
  });
}
