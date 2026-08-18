import { NextResponse } from "next/server";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

export async function GET() {
  const employee = await getCurrentWorkboardEmployee();
  return employee
    ? NextResponse.json({ employee })
    : NextResponse.json({ error: "사내 로그인이 필요합니다." }, { status: 401 });
}
