import { prisma } from "@/lib/prisma";
import {
  buildAttendanceDays,
  enrichAttendanceDays,
  parseAttendanceRange,
  type ReportEmployee,
} from "@/lib/attendanceReport";

export async function loadAdminAttendanceReport(params: URLSearchParams, forcedEmployeeId?: string) {
  const scopedParams = new URLSearchParams(params);
  if (forcedEmployeeId) scopedParams.set("employeeId", forcedEmployeeId);
  const range = parseAttendanceRange(scopedParams);
  const directory = await prisma.employee.findMany({
    where: forcedEmployeeId ? { id: forcedEmployeeId, active: true } : { active: true },
    select: {
      id: true,
      code: true,
      name: true,
      department: true,
      hireDate: true,
      terminationDate: true,
      workMinutesPerDay: true,
    },
    orderBy: [{ code: "asc" }],
  });
  if (range.employeeId && !directory.some((employee) => employee.id === range.employeeId)) {
    throw new Error("선택한 직원을 찾을 수 없습니다.");
  }
  const employees: ReportEmployee[] = range.employeeId
    ? directory.filter((employee) => employee.id === range.employeeId)
    : directory;
  const employeeWhere = range.employeeId ? { employeeId: range.employeeId } : {};
  const dateStart = new Date(`${range.startDay}T00:00:00.000Z`);
  const dateEnd = new Date(`${range.endDay}T23:59:59.999Z`);
  const [records, imported, leaves, trips] = await Promise.all([prisma.attendanceRecord.findMany({
    where: {
      ...employeeWhere,
      timestamp: {
        gte: new Date(range.start.getTime() - 24 * 60 * 60 * 1000),
        lt: new Date(range.endExclusive.getTime() + 24 * 60 * 60 * 1000),
      },
    },
    select: {
      employeeId: true,
      type: true,
      timestamp: true,
      cancelledAt: true,
    },
    orderBy: [{ employeeId: "asc" }, { timestamp: "asc" }],
  }), prisma.naverWorksDailyRecord.findMany({
    where: { ...employeeWhere, baseDate: { gte: dateStart, lte: dateEnd } },
    select: { employeeId: true, baseDate: true, checkInAt: true, checkOutAt: true, late: true, earlyLeave: true, workType: true },
  }), prisma.leaveRequest.findMany({
    where: { ...employeeWhere, status: "APPROVED", leaveDate: { gte: dateStart, lte: dateEnd } },
    select: { employeeId: true, leaveDate: true, leaveType: true, unitsMinutes: true },
  }), prisma.businessTrip.findMany({
    where: { ...employeeWhere, status: "APPROVED", startDate: { lte: dateEnd }, endDate: { gte: dateStart } },
    select: { employeeId: true, startDate: true, endDate: true },
  })]);

  return {
    range,
    directory,
    rows: enrichAttendanceDays(buildAttendanceDays(employees, records, range), employees, imported, leaves, trips),
  };
}
