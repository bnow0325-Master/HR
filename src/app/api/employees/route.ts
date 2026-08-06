import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 활성 직원 목록 (출퇴근 화면의 선택용)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId")?.trim();
  const email = searchParams.get("email")?.trim();
  const name = searchParams.get("name")?.trim();

  const identityFilter = employeeId
    ? { id: employeeId }
    : email
      ? { email: { equals: email, mode: "insensitive" as const } }
      : name
        ? { name }
        : {};

  const employees = await prisma.employee.findMany({
    where: {
      active: true,
      attendanceEnabled: true,
      ...identityFilter,
    },
    select: { id: true, code: true, name: true, department: true },
    orderBy: { code: "asc" },
  });
  return NextResponse.json({ employees });
}
