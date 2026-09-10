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

  const [leaveCount, businessTripCount] = await Promise.all([
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.businessTrip.count({ where: { status: "PENDING" } }),
  ]);

  return NextResponse.json(
    {
      pendingCount: leaveCount + businessTripCount,
      leaveCount,
      businessTripCount,
      approvalUrl: "/admin/approvals",
    },
    { headers: responseHeaders() },
  );
}
