import { NextResponse } from "next/server";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

export async function GET() {
  const employee = await getCurrentWorkboardEmployee();
  if (!employee) {
    return NextResponse.json(
      { error: "워크보드 로그인이 필요합니다." },
      { status: 401 },
    );
  }

  return NextResponse.json({ employee });
}
