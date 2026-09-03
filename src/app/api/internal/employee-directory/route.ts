import { NextResponse } from "next/server";
import {
  employeeDirectoryApiConfigured,
  isEmployeeDirectoryRequestAuthorized,
} from "@/lib/internalApiAuth";
import {
  employeeDirectorySelect,
  presentEmployeeDirectoryRecord,
} from "@/lib/employeeDirectory";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Authorization",
  };
}

async function listContractEmployees(includeInactive: boolean) {
  return prisma.employee.findMany({
    where: includeInactive ? undefined : { active: true },
    select: employeeDirectorySelect,
    orderBy: { code: "asc" },
    take: 500,
  });
}

export async function GET(request: Request) {
  if (!employeeDirectoryApiConfigured()) {
    return NextResponse.json(
      { error: "직원명부 내부 연동이 설정되지 않았습니다." },
      { status: 503, headers: responseHeaders() },
    );
  }
  if (!isEmployeeDirectoryRequestAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "인증되지 않은 요청입니다." },
      { status: 401, headers: responseHeaders() },
    );
  }

  const includeInactive =
    new URL(request.url).searchParams.get("includeInactive") === "1";
  const employees = await listContractEmployees(includeInactive);
  return NextResponse.json(
    {
      employees: employees.map(presentEmployeeDirectoryRecord),
    },
    { headers: responseHeaders() },
  );
}
