import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  currentLeavePeriod,
  minutesToDays,
  startOfKstDate,
  statutoryAnnualLeaveDays,
} from "@/lib/annualLeave";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

type LeaveBody = {
  leaveType?: "ANNUAL" | "AM_HALF" | "PM_HALF";
  leaveDate?: string;
  reason?: string;
};

const leaveRequestSelect = {
  id: true,
  leaveType: true,
  leaveDate: true,
  unitsMinutes: true,
  reason: true,
  status: true,
  reviewerNote: true,
  reviewedAt: true,
  createdAt: true,
} as const;

async function getEmployee(employeeId: string) {
  return prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      code: true,
      name: true,
      department: true,
      position: true,
      hireDate: true,
      workMinutesPerDay: true,
      leaveEnabled: true,
      active: true,
    },
  });
}

async function buildSummary(employeeId: string) {
  const employee = await getEmployee(employeeId);
  if (!employee || !employee.active || !employee.leaveEnabled) {
    return { error: "직원을 찾을 수 없습니다.", status: 404 } as const;
  }
  if (!employee.hireDate) {
    return {
      error: "직원정보에 입사일을 먼저 등록해 주세요.",
      status: 422,
    } as const;
  }

  const asOf = new Date();
  const period = currentLeavePeriod(employee.hireDate, asOf);
  const requests = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      leaveDate: { gte: period.start, lt: period.end },
    },
    select: leaveRequestSelect,
    orderBy: [{ leaveDate: "desc" }, { createdAt: "desc" }],
  });

  const grantedDays = statutoryAnnualLeaveDays(employee.hireDate, asOf);
  const approvedMinutes = requests
    .filter((request) => request.status === "APPROVED")
    .reduce((sum, request) => sum + request.unitsMinutes, 0);
  const pendingMinutes = requests
    .filter((request) => request.status === "PENDING")
    .reduce((sum, request) => sum + request.unitsMinutes, 0);
  const grantedMinutes = grantedDays * employee.workMinutesPerDay;

  return {
    employee,
    requests,
    summary: {
      grantedDays,
      usedDays: minutesToDays(
        approvedMinutes,
        employee.workMinutesPerDay,
      ),
      pendingDays: minutesToDays(
        pendingMinutes,
        employee.workMinutesPerDay,
      ),
      remainingDays: minutesToDays(
        Math.max(0, grantedMinutes - approvedMinutes - pendingMinutes),
        employee.workMinutesPerDay,
      ),
      periodStart: period.start,
      periodEnd: period.end,
    },
  };
}

export async function GET(req: Request) {
  void req;
  const authenticatedEmployee = await getCurrentWorkboardEmployee("leave");
  if (!authenticatedEmployee) {
    return NextResponse.json(
      { error: "워크보드 로그인 또는 휴가 사용 권한이 필요합니다." },
      { status: 401 },
    );
  }

  const result = await buildSummary(authenticatedEmployee.id);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  let body: LeaveBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const authenticatedEmployee = await getCurrentWorkboardEmployee("leave");
  if (!authenticatedEmployee) {
    return NextResponse.json(
      { error: "워크보드 로그인 또는 휴가 사용 권한이 필요합니다." },
      { status: 401 },
    );
  }

  const employeeId = authenticatedEmployee.id;
  const { leaveType } = body;
  const leaveDate = startOfKstDate(body.leaveDate ?? "");
  if (
    !leaveDate ||
    !leaveType ||
    !["ANNUAL", "AM_HALF", "PM_HALF"].includes(leaveType)
  ) {
    return NextResponse.json(
      { error: "휴가 종류와 날짜를 확인해 주세요." },
      { status: 400 },
    );
  }

  const current = await buildSummary(employeeId);
  if ("error" in current) {
    return NextResponse.json(
      { error: current.error },
      { status: current.status },
    );
  }

  const periodStart = new Date(current.summary.periodStart);
  const periodEnd = new Date(current.summary.periodEnd);
  if (leaveDate < periodStart || leaveDate >= periodEnd) {
    return NextResponse.json(
      { error: "현재 연차기간 안의 날짜를 선택해 주세요." },
      { status: 400 },
    );
  }

  const unitsMinutes =
    leaveType === "ANNUAL"
      ? current.employee.workMinutesPerDay
      : Math.round(current.employee.workMinutesPerDay / 2);
  const remainingMinutes =
    Math.round(
      current.summary.remainingDays * current.employee.workMinutesPerDay,
    );
  if (unitsMinutes > remainingMinutes) {
    return NextResponse.json(
      { error: "사용 가능한 연차가 부족합니다." },
      { status: 409 },
    );
  }

  const nextDay = new Date(leaveDate.getTime() + 24 * 60 * 60 * 1000);
  const duplicate = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      leaveDate: { gte: leaveDate, lt: nextDay },
      status: { in: ["PENDING", "APPROVED"] },
    },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "해당 날짜에 이미 신청한 휴가가 있습니다." },
      { status: 409 },
    );
  }

  const request = await prisma.leaveRequest.create({
    data: {
      employeeId,
      leaveType,
      leaveDate,
      unitsMinutes,
      reason: body.reason?.trim() || null,
    },
    select: leaveRequestSelect,
  });

  return NextResponse.json({ ok: true, request }, { status: 201 });
}
