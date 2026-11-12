import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfKstDate } from "@/lib/annualLeave";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

type Body = { employeeId?: string; sourceWorkDate?: string; reason?: string };

export async function POST(request: Request) {
  const admin = await getCurrentWorkboardEmployee("any");
  const ceoEmail = (process.env.APPROVAL_CEO_EMAIL?.trim() || "elon.choo@bnow.co.kr").toLowerCase();
  if (!admin || admin.email?.toLowerCase() !== ceoEmail || admin.systemRole !== "ADMIN" || !admin.workboardEnabled) {
    return NextResponse.json({ error: "대표이사 권한이 필요합니다." }, { status: 403 });
  }
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const sourceWorkDate = startOfKstDate(body.sourceWorkDate ?? "");
  const reason = body.reason?.trim() ?? "";
  if (!body.employeeId || !sourceWorkDate || sourceWorkDate.toISOString().slice(0, 10) !== body.sourceWorkDate || !reason || reason.length > 500 || sourceWorkDate > new Date()) {
    return NextResponse.json({ error: "직원, 근무일, 부여 사유를 확인해 주세요." }, { status: 400 });
  }
  const employeeId = body.employeeId;
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Employee WHERE id = ${employeeId} FOR UPDATE`;
      const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: {
        id: true, code: true, name: true, active: true, leaveEnabled: true, hireDate: true, workMinutesPerDay: true,
      } });
      if (!employee || !employee.active || !employee.leaveEnabled || employee.workMinutesPerDay <= 0) throw new Error("EMPLOYEE");
      if (employee.hireDate && sourceWorkDate < employee.hireDate) throw new Error("PERIOD");
      const prior = await tx.specialLeaveGrant.findUnique({ where: { employeeId_sourceWorkDate: { employeeId, sourceWorkDate } }, select: { id: true } });
      if (prior) throw new Error("DUPLICATE");
      const created = await tx.specialLeaveGrant.create({ data: {
        employeeId, sourceWorkDate, unitsMinutes: employee.workMinutesPerDay, reason, grantedByEmail: admin.email ?? ceoEmail,
      }, select: { id: true } });
      await tx.approvalAudit.create({ data: {
        employeeId, requestKind: "special-leave-grant", requestId: created.id, action: "GRANT",
        toStatus: "GRANTED", actorEmail: admin.email, actorName: admin.name, note: `${body.sourceWorkDate} · ${reason} · 1일`,
      } });
      return { id: created.id, employeeName: employee.name, employeeCode: employee.code, sourceWorkDate: body.sourceWorkDate, grantedDays: 1 };
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "EMPLOYEE") return NextResponse.json({ error: "휴가 사용 가능한 직원을 찾을 수 없습니다." }, { status: 404 });
    if (code === "PERIOD") return NextResponse.json({ error: "입사일 이후 근무일을 입력해 주세요." }, { status: 409 });
    if (code === "DUPLICATE" || (error && typeof error === "object" && "code" in error && error.code === "P2002")) {
      return NextResponse.json({ error: "해당 근무일의 특별휴가는 이미 부여되었습니다." }, { status: 409 });
    }
    throw error;
  }
}
