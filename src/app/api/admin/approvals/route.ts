import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

type ApprovalBody = {
  kind?: "leave" | "business-trip";
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

  return NextResponse.json({ leaveRequests, businessTrips });
}

export async function PATCH(req: Request) {
  let body: ApprovalBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const admin = await currentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  if (
    !body.requestId ||
    !body.kind ||
    !body.action ||
    !["leave", "business-trip"].includes(body.kind) ||
    !["APPROVE", "REJECT"].includes(body.action)
  ) {
    return NextResponse.json({ error: "결재 정보를 확인해 주세요." }, { status: 400 });
  }

  const reviewerNote = body.reviewerNote?.trim().slice(0, 1000) || null;
  const reviewData = {
    status: body.action === "APPROVE" ? "APPROVED" : "REJECTED",
    reviewerNote,
    reviewedAt: new Date(),
    reviewedByEmail: admin.email,
  };

  if (body.kind === "leave") {
    const updated = await prisma.leaveRequest.updateMany({
      where: { id: body.requestId, status: "PENDING" },
      data: reviewData,
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { error: "이미 처리되었거나 찾을 수 없는 휴가 신청입니다." },
        { status: 409 },
      );
    }
  } else {
    const trip = await prisma.businessTrip.findFirst({
      where: { id: body.requestId, status: "PENDING" },
      select: { employeeId: true, startDate: true, endDate: true },
    });
    if (!trip) {
      return NextResponse.json(
        { error: "이미 처리되었거나 찾을 수 없는 출장 신청입니다." },
        { status: 409 },
      );
    }
    if (body.action === "APPROVE") {
      const overlap = await prisma.businessTrip.findFirst({
        where: {
          employeeId: trip.employeeId,
          status: "APPROVED",
          startDate: { lte: trip.endDate },
          endDate: { gte: trip.startDate },
        },
        select: { id: true },
      });
      if (overlap) {
        return NextResponse.json(
          { error: "확정된 출장 일정과 기간이 겹쳐 승인할 수 없습니다." },
          { status: 409 },
        );
      }
    }
    const updated = await prisma.businessTrip.updateMany({
      where: { id: body.requestId, status: "PENDING" },
      data: reviewData,
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { error: "출장 신청 상태가 변경되어 다시 확인해 주세요." },
        { status: 409 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
