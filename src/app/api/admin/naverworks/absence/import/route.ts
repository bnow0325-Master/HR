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
    const byUniqueName = new Map(employees.filter((employee) => nameCounts.get(employee.name) === 1).map((employee) => [employee.name, employee]));
    let importedRows = 0;
    const unmatched: { rowNumber: number; name: string }[] = [];
    for (const row of rows) {
      const employee = byUniqueName.get(row.name);
      if (!employee) { unmatched.push({ rowNumber: row.rowNumber, name: row.name }); continue; }
      await prisma.naverWorksAbsenceRecord.upsert({
        where: { sourceDocumentNo: row.documentNo },
        create: { employeeId: employee.id, sourceDocumentNo: row.documentNo, sourceEmployeeName: row.name, sourceDepartment: row.department || null, absenceType: row.absenceType, unitsMinutes: row.unitsMinutes, periodText: row.periodText, requestedOn: row.requestedOn, sourceRow: row.rowNumber },
        update: { employeeId: employee.id, sourceEmployeeName: row.name, sourceDepartment: row.department || null, absenceType: row.absenceType, unitsMinutes: row.unitsMinutes, periodText: row.periodText, requestedOn: row.requestedOn, sourceRow: row.rowNumber },
      });
      importedRows += 1;
    }
    return NextResponse.json({ ok: true, summary: { importedRows, unmatchedRows: unmatched.length, unmatchedSamples: unmatched.slice(0, 20) } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "엑셀 파일을 읽지 못했습니다." }, { status: 400 });
  }
}
