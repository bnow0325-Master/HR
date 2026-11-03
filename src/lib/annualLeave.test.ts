import assert from "node:assert/strict";
import test from "node:test";
import { canRequestAnnualLeave, MAX_NEGATIVE_LEAVE_DAYS } from "./annualLeave";

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
