import assert from "node:assert/strict";
import test from "node:test";
import {
  attendanceCsv,
  buildAttendanceDays,
  enrichAttendanceDays,
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

test("two IN events on a past day never manufacture an OUT time", () => {
  const october = parseAttendanceRange(new URLSearchParams("start=2026-10-26&end=2026-10-26"), now);
  const [row] = buildAttendanceDays([employee], [
    event("IN", "2026-10-25T23:55:12Z"),
    event("IN", "2026-10-26T08:55:44Z"),
  ], october, now);
  assert.equal(row.firstIn, "08:55");
  assert.equal(row.lastOut, null);
  assert.equal(row.status, "퇴근 미등록");
  assert.deepEqual(row.sessions, ["08:55–미등록", "17:55–미등록"]);
});

test("an open shift within 24 hours is working, not missing OUT", () => {
  const rows = buildAttendanceDays([employee], [event("IN", "2026-11-02T00:00:00Z")], range, new Date("2026-11-02T01:00:00Z"));
  assert.equal(rows[0].status, "근무 중");
  assert.deepEqual(rows[0].sessions, ["09:00–진행 중"]);
  const stale = buildAttendanceDays([employee], [event("IN", "2026-11-02T00:00:00Z")], range, new Date("2026-11-03T01:01:00Z"));
  assert.equal(stale[0].status, "퇴근 미등록");
});

test("range validation rejects impossible dates and long periods", () => {
  assert.throws(() => parseAttendanceRange(new URLSearchParams("start=2026-02-30&end=2026-03-01")));
  assert.throws(() => parseAttendanceRange(new URLSearchParams("start=2026-01-01&end=2026-06-01")));
});

test("CSV quotes names and protects spreadsheet formulas", () => {
  const rows = buildAttendanceDays([{ ...employee, name: '=HYPERLINK("bad")' }], [], range, now);
  const csv = attendanceCsv(enrichAttendanceDays(rows, [employee], [], [], []));
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /'=?=HYPERLINK/);
  assert.match(csv, /""bad""/);
});

test("imported times and approved absence are labelled without inventing late or early leave", () => {
  const days = parseAttendanceRange(new URLSearchParams("start=2026-09-29&end=2026-10-02"), now);
  const base = buildAttendanceDays([{ ...employee, workMinutesPerDay: 480 }], [], days, now);
  const rows = enrichAttendanceDays(base, [{ ...employee, workMinutesPerDay: 480 }], [{
    employeeId: "e1", baseDate: new Date("2026-09-30T00:00:00Z"),
    checkInAt: new Date("2026-09-30T00:10:00Z"), checkOutAt: new Date("2026-09-30T08:00:00Z"),
    late: true, earlyLeave: false, workType: "현장",
  }], [{
    employeeId: "e1", leaveDate: new Date("2026-09-29T00:00:00Z"), leaveType: "연차", unitsMinutes: 240,
  }], [{
    employeeId: "e1", startDate: new Date("2026-10-01T00:00:00Z"), endDate: new Date("2026-10-02T00:00:00Z"),
  }]);
  const byDate = new Map(rows.map((row) => [row.date, row]));
  assert.equal(byDate.get("2026-09-29")?.status, "승인 휴가");
  assert.match(byDate.get("2026-09-29")?.notes.join(" ") ?? "", /부분 휴가 승인/);
  assert.equal(byDate.get("2026-09-30")?.source, "네이버웍스 이관");
  assert.equal(byDate.get("2026-09-30")?.firstIn, "09:10");
  assert.equal(byDate.get("2026-09-30")?.importedLate, true);
  assert.equal(byDate.get("2026-10-01")?.status, "승인 출장");
  assert.equal(byDate.get("2026-10-02")?.status, "승인 출장");
});

test("new HR events take priority over the imported day without merging times", () => {
  const base = buildAttendanceDays([employee], [
    event("IN", "2026-11-02T00:00:00Z"), event("OUT", "2026-11-02T09:00:00Z"),
  ], range, now);
  const [row] = enrichAttendanceDays(base, [employee], [{
    employeeId: "e1", baseDate: new Date("2026-11-02T00:00:00Z"),
    checkInAt: new Date("2026-11-02T01:00:00Z"), checkOutAt: new Date("2026-11-02T10:00:00Z"),
    late: false, earlyLeave: false, workType: null,
  }], [], []);
  assert.equal(row.source, "HR");
  assert.equal(row.firstIn, "09:00");
  assert.match(row.notes.join(" "), /HR 원장 우선/);
});
