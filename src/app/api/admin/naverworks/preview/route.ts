import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";
import { parseNaverWorksCommuteWorkbook } from "@/lib/naverworksCommute";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const current = await getCurrentWorkboardEmployee("any");
  if (current?.systemRole !== "ADMIN") return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "네이버웍스에서 내려받은 .xlsx 파일을 선택해 주세요." }, { status: 400 });
  let rows;
  try { rows = parseNaverWorksCommuteWorkbook(Buffer.from(await file.arrayBuffer())); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "엑셀 파일을 읽지 못했습니다." }, { status: 400 }); }
  // Historical NAVER WORKS records must also remain attached to resigned employees.
  const employees = await prisma.employee.findMany({ select: { id: true, name: true, externalLoginId: true } });
  const byLogin = new Map(employees.filter((item) => item.externalLoginId).map((item) => [item.externalLoginId!.toLowerCase(), item]));
  const nameCounts = new Map<string, number>();
  employees.forEach((item) => nameCounts.set(item.name, (nameCounts.get(item.name) ?? 0) + 1));
  const byUniqueName = new Map(employees.filter((item) => nameCounts.get(item.name) === 1).map((item) => [item.name, item]));
  const matched = new Set<string>();
  const mappings = new Set<string>();
  const unmatched: { rowNumber: number; name: string; loginId: string }[] = [];
  for (const row of rows) {
    const employee = (row.loginId ? byLogin.get(row.loginId) : null) ?? byUniqueName.get(row.name);
    if (!employee) unmatched.push({ rowNumber: row.rowNumber, name: row.name, loginId: row.loginId });
    else { matched.add(employee.id); if (row.loginId && employee.externalLoginId?.toLowerCase() !== row.loginId) mappings.add(employee.id); }
  }
  const dates = rows.map((row) => row.baseDateKey).sort();
  return NextResponse.json({ ok: true, summary: { parsedRows: rows.length, matchedEmployees: matched.size, pendingMappings: mappings.size, unmatchedRows: unmatched.length, dateMin: dates[0] ?? null, dateMax: dates.at(-1) ?? null, unmatchedSamples: unmatched.slice(0, 20) } });
}
