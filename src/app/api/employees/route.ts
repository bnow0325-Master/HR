import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 활성 직원 목록 (출퇴근 화면의 선택용)
export async function GET() {
  const employees = await prisma.employee.findMany({
    where: { active: true, attendanceEnabled: true },
    select: { id: true, code: true, name: true, department: true },
    orderBy: { code: "asc" },
  });
  return NextResponse.json({ employees });
}
