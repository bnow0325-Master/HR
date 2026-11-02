import assert from "node:assert/strict";
import test from "node:test";
import {
  attendanceCsv,
  buildAttendanceDays,
  parseAttendanceRange,
  type AttendanceEvent,
  type ReportEmployee,
} from "./attendanceReport";

const employee: ReportEmployee = {
  id: "e1",
  code: "001",
  name: "테스트 직원",
  department: "개발",
  hireDate: null,
  terminationDate: null,
};
const now = new Date("2026-11-03T00:00:00.000Z");
const range = parseAttendanceRange(new URLSearchParams("start=2026-11-02&end=2026-11-02"), now);

function event(type: string, iso: string, cancelledAt: Date | null = null): AttendanceEvent {
  return { employeeId: "e1", type, timestamp: new Date(iso), cancelledAt };
}

test("multiple sessions and overnight OUT sum on the IN date in KST", () => {
  const rows = buildAttendanceDays([employee], [
    event("IN", "2026-11-02T00:00:00Z"),
    event("OUT", "2026-11-02T03:00:00Z"),
    event("IN", "2026-11-02T14:30:00Z"),
    event("OUT", "2026-11-02T17:00:00Z"),
  ], range, now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].minutes, 330);
  assert.equal(rows[0].firstIn, "09:00");
  assert.equal(rows[0].lastOut, "2026-11-03 02:00");
  assert.equal(rows[0].status, "완료");
  assert.deepEqual(rows[0].sessions, ["09:00–12:00", "23:30–2026-11-03 02:00"]);
});

test("cancelled records are excluded and missing pair is identified", () => {
  const rows = buildAttendanceDays([employee], [
    event("IN", "2026-11-02T00:00:00Z", new Date("2026-11-02T02:00:00Z")),
    event("OUT", "2026-11-02T08:00:00Z"),
  ], range, now);
  assert.equal(rows[0].minutes, 0);
  assert.equal(rows[0].status, "출근 누락");
  assert.equal(rows[0].cancelledCount, 1);
});

test("open IN and repeated IN are shown as missing OUT", () => {
  const rows = buildAttendanceDays([employee], [
    event("IN", "2026-11-02T00:00:00Z"),
    event("IN", "2026-11-02T04:00:00Z"),
    event("OUT", "2026-11-02T08:00:00Z"),
  ], range, now);
  assert.equal(rows[0].minutes, 240);
  assert.equal(rows[0].status, "퇴근 미등록");
  assert.deepEqual(rows[0].sessions, ["09:00–미등록", "13:00–17:00"]);
});

test("range validation rejects impossible dates and long periods", () => {
  assert.throws(() => parseAttendanceRange(new URLSearchParams("start=2026-02-30&end=2026-03-01")));
  assert.throws(() => parseAttendanceRange(new URLSearchParams("start=2026-01-01&end=2026-06-01")));
});

test("CSV quotes names and protects spreadsheet formulas", () => {
  const rows = buildAttendanceDays([{ ...employee, name: '=HYPERLINK("bad")' }], [], range, now);
  const csv = attendanceCsv(rows);
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /'=?=HYPERLINK/);
  assert.match(csv, /""bad""/);
});
