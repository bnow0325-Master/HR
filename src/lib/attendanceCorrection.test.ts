import assert from "node:assert/strict";
import test from "node:test";
import { correctionConflict, correctionDateAllowed, kstDayRange, parseKstTime } from "./attendanceCorrection";

test("Korean date and time parsing rejects invalid and future dates", () => {
  assert.equal(kstDayRange("2026-02-30"), null);
  assert.equal(parseKstTime("2026-10-31", "24:00"), undefined);
  assert.equal(parseKstTime("2026-10-31", "09:00")?.toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal(correctionDateAllowed("2026-11-02", new Date("2026-10-31T00:00:00Z")), false);
});

test("correction only fills missing punches in chronological order", () => {
  const morning = new Date("2026-10-30T00:00:00Z");
  const evening = new Date("2026-10-30T09:00:00Z");
  assert.equal(correctionConflict([{ type: "IN", timestamp: morning }], null, evening), false);
  assert.equal(correctionConflict([{ type: "IN", timestamp: morning }], morning, null), true);
  assert.equal(correctionConflict([{ type: "IN", timestamp: evening }], null, morning), true);
});
