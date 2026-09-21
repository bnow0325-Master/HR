import { inflateRawSync } from "zlib";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type NaverWorksCommuteRow = {
  rowNumber: number;
  name: string;
  loginId: string;
  department: string;
  baseDate: Date;
  baseDateKey: string;
  workStyle: string;
  workType: string;
  schedule: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  checkInRaw: string;
  checkOutRaw: string;
  workLocation: string;
  breakMinutes: number;
  offsiteMinutes: number;
  absenceMinutes: number;
  late: boolean;
  earlyLeave: boolean;
  requiredWorkCompliant: string;
  scheduleCompliant: string;
  scheduleVariance: string;
};

const REQUIRED_HEADERS = [
  "근무 방식", "이름", "로그인 아이디", "부서", "기준일", "근무 구분", "근무 일정",
  "출근", "퇴근", "근무 위치", "휴게", "외부 근무", "부재", "지각", "조퇴",
  "의무 근로 준수", "근무 일정 준수", "근무 일정 대비 과부족",
] as const;

type ZipEntry = { name: string; method: number; compressedSize: number; offset: number };

function decode(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function text(value: string | undefined) {
  return decode(value ?? "").replace(/<[^>]+>/g, "").trim();
}

// NAVER WORKS exports namespace-prefixed spreadsheet XML (for example x:row).
// Accept both the standard and prefixed OpenXML element forms.
const xmlTag = (name: string) => `(?:[A-Za-z_][\\w.-]*:)?${name}`;

function columnIndex(ref: string) {
  return ref.replace(/\d/g, "").split("").reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function entries(buffer: Buffer) {
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("엑셀 파일 구조를 읽을 수 없습니다.");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const result: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("엑셀 파일 목차를 읽을 수 없습니다.");
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    result.push({
      name: buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"),
      method: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      offset: buffer.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

function zipFile(buffer: Buffer, index: ZipEntry[], name: string) {
  const entry = index.find((item) => item.name === name);
  if (!entry) return null;
  const nameLength = buffer.readUInt16LE(entry.offset + 26);
  const extraLength = buffer.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLength + extraLength;
  const content = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return content.toString("utf8");
  if (entry.method === 8) return inflateRawSync(content).toString("utf8");
  throw new Error("지원하지 않는 엑셀 압축 방식입니다.");
}

export function readNaverWorksWorkbookRows(buffer: Buffer) {
  const index = entries(buffer);
  const shared = zipFile(buffer, index, "xl/sharedStrings.xml") ?? "";
  const strings = [...shared.matchAll(new RegExp(`<${xmlTag("si")}\\b[^>]*>([\\s\\S]*?)<\\/${xmlTag("si")}>`, "g"))].map((match) => text(match[1]));
  const sheet = index.map((item) => item.name).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const xml = sheet ? zipFile(buffer, index, sheet) : null;
  if (!xml) throw new Error("엑셀 시트를 찾지 못했습니다.");
  return [...xml.matchAll(new RegExp(`<${xmlTag("row")}\\b[^>]*>([\\s\\S]*?)<\\/${xmlTag("row")}>`, "g"))].map((rowMatch) => {
    const row: string[] = [];
    // Empty cells are self-closing (<x:c .../>). Treating them as open cells
    // would consume the next value and shift every following column.
    const cellPattern = new RegExp(`<${xmlTag("c")}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${xmlTag("c")}>)`, "g");
    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      const ref = /r="([^"]+)"/.exec(cellMatch[1])?.[1];
      if (!ref) continue;
      const content = cellMatch[2] ?? "";
      const value = new RegExp(`<${xmlTag("v")}>([\\s\\S]*?)<\\/${xmlTag("v")}>`).exec(content)?.[1]
        ?? new RegExp(`<${xmlTag("is")}[^>]*>([\\s\\S]*?)<\\/${xmlTag("is")}>`).exec(content)?.[1]
        ?? "";
      const isShared = /t="s"/.test(cellMatch[1]);
      row[columnIndex(ref)] = isShared ? strings[Number(value)] ?? "" : text(value);
    }
    return row;
  });
}

function parseDate(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return { key: `${year}-${month}-${day}`, date: new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))) };
}

function parseTime(value: string, dateKey: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, Number(match[1]), Number(match[2])) - KST_OFFSET_MS);
}

function parseMinutes(value: string) {
  const match = /^(\d+):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

export function parseNaverWorksCommuteWorkbook(buffer: Buffer) {
  const rows = readNaverWorksWorkbookRows(buffer);
  const headers = rows[0]?.map((value) => value.trim()) ?? [];
  const positions = new Map(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_HEADERS.filter((header) => !positions.has(header));
  if (missing.length > 0) throw new Error(`일별 출퇴근 원장 형식이 아닙니다. 누락 컬럼: ${missing.join(", ")}`);
  const get = (row: string[], header: (typeof REQUIRED_HEADERS)[number]) => (row[positions.get(header) ?? -1] ?? "").trim();
  return rows.slice(1).flatMap((row, index): NaverWorksCommuteRow[] => {
    const name = get(row, "이름");
    const parsedDate = parseDate(get(row, "기준일"));
    if (!name || !parsedDate) return [];
    const checkInRaw = get(row, "출근");
    const checkOutRaw = get(row, "퇴근");
    return [{
      rowNumber: index + 2, name, loginId: get(row, "로그인 아이디").toLowerCase(), department: get(row, "부서"),
      baseDate: parsedDate.date, baseDateKey: parsedDate.key, workStyle: get(row, "근무 방식"), workType: get(row, "근무 구분"), schedule: get(row, "근무 일정"),
      checkInAt: parseTime(checkInRaw, parsedDate.key), checkOutAt: parseTime(checkOutRaw, parsedDate.key), checkInRaw, checkOutRaw,
      workLocation: get(row, "근무 위치"), breakMinutes: parseMinutes(get(row, "휴게")), offsiteMinutes: parseMinutes(get(row, "외부 근무")), absenceMinutes: parseMinutes(get(row, "부재")),
      late: Boolean(get(row, "지각")), earlyLeave: Boolean(get(row, "조퇴")), requiredWorkCompliant: get(row, "의무 근로 준수"), scheduleCompliant: get(row, "근무 일정 준수"), scheduleVariance: get(row, "근무 일정 대비 과부족"),
    }];
  });
}
