import assert from "node:assert/strict";
import test from "node:test";
import { canRequestAnnualLeave, MAX_NEGATIVE_LEAVE_DAYS, remainingAnnualLeaveMinutes } from "./annualLeave";

test("balance uses granted minus source and approved use, including negative days", () => {
  assert.equal(remainingAnnualLeaveMinutes(3 * 480, 480, 3 * 480, 0), -480);
  assert.equal(remainingAnnualLeaveMinutes(3 * 480, 480, 4 * 480, 0), -960);
});

test("annual leave can be requested down to the welfare limit", () => {
  const workMinutesPerDay = 480;
  assert.equal(MAX_NEGATIVE_LEAVE_DAYS, 12);
  assert.equal(canRequestAnnualLeave(0, 12 * workMinutesPerDay, workMinutesPerDay), true);
  assert.equal(canRequestAnnualLeave(0, 12 * workMinutesPerDay + 1, workMinutesPerDay), false);
});

test("annual leave respects the limit from an existing negative balance", () => {
  const workMinutesPerDay = 480;
  assert.equal(canRequestAnnualLeave(-11 * workMinutesPerDay, workMinutesPerDay, workMinutesPerDay), true);
  assert.equal(canRequestAnnualLeave(-12 * workMinutesPerDay, 1, workMinutesPerDay), false);
});
