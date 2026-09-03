import assert from "node:assert/strict";
import test from "node:test";
import {
  employeeDirectorySelect,
  presentEmployeeDirectoryRecord,
  type EmployeeDirectoryRecord,
} from "./employeeDirectory";

test("employee directory keeps WorkBoard identity and permission fields", () => {
  assert.equal(employeeDirectorySelect.email, true);
  assert.equal(employeeDirectorySelect.workboardEnabled, true);
  assert.equal(employeeDirectorySelect.systemRole, true);
  assert.equal(employeeDirectorySelect.active, true);

  const employee: EmployeeDirectoryRecord = {
    id: "employee-test",
    code: "E001",
    name: "Test Employee",
    department: "Operations",
    position: "Manager",
    email: "employee@example.test",
    phone: null,
    hireDate: new Date("2026-01-02T00:00:00.000Z"),
    terminationDate: null,
    systemRole: "ADMIN",
    attendanceEnabled: true,
    leaveEnabled: true,
    workboardEnabled: true,
    active: true,
  };

  assert.deepEqual(presentEmployeeDirectoryRecord(employee), {
    ...employee,
    hireDate: "2026-01-02",
    terminationDate: null,
  });
});
