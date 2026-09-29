import { NextResponse } from "next/server";
import {
  employeeDirectoryApiConfigured,
  isEmployeeDirectoryRequestAuthorized,
} from "@/lib/internalApiAuth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

function representativeEmail() {
  return (process.env.APPROVAL_CEO_EMAIL?.trim() || "elon.choo@bnow.co.kr").toLowerCase();
}

function dateValue(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function leaveTypeLabel(value: string) {
  if (value === "ANNUAL") return "연차";
  if (value === "AM_HALF") return "오전 반차";
  if (value === "PM_HALF") return "오후 반차";
  return value;
}

export async function GET(request: Request) {
  if (!employeeDirectoryApiConfigured()) {
    return NextResponse.json(
      { error: "결재 내부 연동이 설정되지 않았습니다." },
      { status: 503, headers: noStoreHeaders },
    );
  }
  if (!isEmployeeDirectoryRequestAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "인증되지 않은 요청입니다." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const email = representativeEmail();
  const representative = await prisma.employee.findFirst({
    where: { email, active: true, workboardEnabled: true },
    select: { name: true, email: true },
  });
  if (!representative?.email) {
    return NextResponse.json(
      { error: "대표이사 결재 계정이 준비되지 않았습니다." },
      { status: 503, headers: noStoreHeaders },
    );
  }

  const generalWhere = { status: "PENDING", approverEmail: representative.email };
  const [generalCount, leaveCount, businessTripCount, generalDocuments, leaveRequests, businessTrips] = await Promise.all([
    prisma.approvalDocument.count({ where: generalWhere }),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.businessTrip.count({ where: { status: "PENDING" } }),
    prisma.approvalDocument.findMany({
      where: generalWhere,
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      take: 10,
      select: {
        id: true,
        documentNo: true,
        title: true,
        templateName: true,
        requesterName: true,
        requesterDepartment: true,
        submittedAt: true,
      },
    }),
    prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      include: { employee: { select: { name: true, department: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 10,
    }),
    prisma.businessTrip.findMany({
      where: { status: "PENDING" },
      include: { employee: { select: { name: true, department: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 10,
    }),
  ]);
  const pendingCount = generalCount + leaveCount + businessTripCount;
  const documents = [
    ...generalDocuments,
    ...leaveRequests.map((request) => ({
      id: `leave:${request.id}`,
      documentNo: `LV-${request.id.slice(-8).toUpperCase()}`,
      title: `${leaveTypeLabel(request.leaveType)} · ${dateValue(request.leaveDate)}`,
      templateName: "휴가 신청",
      requesterName: request.employee.name,
      requesterDepartment: request.employee.department,
      submittedAt: request.createdAt,
    })),
    ...businessTrips.map((trip) => ({
      id: `business-trip:${trip.id}`,
      documentNo: `BT-${trip.id.slice(-8).toUpperCase()}`,
      title: `출장 · ${dateValue(trip.startDate)} ~ ${dateValue(trip.endDate)}`,
      templateName: "출장 신청",
      requesterName: trip.employee.name,
      requesterDepartment: trip.employee.department,
      submittedAt: trip.createdAt,
    })),
  ]
    .sort((left, right) => left.submittedAt.getTime() - right.submittedAt.getTime())
    .slice(0, 10);

  return NextResponse.json(
    {
      recipient: { name: representative.name, email: representative.email },
      pendingCount,
      documents,
      approvalUrl: "/approvals/",
    },
    { headers: noStoreHeaders },
  );
}
