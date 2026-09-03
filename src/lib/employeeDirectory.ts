import type { Prisma } from "@prisma/client";

export const employeeDirectorySelect = {
  id: true,
  code: true,
  name: true,
  department: true,
  position: true,
  email: true,
  phone: true,
  hireDate: true,
  terminationDate: true,
  systemRole: true,
  attendanceEnabled: true,
  leaveEnabled: true,
  workboardEnabled: true,
  active: true,
} as const satisfies Prisma.EmployeeSelect;

export type EmployeeDirectoryRecord = Prisma.EmployeeGetPayload<{
  select: typeof employeeDirectorySelect;
}>;

function dateOnly(value: Date | string | null): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return null;
}

export function presentEmployeeDirectoryRecord(employee: EmployeeDirectoryRecord) {
  return {
    ...employee,
    hireDate: dateOnly(employee.hireDate),
    terminationDate: dateOnly(employee.terminationDate),
  };
}
