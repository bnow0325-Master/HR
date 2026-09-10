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

  const employees = await prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true, department: true, externalLoginId: true } });
  const byLogin = new Map(employees.filter((item) => item.externalLoginId).map((item) => [item.externalLoginId!.toLowerCase(), item]));
  const nameCounts = new Map<string, number>();
  employees.forEach((item) => nameCounts.set(item.name, (nameCounts.get(item.name) ?? 0) + 1));
  const byUniqueName = new Map(employees.filter((item) => nameCounts.get(item.name) === 1).map((item) => [item.name, item]));
  let importedRows = 0;
  let updatedMappings = 0;
  const unmatched: { rowNumber: number; name: string; loginId: string }[] = [];

  for (const row of rows) {
    const employee = (row.loginId ? byLogin.get(row.loginId) : null) ?? byUniqueName.get(row.name);
    if (!employee) { unmatched.push({ rowNumber: row.rowNumber, name: row.name, loginId: row.loginId }); continue; }
    if (row.loginId && employee.externalLoginId?.toLowerCase() !== row.loginId) {
      await prisma.employee.update({ where: { id: employee.id }, data: { externalLoginId: row.loginId, department: employee.department || row.department || null } });
      employee.externalLoginId = row.loginId;
      byLogin.set(row.loginId, employee);
      updatedMappings += 1;
    }
    await prisma.naverWorksDailyRecord.upsert({
      where: { employeeId_baseDate: { employeeId: employee.id, baseDate: row.baseDate } },
      create: { employeeId: employee.id, baseDate: row.baseDate, workStyle: row.workStyle || null, workType: row.workType || null, schedule: row.schedule || null, checkInAt: row.checkInAt, checkOutAt: row.checkOutAt, checkInRaw: row.checkInRaw || null, checkOutRaw: row.checkOutRaw || null, workLocation: row.workLocation || null, breakMinutes: row.breakMinutes, offsiteMinutes: row.offsiteMinutes, absenceMinutes: row.absenceMinutes, late: row.late, earlyLeave: row.earlyLeave, requiredWorkCompliant: row.requiredWorkCompliant || null, scheduleCompliant: row.scheduleCompliant || null, scheduleVariance: row.scheduleVariance || null, sourceLoginId: row.loginId || employee.externalLoginId || row.name, sourceRow: row.rowNumber },
      update: { workStyle: row.workStyle || null, workType: row.workType || null, schedule: row.schedule || null, checkInAt: row.checkInAt, checkOutAt: row.checkOutAt, checkInRaw: row.checkInRaw || null, checkOutRaw: row.checkOutRaw || null, workLocation: row.workLocation || null, breakMinutes: row.breakMinutes, offsiteMinutes: row.offsiteMinutes, absenceMinutes: row.absenceMinutes, late: row.late, earlyLeave: row.earlyLeave, requiredWorkCompliant: row.requiredWorkCompliant || null, scheduleCompliant: row.scheduleCompliant || null, scheduleVariance: row.scheduleVariance || null, sourceLoginId: row.loginId || employee.externalLoginId || row.name, sourceRow: row.rowNumber },
    });
    importedRows += 1;
  }
  return NextResponse.json({ ok: true, summary: { importedRows, updatedMappings, unmatchedRows: unmatched.length, unmatchedSamples: unmatched.slice(0, 20) } });
}
