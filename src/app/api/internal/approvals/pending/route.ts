import { NextResponse } from "next/server";
import {
  employeeDirectoryApiConfigured,
  isEmployeeDirectoryRequestAuthorized,
} from "@/lib/internalApiAuth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Authorization",
  };
}

export async function GET(request: Request) {
  if (!employeeDirectoryApiConfigured()) {
    return NextResponse.json(
      { error: "인사관리 내부 연동이 설정되지 않았습니다." },
      { status: 503, headers: responseHeaders() },
    );
  }
  if (!isEmployeeDirectoryRequestAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "인증되지 않은 요청입니다." },
      { status: 401, headers: responseHeaders() },
    );
  }

  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
  const employee = email
    ? await prisma.employee.findUnique({
        where: { email },
        select: { id: true, active: true, workboardEnabled: true },
      })
    : null;
  const employeeId = employee?.active && employee.workboardEnabled ? employee.id : null;
  const representativeEmail = process.env.APPROVAL_CEO_EMAIL?.trim().toLowerCase() || "elon.choo@bnow.co.kr";
  const isCeo = Boolean(employeeId) && email === representativeEmail;

  const [generalCount, submittedGeneralCount, leaveCount, businessTripCount, submittedLeaveCount, submittedBusinessTripCount] = await Promise.all([
    prisma.approvalDocument.count({
      where: { status: "PENDING", approverEmail: representativeEmail },
    }),
    employeeId
      ? prisma.approvalDocument.count({ where: { requesterId: employeeId, status: "PENDING" } })
      : Promise.resolve(0),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.businessTrip.count({ where: { status: "PENDING" } }),
    employeeId
      ? prisma.leaveRequest.count({ where: { employeeId, status: "PENDING" } })
      : Promise.resolve(0),
    employeeId
      ? prisma.businessTrip.count({ where: { employeeId, status: "PENDING" } })
      : Promise.resolve(0),
  ]);

  return NextResponse.json(
    {
      mode: isCeo ? "review" : "submitted",
      pendingCount: isCeo ? generalCount : submittedGeneralCount,
      generalCount,
      leaveCount,
      businessTripCount,
      submittedPendingCount: submittedGeneralCount,
      submittedGeneralCount,
      submittedLeaveCount,
      submittedBusinessTripCount,
      approvalUrl: "/approvals/",
    },
    { headers: responseHeaders() },
  );
}
