import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "./LogoutButton";
import { isAdmin } from "@/lib/adminAuth";
import {
  currentLeavePeriod,
  minutesToDays,
  startOfKstDate,
  statutoryAnnualLeaveDays,
} from "@/lib/annualLeave";
import { prisma } from "@/lib/prisma";
import {
  aggregate,
  formatMinutes,
  periodRange,
  type Period,
} from "@/lib/stats";

export const dynamic = "force-dynamic";

const TABS: { key: Period; label: string }[] = [
  { key: "today", label: "오늘" },
  { key: "week", label: "주간" },
  { key: "month", label: "월간" },
  { key: "year", label: "연간" },
];

const LEAVE_HISTORY_PAGE_SIZE = 10;

type EmployeeMonitorRow = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  position: string | null;
  attendance: {
    label: string;
    tone: string;
    checkIn: Date | null;
    checkOut: Date | null;
  };
  leave: {
    grantedDays: number;
    usedDays: number;
    pendingDays: number;
    remainingDays: number;
  } | null;
  trip: {
    label: string;
    detail: string;
    tone: string;
  };
};

type AttendanceRow = {
  id: string;
  employeeId: string;
  type: string;
  timestamp: Date;
  verified: boolean;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  employee: { name: string; code: string; department: string | null };
};

type LeaveTableRow = {
  id: string;
  source: "HR" | "NAVER_WORKS";
  leaveType: string;
  periodText: string;
  searchDate: Date;
  unitsMinutes: number;
  reason: string | null;
  status: string;
  sourceDocumentNo: string | null;
  employee: {
    name: string;
    code: string;
    department: string | null;
    workMinutesPerDay: number;
  };
};

type TripTableRow = {
  id: string;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: string;
  createdAt: Date;
  employee: { name: string; code: string; department: string | null };
};

function fmtTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function fmtDays(days: number) {
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}

function fmtCoordinate(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toFixed(6);
}

function fmtAddress(value: string | null | undefined) {
  return value?.trim() || "주소 없음";
}

function calendarDateInKst(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()),
  );
}

function leaveTypeLabel(type: string) {
  if (type === "AM_HALF") return "오전 반차";
  if (type === "PM_HALF") return "오후 반차";
  return "연차";
}

function leaveStatus(status: string) {
  if (status === "APPROVED") {
    return { label: "승인", tone: "bg-emerald-50 text-emerald-700" };
  }
  if (status === "CHANGE_REQUESTED") {
    return { label: "변경 요청", tone: "bg-amber-50 text-amber-700" };
  }
  if (status === "CANCELLED") {
    return { label: "취소", tone: "bg-slate-100 text-slate-500" };
  }
  if (status === "REJECTED") {
    return { label: "반려", tone: "bg-rose-50 text-rose-700" };
  }
  return { label: "신청 중", tone: "bg-blue-50 text-blue-700" };
}

function tripStatus(status: string, startDate: Date, endDate: Date, today: Date) {
  if (status === "PENDING") {
    return { label: "승인 대기", tone: "bg-amber-50 text-amber-700" };
  }
  if (status === "REJECTED") {
    return { label: "반려", tone: "bg-rose-50 text-rose-700" };
  }
  if (status === "CANCELLED") {
    return { label: "취소", tone: "bg-slate-100 text-slate-500" };
  }
  if (startDate <= today && endDate >= today) {
    return { label: "출장 중", tone: "bg-emerald-50 text-emerald-700" };
  }
  if (startDate > today) {
    return { label: "예정", tone: "bg-blue-50 text-blue-700" };
  }
  return { label: "완료", tone: "bg-slate-100 text-slate-500" };
}

function tripDays(startDate: Date, endDate: Date) {
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
}

function naverWorksLeaveCutoverDate() {
  return startOfKstDate(
    process.env.NAVER_WORKS_LEAVE_CUTOVER_DATE ?? "",
  );
}

function dateParam(value: string | undefined, fallback: Date) {
  return startOfKstDate(value ?? "") ?? fallback;
}

function dateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function leaveHistoryHref({
  period,
  leaveStart,
  leaveEnd,
  leavePage,
}: {
  period: Period;
  leaveStart: Date;
  leaveEnd: Date;
  leavePage: number;
}) {
  const query = new URLSearchParams({
    period,
    leaveStart: dateInputValue(leaveStart),
    leaveEnd: dateInputValue(leaveEnd),
    leavePage: String(leavePage),
  });
  return `/admin?${query.toString()}`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    leaveStart?: string;
    leaveEnd?: string;
    leavePage?: string;
  }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");

  const {
    period: periodParam,
    leaveStart: leaveStartParam,
    leaveEnd: leaveEndParam,
    leavePage: leavePageParam,
  } = await searchParams;
  const period: Period = TABS.some((tab) => tab.key === periodParam)
    ? (periodParam as Period)
    : "today";
  const now = new Date();
  const { start, end, label } = periodRange(period, now);
  const todayStart = periodRange("today", now).start;
  const today = calendarDateInKst(now);
  const earliestLeaveHistoryDate = startOfKstDate("2024-03-25")!;
  const leaveStart = dateParam(leaveStartParam, earliestLeaveHistoryDate);
  const requestedLeaveEnd = dateParam(leaveEndParam, today);
  const leaveEnd = requestedLeaveEnd < leaveStart ? leaveStart : requestedLeaveEnd;
  const leaveEndExclusive = new Date(leaveEnd.getTime() + 86400000);
  const requestedLeavePage = Number.parseInt(leavePageParam ?? "1", 10);

  const [employees, records, leaveRequests, businessTrips, sourceBalances, naverWorksLeaveRecords] =
    await Promise.all([
      prisma.employee.findMany({
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          department: true,
          position: true,
          hireDate: true,
          workMinutesPerDay: true,
          active: true,
          leaveEnabled: true,
        },
      }),
      prisma.attendanceRecord.findMany({
        where: {
          cancelledAt: null,
          timestamp: { gte: start, lte: end },
        },
        include: {
          employee: {
            select: { name: true, code: true, department: true },
          },
        },
        orderBy: { timestamp: "asc" },
        take: 2000,
      }),
      prisma.leaveRequest.findMany({
        include: {
          employee: {
            select: {
              name: true,
              code: true,
              department: true,
              workMinutesPerDay: true,
            },
          },
        },
        orderBy: [{ leaveDate: "desc" }, { createdAt: "desc" }],
      }),
      prisma.businessTrip.findMany({
        include: {
          employee: {
            select: { name: true, code: true, department: true },
          },
        },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      }),
      prisma.naverWorksAnnualLeaveBalance.findMany({
        where: {
          cycleStart: { lte: now },
          cycleEnd: { gte: now },
        },
        orderBy: [{ sourceAsOf: "desc" }, { importedAt: "desc" }],
      }),
      prisma.naverWorksAbsenceRecord.findMany({
        where: {
          requestedOn: { gte: leaveStart, lt: leaveEndExclusive },
          OR: [
            { absenceType: "연차" },
            { absenceType: { contains: "휴가" } },
            { absenceType: { contains: "공가" } },
          ],
        },
        include: {
          employee: {
            select: {
              name: true,
              code: true,
              department: true,
              workMinutesPerDay: true,
            },
          },
        },
        orderBy: [{ requestedOn: "desc" }, { importedAt: "desc" }],
      }),
    ]);

  const sourceBalanceByEmployee = new Map<string, (typeof sourceBalances)[number]>();
  for (const balance of sourceBalances) {
    if (!sourceBalanceByEmployee.has(balance.employeeId)) {
      sourceBalanceByEmployee.set(balance.employeeId, balance);
    }
  }
  const cutoverDate = naverWorksLeaveCutoverDate();

  const activeEmployees = employees.filter((employee) => employee.active);
  const todayRecords = records.filter(
    (record) => record.timestamp >= todayStart,
  );
  const todayByEmployee = new Map<string, AttendanceRow[]>();
  for (const record of todayRecords) {
    const employeeRecords = todayByEmployee.get(record.employeeId) ?? [];
    employeeRecords.push(record);
    todayByEmployee.set(record.employeeId, employeeRecords);
  }

  const employeeRows: EmployeeMonitorRow[] = activeEmployees.map((employee) => {
    const employeeToday = todayByEmployee.get(employee.id) ?? [];
    const checkIn = employeeToday.find((record) => record.type === "IN") ?? null;
    const checkOut =
      [...employeeToday].reverse().find((record) => record.type === "OUT") ??
      null;
    let attendance = {
      label: "미출근",
      tone: "bg-slate-100 text-slate-500",
      checkIn: checkIn?.timestamp ?? null,
      checkOut: checkOut?.timestamp ?? null,
    };
    if (checkIn && checkOut) {
      attendance = {
        ...attendance,
        label: "퇴근 완료",
        tone: "bg-blue-50 text-blue-700",
      };
    } else if (checkIn) {
      attendance = {
        ...attendance,
        label: "근무 중",
        tone: "bg-emerald-50 text-emerald-700",
      };
    } else if (checkOut) {
      attendance = {
        ...attendance,
        label: "확인 필요",
        tone: "bg-red-50 text-red-600",
      };
    }

    let leave: EmployeeMonitorRow["leave"] = null;
    if (employee.hireDate && employee.leaveEnabled) {
      const leavePeriod = currentLeavePeriod(employee.hireDate, now);
      const sourceBalance = sourceBalanceByEmployee.get(employee.id);
      const requests = leaveRequests.filter(
        (request) =>
          request.employeeId === employee.id &&
          request.leaveDate >= leavePeriod.start &&
          request.leaveDate < leavePeriod.end,
      );
      const isPostCutoverRequest = (request: { createdAt: Date }) =>
        !sourceBalance || !cutoverDate || request.createdAt >= cutoverDate;
      const approvedMinutes = requests
        .filter(
          (request) =>
            request.status === "APPROVED" && isPostCutoverRequest(request),
        )
        .reduce((sum, request) => sum + request.unitsMinutes, 0);
      const pendingMinutes = requests
        .filter(
          (request) =>
            request.status === "PENDING" && isPostCutoverRequest(request),
        )
        .reduce((sum, request) => sum + request.unitsMinutes, 0);
      const grantedDays = statutoryAnnualLeaveDays(employee.hireDate, now);
      const grantedMinutes = grantedDays * employee.workMinutesPerDay;
      const sourceGrantedMinutes = sourceBalance
        ? sourceBalance.annualGrantedMinutes
          + sourceBalance.firstYearGrantedMinutes
          + sourceBalance.firstYearCarryoverMinutes
          + sourceBalance.carryoverMinutes
          + sourceBalance.adjustedMinutes
        : null;
      const remainingMinutes = sourceBalance
        ? sourceBalance.remainingMinutes - approvedMinutes - pendingMinutes
        : Math.max(0, grantedMinutes - approvedMinutes - pendingMinutes);
      leave = {
        grantedDays: minutesToDays(
          sourceGrantedMinutes ?? grantedMinutes,
          employee.workMinutesPerDay,
        ),
        usedDays: minutesToDays(
          (sourceBalance?.usedMinutes ?? 0) + approvedMinutes,
          employee.workMinutesPerDay,
        ),
        pendingDays: minutesToDays(pendingMinutes, employee.workMinutesPerDay),
        remainingDays: minutesToDays(remainingMinutes, employee.workMinutesPerDay),
      };
    }

    const registeredTrips = businessTrips
      .filter(
        (trip) =>
          trip.employeeId === employee.id && trip.status === "APPROVED",
      )
      .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
    const currentTrip = registeredTrips.find(
      (trip) => trip.startDate <= today && trip.endDate >= today,
    );
    const upcomingTrip = registeredTrips.find((trip) => trip.startDate > today);
    const trip = currentTrip
      ? {
          label: "출장 중",
          detail: `${fmtDate(currentTrip.startDate)} ~ ${fmtDate(currentTrip.endDate)}`,
          tone: "bg-emerald-50 text-emerald-700",
        }
      : upcomingTrip
        ? {
            label: "출장 예정",
            detail: `${fmtDate(upcomingTrip.startDate)} ~ ${fmtDate(upcomingTrip.endDate)}`,
            tone: "bg-blue-50 text-blue-700",
          }
        : {
            label: "일정 없음",
            detail: "-",
            tone: "bg-slate-100 text-slate-500",
          };

    return {
      id: employee.id,
      code: employee.code,
      name: employee.name,
      department: employee.department,
      position: employee.position,
      attendance,
      leave,
      trip,
    };
  });

  const summaries = aggregate(records);
  const totalMinutes = summaries.reduce(
    (sum, employee) => sum + employee.totalMinutes,
    0,
  );
  const checkedInCount = employeeRows.filter(
    (employee) => employee.attendance.checkIn,
  ).length;
  const workingCount = employeeRows.filter(
    (employee) => employee.attendance.label === "근무 중",
  ).length;
  const pendingLeaveCount = leaveRequests.filter(
    (request) => request.status === "PENDING",
  ).length;
  const pendingTripCount = businessTrips.filter(
    (trip) => trip.status === "PENDING",
  ).length;
  const activeTripCount = businessTrips.filter(
    (trip) =>
      trip.status === "APPROVED" &&
      trip.startDate <= today &&
      trip.endDate >= today,
  ).length;
  const leaveHistory: LeaveTableRow[] = [
    ...leaveRequests
      .filter(
        (request) =>
          request.leaveDate >= leaveStart && request.leaveDate < leaveEndExclusive,
      )
      .map((request) => ({
        id: request.id,
        source: "HR" as const,
        leaveType: request.leaveType,
        periodText: fmtDate(request.leaveDate),
        searchDate: request.leaveDate,
        unitsMinutes: request.unitsMinutes,
        reason: request.reason,
        status: request.status,
        sourceDocumentNo: null,
        employee: request.employee,
      })),
    ...naverWorksLeaveRecords.map((record) => ({
      id: record.id,
      source: "NAVER_WORKS" as const,
      leaveType: record.absenceType,
      periodText: record.periodText,
      searchDate: record.requestedOn!,
      unitsMinutes: record.unitsMinutes,
      reason: null,
      status: record.status,
      sourceDocumentNo: record.sourceDocumentNo,
      employee: record.employee,
    })),
  ].sort((left, right) => right.searchDate.getTime() - left.searchDate.getTime());
  const leaveHistoryTotalPages = Math.max(
    1,
    Math.ceil(leaveHistory.length / LEAVE_HISTORY_PAGE_SIZE),
  );
  const leaveHistoryPage = Math.min(
    Math.max(1, Number.isFinite(requestedLeavePage) ? requestedLeavePage : 1),
    leaveHistoryTotalPages,
  );
  const pagedLeaveHistory = leaveHistory.slice(
    (leaveHistoryPage - 1) * LEAVE_HISTORY_PAGE_SIZE,
    leaveHistoryPage * LEAVE_HISTORY_PAGE_SIZE,
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold tracking-[0.18em] text-blue-600">
            BNOW PEOPLE ADMIN
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            ADMIN 통합 모니터링
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            직원별 출퇴근, 휴가 잔여량, 휴가·출장 신청 현황을 한곳에서 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/admin/approvals"
            className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 font-semibold text-amber-800 hover:bg-amber-100"
          >
            결재 요청 {pendingLeaveCount + pendingTripCount}건
          </Link>
          <Link
            href="/admin/authorization-letters"
            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 font-semibold text-rose-700 hover:bg-rose-100"
          >
            위임장 발급
          </Link>
          <Link
            href="/admin/employment-certificates"
            className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 font-semibold text-blue-700 hover:bg-blue-100"
          >
            재직증명서 발급
          </Link>
          <Link
            href="/admin/employees"
            className="rounded-full border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:border-slate-500"
          >
            직원명부 관리
          </Link>
          <Link
            href="/admin/naverworks-import"
            className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 font-semibold text-violet-700 hover:bg-violet-100"
          >
            네이버웍스 원장
          </Link>
          <LogoutButton />
        </div>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <SummaryCard label="재직 직원" value={`${activeEmployees.length}명`} />
        <SummaryCard label="오늘 출근" value={`${checkedInCount}명`} />
        <SummaryCard label="현재 근무 중" value={`${workingCount}명`} accent="green" />
        <SummaryCard label="휴가 신청 중" value={`${pendingLeaveCount}건`} accent="blue" />
        <SummaryCard label="출장 신청 중" value={`${pendingTripCount}건`} />
        <SummaryCard label="오늘 출장" value={`${activeTripCount}명`} />
      </section>

      <DashboardSection
        eyebrow="EMPLOYEE OVERVIEW"
        title="직원별 통합 현황"
        description="오늘 출퇴근 상태와 현재 연차기간의 잔여 휴가, 출장 일정을 함께 표시합니다."
      >
        <EmployeeMonitorTable rows={employeeRows} />
      </DashboardSection>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-5">
          <div className="text-xs font-bold tracking-[0.14em] text-slate-400">
            LEAVE HISTORY
          </div>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            직원별 휴가 사용 전체 내역
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            네이버웍스 이전 원장과 HR 휴가 신청을 함께 조회합니다. 총 {leaveHistory.length}건
          </p>
        </div>
        <form className="mb-5 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-4">
          <input type="hidden" name="period" value={period} />
          <label className="text-sm font-medium text-slate-600">
            시작일
            <input
              type="date"
              name="leaveStart"
              defaultValue={dateInputValue(leaveStart)}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
            />
          </label>
          <label className="text-sm font-medium text-slate-600">
            종료일
            <input
              type="date"
              name="leaveEnd"
              defaultValue={dateInputValue(leaveEnd)}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            날짜 검색
          </button>
          <Link
            href={leaveHistoryHref({
              period,
              leaveStart: earliestLeaveHistoryDate,
              leaveEnd: today,
              leavePage: 1,
            })}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            전체 기간
          </Link>
        </form>
        <LeaveRequestTable
          requests={pagedLeaveHistory}
          leaveStart={leaveStart}
          leaveEnd={leaveEnd}
          page={leaveHistoryPage}
          totalPages={leaveHistoryTotalPages}
          period={period}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <DashboardSection
          eyebrow="BUSINESS TRIPS"
          title="직원별 출장 신청 현황"
          description={`전체 ${businessTrips.length}건 · 오늘 출장 ${activeTripCount}명`}
        >
          <BusinessTripTable trips={businessTrips.slice(0, 100)} today={today} />
        </DashboardSection>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold tracking-[0.14em] text-slate-400">
              ATTENDANCE HISTORY
            </div>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              출퇴근 상세 현황
            </h2>
            <p className="mt-1 text-sm text-slate-500">조회기간 · {label}</p>
          </div>
          <a
            href={`/api/attendance/export?period=${period}`}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            CSV 내보내기
          </a>
        </div>

        <div className="my-5 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/admin?period=${tab.key}`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                tab.key === period
                  ? "bg-blue-600 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="mb-5 grid grid-cols-3 gap-3">
          <SummaryCard label="기록 직원" value={`${summaries.length}명`} />
          <SummaryCard label="총 기록" value={`${records.length}건`} />
          <SummaryCard label="총 근무시간" value={formatMinutes(totalMinutes)} />
        </div>

        {period === "today" ? (
          <TodayList records={[...records].reverse()} />
        ) : (
          <SummaryTable summaries={summaries} />
        )}
        <p className="mt-4 text-xs text-slate-400">
          근무시간은 출근-퇴근 쌍의 합계입니다. 퇴근 미기록 세션은 총 근무시간에
          포함되지 않습니다.
        </p>
      </section>
    </main>
  );
}

function DashboardSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-5">
        <div className="text-xs font-bold tracking-[0.14em] text-slate-400">
          {eyebrow}
        </div>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "blue" | "green";
}) {
  const tone =
    accent === "blue"
      ? "border-blue-200 bg-blue-600 text-white"
      : accent === "green"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
        : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className={`text-xs ${accent === "blue" ? "text-blue-100" : "text-slate-500"}`}>
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function EmployeeMonitorTable({ rows }: { rows: EmployeeMonitorRow[] }) {
  if (rows.length === 0) return <EmptyState text="재직 직원이 없습니다." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="border-y border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">직원</th>
            <th className="px-4 py-3 font-semibold">부서 / 직급</th>
            <th className="px-4 py-3 font-semibold">오늘 근태</th>
            <th className="px-4 py-3 font-semibold">출근 / 퇴근</th>
            <th className="px-4 py-3 font-semibold">잔여 휴가</th>
            <th className="px-4 py-3 font-semibold">출장</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="align-top hover:bg-slate-50/70">
              <td className="px-4 py-4 font-semibold text-slate-900">
                {row.name}
                <span className="ml-1 font-normal text-slate-400">({row.code})</span>
              </td>
              <td className="px-4 py-4 text-slate-600">
                {row.department ?? "-"}
                <div className="mt-0.5 text-xs text-slate-400">{row.position ?? "직급 없음"}</div>
              </td>
              <td className="px-4 py-4">
                <StatusBadge label={row.attendance.label} tone={row.attendance.tone} />
              </td>
              <td className="px-4 py-4 font-mono text-xs text-slate-600">
                {row.attendance.checkIn ? fmtTime(row.attendance.checkIn) : "--:--"}
                <span className="mx-1.5 text-slate-300">/</span>
                {row.attendance.checkOut ? fmtTime(row.attendance.checkOut) : "--:--"}
              </td>
              <td className="px-4 py-4">
                {row.leave ? (
                  <>
                    <strong className="text-base text-blue-700">
                      {fmtDays(row.leave.remainingDays)}일
                    </strong>
                    <div className="mt-1 text-xs text-slate-400">
                      발생 {fmtDays(row.leave.grantedDays)} · 사용 {fmtDays(row.leave.usedDays)} · 신청 중 {fmtDays(row.leave.pendingDays)}
                    </div>
                  </>
                ) : (
                  <span className="text-slate-400">계산 불가</span>
                )}
              </td>
              <td className="px-4 py-4">
                <StatusBadge label={row.trip.label} tone={row.trip.tone} />
                <div className="mt-1 text-xs text-slate-400">{row.trip.detail}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaveRequestTable({
  requests,
  leaveStart,
  leaveEnd,
  page,
  totalPages,
  period,
}: {
  requests: LeaveTableRow[];
  leaveStart: Date;
  leaveEnd: Date;
  page: number;
  totalPages: number;
  period: Period;
}) {
  if (requests.length === 0) return <EmptyState text="선택한 기간의 휴가 사용 내역이 없습니다." />;
  return (
    <>
      <div className="overflow-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[880px] text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">직원</th>
            <th className="px-4 py-3 font-semibold">원장</th>
            <th className="px-4 py-3 font-semibold">사용 일정</th>
            <th className="px-4 py-3 font-semibold">신청 기준일</th>
            <th className="px-4 py-3 font-semibold">종류</th>
            <th className="px-4 py-3 font-semibold">상태</th>
            <th className="px-4 py-3 font-semibold">사유 / 문서번호</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {requests.map((request) => {
            const status = request.source === "HR"
              ? leaveStatus(request.status)
              : { label: "이전 완료", tone: "bg-violet-50 text-violet-700" };
            return (
              <tr key={request.id} className="align-top">
                <td className="px-4 py-3 font-semibold text-slate-800">
                  {request.employee.name}
                  <div className="text-xs font-normal text-slate-400">{request.employee.department ?? request.employee.code}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    request.source === "HR"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-violet-50 text-violet-700"
                  }`}>
                    {request.source === "HR" ? "HR" : "NAVER WORKS"}
                  </span>
                </td>
                <td className="max-w-[260px] px-4 py-3 text-slate-600">{request.periodText}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(request.searchDate)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                  {request.source === "HR"
                    ? leaveTypeLabel(request.leaveType)
                    : request.leaveType} · {fmtDays(minutesToDays(request.unitsMinutes, request.employee.workMinutesPerDay))}일
                </td>
                <td className="px-4 py-3"><StatusBadge label={status.label} tone={status.tone} /></td>
                <td className="max-w-[220px] px-4 py-3 text-slate-500">
                  {request.reason || request.sourceDocumentNo || "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-500">{page} / {totalPages} 페이지 · 페이지당 {LEAVE_HISTORY_PAGE_SIZE}건</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={leaveHistoryHref({ period, leaveStart, leaveEnd, leavePage: page - 1 })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50"
            >
              이전
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={leaveHistoryHref({ period, leaveStart, leaveEnd, leavePage: page + 1 })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50"
            >
              다음
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

function BusinessTripTable({ trips, today }: { trips: TripTableRow[]; today: Date }) {
  if (trips.length === 0) return <EmptyState text="출장 신청 내역이 없습니다." />;
  return (
    <div className="max-h-[430px] overflow-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">직원</th>
            <th className="px-4 py-3 font-semibold">출장기간</th>
            <th className="px-4 py-3 font-semibold">상태</th>
            <th className="px-4 py-3 font-semibold">출장사유</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {trips.map((trip) => {
            const status = tripStatus(trip.status, trip.startDate, trip.endDate, today);
            return (
              <tr key={trip.id} className="align-top">
                <td className="px-4 py-3 font-semibold text-slate-800">
                  {trip.employee.name}
                  <div className="text-xs font-normal text-slate-400">{trip.employee.department ?? trip.employee.code}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                  {fmtDate(trip.startDate)} ~ {fmtDate(trip.endDate)}
                  <div className="mt-0.5 text-xs text-slate-400">총 {tripDays(trip.startDate, trip.endDate)}일</div>
                </td>
                <td className="px-4 py-3"><StatusBadge label={status.label} tone={status.tone} /></td>
                <td className="max-w-[240px] px-4 py-3 text-slate-500">{trip.reason}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-400">{text}</div>;
}

function SummaryTable({ summaries }: { summaries: ReturnType<typeof aggregate> }) {
  if (summaries.length === 0) return <EmptyState text="이 기간에 출퇴근 기록이 없습니다." />;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">직원</th>
            <th className="px-4 py-3 font-medium">부서</th>
            <th className="px-4 py-3 font-medium">출근일수</th>
            <th className="px-4 py-3 font-medium">근무세션</th>
            <th className="px-4 py-3 font-medium">총 근무시간</th>
            <th className="px-4 py-3 font-medium">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {summaries.map((employee) => (
            <tr key={employee.employeeId}>
              <td className="px-4 py-3">{employee.name}<span className="ml-1 text-slate-400">({employee.code})</span></td>
              <td className="px-4 py-3 text-slate-500">{employee.department ?? "-"}</td>
              <td className="px-4 py-3">{employee.workDays}일</td>
              <td className="px-4 py-3">{employee.sessions}회</td>
              <td className="px-4 py-3 font-medium">{formatMinutes(employee.totalMinutes)}</td>
              <td className="px-4 py-3">{employee.openSession ? <span className="text-amber-600">근무 중</span> : <span className="text-slate-400">-</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TodayList({ records }: { records: AttendanceRow[] }) {
  if (records.length === 0) return <EmptyState text="오늘 출퇴근 기록이 아직 없습니다." />;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">시간</th>
            <th className="px-4 py-3 font-medium">직원</th>
            <th className="px-4 py-3 font-medium">부서</th>
            <th className="px-4 py-3 font-medium">구분</th>
            <th className="px-4 py-3 font-medium">기록 위치</th>
            <th className="px-4 py-3 font-medium">확인</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((record) => (
            <tr key={record.id}>
              <td className="px-4 py-3 font-mono text-slate-700">{fmtTime(record.timestamp)}</td>
              <td className="px-4 py-3">{record.employee.name}<span className="ml-1 text-slate-400">({record.employee.code})</span></td>
              <td className="px-4 py-3 text-slate-500">{record.employee.department ?? "-"}</td>
              <td className="px-4 py-3"><StatusBadge label={record.type === "IN" ? "출근" : "퇴근"} tone={record.type === "IN" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"} /></td>
              <td className="px-4 py-3 text-xs text-slate-600">
                <div>{fmtAddress(record.note)}</div>
                <div className="mt-0.5 text-slate-400">{fmtCoordinate(record.latitude)}, {fmtCoordinate(record.longitude)}</div>
              </td>
              <td className="px-4 py-3">{record.verified ? <span className="text-emerald-600">확인됨</span> : <span className="text-amber-600">미확인</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
