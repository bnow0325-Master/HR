import { enqueueAbsenceStatusNotifications, dispatchPendingHrNotifications } from "@/lib/hrNotifications";
import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentLeavePeriod, startOfKstDate, statutoryAnnualLeaveDays } from "@/lib/annualLeave";
import { adminLeaveBalance } from "@/lib/adminLeaveBalance";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

type Body = { employeeId?: string; leaveDate?: string; leaveType?: "ANNUAL" | "AM_HALF" | "PM_HALF" };

export async function POST(request: Request) {
  const admin = await getCurrentWorkboardEmployee("any");
  const ceoEmail = (process.env.APPROVAL_CEO_EMAIL?.trim() || "elon.choo@bnow.co.kr").toLowerCase();
  if (!admin || admin.email?.toLowerCase() !== ceoEmail || admin.systemRole !== "ADMIN" || !admin.workboardEnabled) {
    return NextResponse.json({ error: "대표이사 권한이 필요합니다." }, { status: 403 });
  }
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const leaveDate = startOfKstDate(body.leaveDate ?? "");
  if (!body.employeeId || !leaveDate || !body.leaveType || !["ANNUAL", "AM_HALF", "PM_HALF"].includes(body.leaveType)) {
    return NextResponse.json({ error: "직원, 날짜, 휴가 종류를 확인해 주세요." }, { status: 400 });
  }
  const employeeId = body.employeeId;
  const leaveType = body.leaveType;
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialize registrations and approvals for the same employee.
      await tx.$queryRaw`SELECT id FROM Employee WHERE id = ${employeeId} FOR UPDATE`;
      const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: {
        id: true, code: true, name: true, email: true, active: true, leaveEnabled: true, hireDate: true, workMinutesPerDay: true,
      } });
      if (!employee || !employee.active || !employee.leaveEnabled || !employee.hireDate) throw new Error("EMPLOYEE");
      const period = currentLeavePeriod(employee.hireDate);
      if (leaveDate < period.start || leaveDate >= period.end) throw new Error("PERIOD");
      const nextDay = new Date(leaveDate.getTime() + 86_400_000);
      const duplicate = await tx.leaveRequest.findFirst({ where: { employeeId, leaveDate: { gte: leaveDate, lt: nextDay }, status: { in: ["PENDING", "APPROVED"] } }, select: { id: true } });
      if (duplicate) throw new Error("DUPLICATE");
      const now = new Date();
      const source = await tx.naverWorksAnnualLeaveBalance.findFirst({ where: { employeeId, cycleStart: { lte: now }, cycleEnd: { gte: now } }, orderBy: [{ sourceAsOf: "desc" }, { importedAt: "desc" }] });
      const cutover = startOfKstDate(process.env.NAVER_WORKS_LEAVE_CUTOVER_DATE ?? "");
      const requests = await tx.leaveRequest.findMany({ where: { employeeId, leaveDate: { gte: period.start, lt: period.end }, status: { in: ["PENDING", "APPROVED"] } }, select: { leaveType: true, status: true, unitsMinutes: true, createdAt: true } });
      const included = requests.filter((item) => item.leaveType !== "SPECIAL" && (!source || !cutover || item.createdAt >= cutover));
      const approvedMinutes = included.filter((item) => item.status === "APPROVED").reduce((sum, item) => sum + item.unitsMinutes, 0);
      const pendingMinutes = included.filter((item) => item.status === "PENDING").reduce((sum, item) => sum + item.unitsMinutes, 0);
      const grantedMinutes = source ? source.annualGrantedMinutes + source.firstYearGrantedMinutes + source.firstYearCarryoverMinutes + source.carryoverMinutes + source.adjustedMinutes : statutoryAnnualLeaveDays(employee.hireDate, now) * employee.workMinutesPerDay;
      const unitsMinutes = leaveType === "ANNUAL" ? employee.workMinutesPerDay : Math.round(employee.workMinutesPerDay / 2);
      const balance = adminLeaveBalance({ grantedMinutes, usedMinutes: source?.usedMinutes ?? 0, approvedMinutes, pendingMinutes, workMinutesPerDay: employee.workMinutesPerDay }, unitsMinutes);
      if (!balance.canRegister) throw new Error("LIMIT");
      const created = await tx.leaveRequest.create({ data: { employeeId, leaveDate, leaveType, unitsMinutes, status: "APPROVED", reviewedAt: now, reviewedByEmail: admin.email, reviewerNote: "대표이사 직접 등록", reason: null }, select: { id: true } });
      await tx.approvalAudit.create({ data: { employeeId, requestKind: "leave", requestId: created.id, action: "ADMIN_REGISTER", toStatus: "APPROVED", actorEmail: admin.email, actorName: admin.name, note: "대표이사 요청에 따른 직접 등록" } });
      await enqueueAbsenceStatusNotifications(tx, { kind: "leave", requestId: created.id,
        employeeName: employee.name, employeeEmail: employee.email, description: `${body.leaveDate} ${leaveType === "ANNUAL" ? "연차" : leaveType === "AM_HALF" ? "오전 반차" : "오후 반차"}`, status: "REGISTERED" });
      return { requestId: created.id, employeeName: employee.name, employeeCode: employee.code, leaveDate: body.leaveDate, leaveType, grantedDays: balance.grantedDays, usedDays: balance.usedDays, remainingDays: balance.remainingDays };
    });
    after(() => dispatchPendingHrNotifications(10).then(() => undefined).catch(() => undefined));
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const messages: Record<string, string> = { EMPLOYEE: "휴가 사용 가능한 직원을 찾을 수 없습니다.", PERIOD: "현재 연차기간 안의 날짜를 선택해 주세요.", DUPLICATE: "해당 날짜에 이미 신청 또는 승인된 휴가가 있습니다.", LIMIT: "잔여 연차 -12일 한도를 초과합니다." };
    if (messages[code]) return NextResponse.json({ error: messages[code] }, { status: code === "EMPLOYEE" ? 404 : 409 });
    throw error;
  }
}
