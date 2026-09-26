import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";
import { notifyEmployeeAboutApprovalDecision } from "@/lib/workboardApprovalNotifications";

type ApprovalKind = "leave" | "business-trip";
type ApprovalBody = {
  kind?: ApprovalKind;
  requestId?: string;
  action?: "APPROVE" | "REJECT";
  reviewerNote?: string;
};

const employeeSelect = {
  id: true,
  code: true,
  name: true,
  department: true,
  position: true,
  workMinutesPerDay: true,
} as const;

async function currentAdmin() {
  const employee = await getCurrentWorkboardEmployee("any");
  return employee?.systemRole === "ADMIN" ? employee : null;
}

export async function GET() {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const [leaveRequests, businessTrips] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      include: { employee: { select: employeeSelect } },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    prisma.businessTrip.findMany({
      where: { status: "PENDING" },
      include: { employee: { select: employeeSelect } },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
  ]);

  return NextResponse.json(
    { leaveRequests, businessTrips },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function PATCH(request: Request) {
  let body: ApprovalBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const admin = await currentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  if (
    !body.requestId || !body.kind || !body.action ||
    !["leave", "business-trip"].includes(body.kind) ||
    !["APPROVE", "REJECT"].includes(body.action)
  ) {
    return NextResponse.json({ error: "결재 정보를 확인해 주세요." }, { status: 400 });
  }
  const requestId = body.requestId;
  const kind = body.kind;
  const action = body.action;

  const reviewerNote = body.reviewerNote?.trim().slice(0, 1000) ?? "";
  if (!reviewerNote) {
    return NextResponse.json(
      { error: action === "APPROVE" ? "승인 사유를 입력해 주세요." : "반려 사유를 입력해 주세요." },
      { status: 400 },
    );
  }

  const decision: "APPROVED" | "REJECTED" = action === "APPROVE" ? "APPROVED" : "REJECTED";
  const reviewedAt = new Date();

  const notification = await prisma.$transaction(async (tx) => {
    if (kind === "leave") {
      const leave = await tx.leaveRequest.findFirst({
        where: { id: requestId, status: "PENDING" },
        include: { employee: { select: { id: true, name: true, code: true, email: true } } },
      });
      if (!leave) return null;

      const updated = await tx.leaveRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: { status: decision, reviewerNote, reviewedAt, reviewedByEmail: admin.email },
      });
      if (updated.count !== 1) return null;
      await tx.approvalAudit.create({
        data: {
          employeeId: leave.employee.id,
          requestKind: "leave",
          requestId: leave.id,
          action,
          fromStatus: "PENDING",
          toStatus: decision,
          actorEmail: admin.email,
          actorName: admin.name,
          note: reviewerNote,
        },
      });
      const leaveLabel = leave.leaveType === "ANNUAL" ? "연차" : leave.leaveType === "AM_HALF" ? "오전 반차" : "오후 반차";
      return {
        kind: "leave" as const,
        requestId: leave.id,
        employeeName: leave.employee.name,
        employeeCode: leave.employee.code,
        employeeEmail: leave.employee.email,
        description: `${leave.leaveDate.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} ${leaveLabel}`,
      };
    }

    const trip = await tx.businessTrip.findFirst({
      where: { id: requestId, status: "PENDING" },
      include: { employee: { select: { id: true, name: true, code: true, email: true } } },
    });
    if (!trip) return null;
    if (action === "APPROVE") {
      const overlap = await tx.businessTrip.findFirst({
        where: {
          employeeId: trip.employeeId,
          status: "APPROVED",
          startDate: { lte: trip.endDate },
          endDate: { gte: trip.startDate },
        },
        select: { id: true },
      });
      if (overlap) throw new Error("APPROVED_TRIP_OVERLAP");
    }

    const updated = await tx.businessTrip.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: decision, reviewerNote, reviewedAt, reviewedByEmail: admin.email },
    });
    if (updated.count !== 1) return null;
    await tx.approvalAudit.create({
      data: {
        employeeId: trip.employee.id,
        requestKind: "business-trip",
        requestId: trip.id,
        action,
        fromStatus: "PENDING",
        toStatus: decision,
        actorEmail: admin.email,
        actorName: admin.name,
        note: reviewerNote,
      },
    });
    return {
      kind: "business-trip" as const,
      requestId: trip.id,
      employeeName: trip.employee.name,
      employeeCode: trip.employee.code,
      employeeEmail: trip.employee.email,
      description: `${trip.startDate.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} ~ ${trip.endDate.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}`,
    };
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "APPROVED_TRIP_OVERLAP") return "overlap" as const;
    throw error;
  });

  if (notification === "overlap") {
    return NextResponse.json({ error: "확정된 출장 일정과 기간이 겹쳐 승인할 수 없습니다." }, { status: 409 });
  }
  if (!notification) {
    return NextResponse.json({ error: "이미 처리되었거나 찾을 수 없는 신청입니다." }, { status: 409 });
  }

  await notifyEmployeeAboutApprovalDecision({ ...notification, decision, reviewerNote });
  return NextResponse.json({ ok: true });
}
