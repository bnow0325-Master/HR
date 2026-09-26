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

  const where = { status: "PENDING", approverEmail: representative.email };
  const [pendingCount, documents] = await Promise.all([
    prisma.approvalDocument.count({ where }),
    prisma.approvalDocument.findMany({
      where,
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
  ]);

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
