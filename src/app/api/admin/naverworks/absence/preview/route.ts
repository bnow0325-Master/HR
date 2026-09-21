import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";
import { parseNaverWorksAbsenceWorkbook } from "@/lib/naverworksAbsence";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const current = await getCurrentWorkboardEmployee("any");
  if (current?.systemRole !== "ADMIN") return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "네이버웍스에서 내려받은 .xlsx 파일을 선택해 주세요." }, { status: 400 });
  try {
    const rows = parseNaverWorksAbsenceWorkbook(Buffer.from(await file.arrayBuffer()));
    const employees = await prisma.employee.findMany({ select: { id: true, name: true } });
    const nameCounts = new Map<string, number>();
    employees.forEach((employee) => nameCounts.set(employee.name, (nameCounts.get(employee.name) ?? 0) + 1));
    const matched = rows.filter((row) => nameCounts.get(row.name) === 1).length;
    const unmatched = rows.filter((row) => nameCounts.get(row.name) !== 1);
    const first = rows.map((row) => row.requestedOn).filter((value): value is Date => value !== null).sort((a, b) => a.getTime() - b.getTime());
    return NextResponse.json({ summary: { parsedRows: rows.length, matchedRows: matched, unmatchedRows: unmatched.length, dateMin: first[0]?.toISOString().slice(0, 10) ?? null, dateMax: first.at(-1)?.toISOString().slice(0, 10) ?? null, unmatchedSamples: unmatched.slice(0, 20).map((row) => ({ rowNumber: row.rowNumber, name: row.name })) } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "엑셀 파일을 읽지 못했습니다." }, { status: 400 });
  }
}
