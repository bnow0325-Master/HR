import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfKstDate } from "@/lib/annualLeave";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

type BusinessTripBody = {
  startDate?: string;
  endDate?: string;
  reason?: string;
};

const businessTripSelect = {
  id: true,
  employeeId: true,
  startDate: true,
  endDate: true,
  reason: true,
  status: true,
  createdAt: true,
} as const;

const employeeSelect = {
  id: true,
  code: true,
  name: true,
  department: true,
  position: true,
  leaveEnabled: true,
  active: true,
} as const;

export async function GET(req: Request) {
  void req;
  const authenticatedEmployee = await getCurrentWorkboardEmployee("leave");
  if (!authenticatedEmployee) {
    return NextResponse.json(
      { error: "워크보드 로그인 또는 출장 사용 권한이 필요합니다." },
      { status: 401 },
    );
  }
  const employeeId = authenticatedEmployee.id;

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: employeeSelect,
  });
  if (!employee || !employee.active || !employee.leaveEnabled) {
    return NextResponse.json(
      { error: "직원을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const trips = await prisma.businessTrip.findMany({
    where: { employeeId },
    select: businessTripSelect,
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ employee, trips });
}

export async function POST(req: Request) {
  let body: BusinessTripBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const authenticatedEmployee = await getCurrentWorkboardEmployee("leave");
  if (!authenticatedEmployee) {
    return NextResponse.json(
      { error: "워크보드 로그인 또는 출장 사용 권한이 필요합니다." },
      { status: 401 },
    );
  }
  const employeeId = authenticatedEmployee.id;
  const startDate = startOfKstDate(body.startDate ?? "");
  const endDate = startOfKstDate(body.endDate ?? "");
  const reason = body.reason?.trim() ?? "";

  if (!startDate || !endDate || !reason) {
    return NextResponse.json(
      { error: "출장 시작일, 종료일과 출장 사유를 입력해 주세요." },
      { status: 400 },
    );
  }
  if (reason.length > 1000) {
    return NextResponse.json(
      { error: "출장 사유는 1,000자 이내로 입력해 주세요." },
      { status: 400 },
    );
  }
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "종료일은 시작일보다 빠를 수 없습니다." },
      { status: 400 },
    );
  }

  const tripDays =
    Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  if (tripDays > 365) {
    return NextResponse.json(
      { error: "출장 기간은 최대 365일까지 등록할 수 있습니다." },
      { status: 400 },
    );
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, active: true, leaveEnabled: true },
  });
  if (!employee || !employee.active || !employee.leaveEnabled) {
    return NextResponse.json(
      { error: "직원을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const overlap = await prisma.businessTrip.findFirst({
    where: {
      employeeId,
      status: "REGISTERED",
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true },
  });
  if (overlap) {
    return NextResponse.json(
      { error: "선택한 기간과 겹치는 출장일지가 이미 있습니다." },
      { status: 409 },
    );
  }

  const trip = await prisma.businessTrip.create({
    data: {
      employeeId,
      startDate,
      endDate,
      reason,
    },
    select: businessTripSelect,
  });

  return NextResponse.json({ ok: true, trip }, { status: 201 });
}
