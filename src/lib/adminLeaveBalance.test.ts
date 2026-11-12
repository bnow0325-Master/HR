import assert from "node:assert/strict";
import test from "node:test";
import { adminLeaveBalance } from "./adminLeaveBalance";

test("an administrator registration counts one approved day once and preserves a negative balance", () => {
  const current = adminLeaveBalance({
    grantedMinutes: 3 * 480, usedMinutes: 480,
    approvedMinutes: 3 * 480, pendingMinutes: 0, workMinutesPerDay: 480,
  });
  assert.deepEqual({ granted: current.grantedDays, used: current.usedDays, remaining: current.remainingDays },
    { granted: 3, used: 4, remaining: -1 });
  const after = adminLeaveBalance({
    grantedMinutes: 3 * 480, usedMinutes: 480,
    approvedMinutes: 3 * 480, pendingMinutes: 0, workMinutesPerDay: 480,
  }, 480);
  assert.equal(after.canRegister, true);
  assert.deepEqual({ granted: after.grantedDays, used: after.usedDays, remaining: after.remainingDays },
    { granted: 3, used: 5, remaining: -2 });
});

test("a pending request still reduces the displayed balance after direct registration", () => {
  const after = adminLeaveBalance({
    grantedMinutes: 5 * 480, usedMinutes: 0,
    approvedMinutes: 480, pendingMinutes: 480, workMinutesPerDay: 480,
  }, 480);
  assert.deepEqual({ used: after.usedDays, remaining: after.remainingDays }, { used: 2, remaining: 2 });
});
