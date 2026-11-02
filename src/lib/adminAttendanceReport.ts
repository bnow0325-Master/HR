import { prisma } from "@/lib/prisma";
import {
  buildAttendanceDays,
  parseAttendanceRange,
  type ReportEmployee,
} from "@/lib/attendanceReport";

export async function loadAdminAttendanceReport(params: URLSearchParams) {
  const range = parseAttendanceRange(params);
  const directory = await prisma.employee.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      department: true,
      hireDate: true,
      terminationDate: true,
    },
    orderBy: [{ code: "asc" }],
  });
  if (range.employeeId && !directory.some((employee) => employee.id === range.employeeId)) {
    throw new Error("선택한 직원을 찾을 수 없습니다.");
  }
  const employees: ReportEmployee[] = range.employeeId
    ? directory.filter((employee) => employee.id === range.employeeId)
    : directory;
  const records = await prisma.attendanceRecord.findMany({
    where: {
      ...(range.employeeId ? { employeeId: range.employeeId } : {}),
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
  });

  return {
    range,
    directory,
    rows: buildAttendanceDays(employees, records, range),
  };
}
