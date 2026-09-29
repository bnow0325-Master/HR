import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  currentLeavePeriod,
  minutesToDays,
  startOfKstDate,
  statutoryAnnualLeaveDays,
} from "@/lib/annualLeave";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";
import { notifyAdminsAboutApprovalRequest } from "@/lib/workboardApprovalNotifications";

type LeaveBody = {
  leaveType?: "ANNUAL" | "AM_HALF" | "PM_HALF";
  leaveDate?: string;
  reason?: string;
};

function naverWorksLeaveCutoverDate() {
  return startOfKstDate(
    process.env.NAVER_WORKS_LEAVE_CUTOVER_DATE ?? "",
  );
}

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

function toSourceBalanceDays(
  balance: {
    sourceYear: number;
    cycleStart: Date;
    cycleEnd: Date;
    sourceAsOf: Date;
    importedAt: Date;
    annualGrantedMinutes: number;
    firstYearGrantedMinutes: number;
    firstYearCarryoverMinutes: number;
    carryoverMinutes: number;
    adjustedMinutes: number;
    usedMinutes: number;
    remainingMinutes: number;
  },
  workMinutesPerDay: number,
) {
  return {
    provider: "NAVER_WORKS" as const,
    sourceYear: balance.sourceYear,
    cycleStart: balance.cycleStart,
    cycleEnd: balance.cycleEnd,
    sourceAsOf: balance.sourceAsOf,
    importedAt: balance.importedAt,
    annualGrantedDays: minutesToDays(
      balance.annualGrantedMinutes,
      workMinutesPerDay,
    ),
    firstYearGrantedDays: minutesToDays(
      balance.firstYearGrantedMinutes,
      workMinutesPerDay,
    ),
    firstYearCarryoverDays: minutesToDays(
      balance.firstYearCarryoverMinutes,
      workMinutesPerDay,
    ),
    carryoverDays: minutesToDays(
      balance.carryoverMinutes,
      workMinutesPerDay,
    ),
    adjustedDays: minutesToDays(
      balance.adjustedMinutes,
      workMinutesPerDay,
    ),
    usedDays: minutesToDays(balance.usedMinutes, workMinutesPerDay),
    remainingDays: minutesToDays(
      balance.remainingMinutes,
      workMinutesPerDay,
    ),
  };
}

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
  const [requests, sourceBalance, sourceLedgerHistory, sourceHistory] = await prisma.$transaction([
    prisma.leaveRequest.findMany({
      where: {
        employeeId,
        leaveDate: { gte: period.start, lt: period.end },
      },
      select: leaveRequestSelect,
      orderBy: [{ leaveDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.naverWorksAnnualLeaveBalance.findFirst({
      where: {
        employeeId,
        cycleStart: { lte: asOf },
        cycleEnd: { gte: asOf },
      },
      orderBy: [{ sourceAsOf: "desc" }, { importedAt: "desc" }],
    }),
    prisma.naverWorksAnnualLeaveBalance.findMany({
      where: { employeeId },
      orderBy: [{ sourceYear: "desc" }, { cycleStart: "desc" }],
    }),
    prisma.naverWorksAbsenceRecord.findMany({
      where: {
        employeeId,
        absenceType: { contains: "연차" },
        requestedOn: { gte: period.start, lt: period.end },
      },
      select: {
        id: true,
        absenceType: true,
        unitsMinutes: true,
        periodText: true,
        requestedOn: true,
        status: true,
      },
      orderBy: [{ requestedOn: "desc" }, { importedAt: "desc" }],
    }),
  ]);

  const cutoverDate = naverWorksLeaveCutoverDate();
  // Until the HR cutover, NAVER WORKS remains the source of truth. Ignoring
  // earlier HR test requests prevents their approved days being deducted twice.
  const isPostCutoverRequest = (request: { createdAt: Date }) =>
    !sourceBalance || !cutoverDate || request.createdAt >= cutoverDate;
  const approvedMinutes = requests
    .filter((request) => request.status === "APPROVED" && isPostCutoverRequest(request))
    .reduce((sum, request) => sum + request.unitsMinutes, 0);
  const pendingMinutes = requests
    .filter((request) => request.status === "PENDING" && isPostCutoverRequest(request))
    .reduce((sum, request) => sum + request.unitsMinutes, 0);
  const statutoryGrantedDays = statutoryAnnualLeaveDays(employee.hireDate, asOf);
  const sourceGrantedMinutes = sourceBalance
    ? sourceBalance.annualGrantedMinutes
      + sourceBalance.firstYearGrantedMinutes
      + sourceBalance.firstYearCarryoverMinutes
      + sourceBalance.carryoverMinutes
      + sourceBalance.adjustedMinutes
    : null;
  const grantedMinutes = sourceGrantedMinutes ?? statutoryGrantedDays * employee.workMinutesPerDay;
  const sourceRemainingMinutes = sourceBalance?.remainingMinutes ?? grantedMinutes - approvedMinutes;

  return {
    employee,
    requests,
    summary: {
      grantedDays: minutesToDays(grantedMinutes, employee.workMinutesPerDay),
      usedDays: minutesToDays(
        (sourceBalance?.usedMinutes ?? 0) + approvedMinutes,
        employee.workMinutesPerDay,
      ),
      pendingDays: minutesToDays(
        pendingMinutes,
        employee.workMinutesPerDay,
      ),
      remainingDays: minutesToDays(
        sourceRemainingMinutes - approvedMinutes - pendingMinutes,
        employee.workMinutesPerDay,
      ),
      periodStart: period.start,
      periodEnd: period.end,
    },
    sourceBalance: sourceBalance && toSourceBalanceDays(
      sourceBalance,
      employee.workMinutesPerDay,
    ),
    sourceLedgerHistory: sourceLedgerHistory.map((balance) =>
      toSourceBalanceDays(balance, employee.workMinutesPerDay),
    ),
    naverWorksHistory: sourceHistory,
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

  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.leaveRequest.create({
      data: {
        employeeId,
        leaveType,
        leaveDate,
        unitsMinutes,
        reason: body.reason?.trim() || null,
      },
      select: leaveRequestSelect,
    });
    await tx.approvalAudit.create({
      data: {
        employeeId,
        requestKind: "leave",
        requestId: created.id,
        action: "SUBMIT",
        toStatus: "PENDING",
        actorEmail: authenticatedEmployee.email,
        actorName: authenticatedEmployee.name,
        note: body.reason?.trim() || null,
      },
    });
    return created;
  });

  // The request remains valid even if chat delivery is temporarily unavailable.
  await notifyAdminsAboutApprovalRequest({
    kind: "leave",
    requestId: request.id,
    employeeName: current.employee.name,
    employeeCode: current.employee.code,
    description: `${leaveDate.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} ${leaveType === "ANNUAL" ? "연차" : leaveType === "AM_HALF" ? "오전 반차" : "오후 반차"}`,
  });

  return NextResponse.json({ ok: true, request }, { status: 201 });
}
