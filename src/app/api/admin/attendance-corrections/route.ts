import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";
import { correctionConflict, kstDayRange } from "@/lib/attendanceCorrection";
import { notifyEmployeeAboutApprovalDecision } from "@/lib/workboardApprovalNotifications";

async function currentCeo() {
  const employee = await getCurrentWorkboardEmployee("any");
  const email = process.env.APPROVAL_CEO_EMAIL?.trim().toLowerCase() || "elon.choo@bnow.co.kr";
  return employee?.systemRole === "ADMIN" && employee.email?.toLowerCase() === email ? employee : null;
}

export async function GET() {
  if (!(await currentCeo())) return NextResponse.json({ error: "대표이사 권한이 필요합니다." }, { status: 403 });
  const requests = await prisma.attendanceCorrectionRequest.findMany({
    where: { status: "PENDING" },
    include: { employee: { select: { code: true, name: true, department: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return NextResponse.json({ requests }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: Request) {
  const ceo = await currentCeo();
  if (!ceo) return NextResponse.json({ error: "대표이사 권한이 필요합니다." }, { status: 403 });
  let body: { requestId?: string; action?: string; reviewerNote?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const note = body.reviewerNote?.trim() ?? "";
  if (!body.requestId || !["APPROVE", "REJECT"].includes(body.action ?? "") || !note || note.length > 1000) {
    return NextResponse.json({ error: "처리 결과와 사유를 입력해 주세요." }, { status: 400 });
  }
  const decision = body.action === "APPROVE" ? "APPROVED" : "REJECTED";
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.attendanceCorrectionRequest.findFirst({
      where: { id: body.requestId, status: "PENDING" },
    });
    if (!request) return "MISSING";
    if (decision === "APPROVED") {
      const date = request.workDate.toISOString().slice(0, 10);
      const range = kstDayRange(date);
      if (!range) return "INVALID_DATE";
      const [existing, imported] = await Promise.all([
        tx.attendanceRecord.findMany({
          where: { employeeId: request.employeeId, cancelledAt: null, timestamp: { gte: range.start, lt: range.end } },
          select: { type: true, timestamp: true },
        }),
        tx.naverWorksDailyRecord.findUnique({
          where: { employeeId_baseDate: { employeeId: request.employeeId, baseDate: request.workDate } },
          select: { checkInAt: true, checkOutAt: true },
        }),
      ]);
      const sourceRecords = [
        ...existing,
        ...(imported?.checkInAt ? [{ type: "IN", timestamp: imported.checkInAt }] : []),
        ...(imported?.checkOutAt ? [{ type: "OUT", timestamp: imported.checkOutAt }] : []),
      ];
      if (correctionConflict(sourceRecords, request.checkInAt, request.checkOutAt)) return "CONFLICT";
      for (const [type, timestamp] of [["IN", request.checkInAt], ["OUT", request.checkOutAt]] as const) {
        if (!timestamp) continue;
        await tx.attendanceRecord.create({
          data: {
            employeeId: request.employeeId, type, timestamp,
            method: "CEO_APPROVED_RETROACTIVE", verified: false,
            note: `attendance-correction:${request.id}; approved-by:${ceo.email}`,
          },
        });
      }
    }
    const updated = await tx.attendanceCorrectionRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: decision, pendingWorkDate: null, reviewerNote: note, reviewedAt: new Date(), reviewedByEmail: ceo.email },
    });
    if (updated.count !== 1) throw new Error("CONCURRENT_DECISION");
    await tx.approvalAudit.create({
      data: { employeeId: request.employeeId, requestKind: "attendance-correction", requestId: request.id,
        action: body.action!, fromStatus: "PENDING", toStatus: decision,
        actorEmail: ceo.email, actorName: ceo.name, note },
    });
    const employee = await tx.employee.findUnique({ where: { id: request.employeeId }, select: { name: true, code: true, email: true } });
    return employee ? { employee, request } : "OK";
  }).catch((error: unknown) => error instanceof Error && error.message === "CONCURRENT_DECISION" ? "CONFLICT" : Promise.reject(error));
  if (typeof result === "string" && result !== "OK") return NextResponse.json({ error: result === "MISSING" ? "이미 처리된 신청입니다." : "기존 기록과 충돌해 승인할 수 없습니다." }, { status: 409 });
  if (typeof result !== "string") {
    await notifyEmployeeAboutApprovalDecision({
      kind: "attendance-correction", requestId: result.request.id,
      employeeName: result.employee.name, employeeCode: result.employee.code,
      employeeEmail: result.employee.email, description: `${result.request.workDate.toISOString().slice(0, 10)} 출퇴근 사후 등록`,
      decision, reviewerNote: note,
    });
  }
  return NextResponse.json({ ok: true });
}
