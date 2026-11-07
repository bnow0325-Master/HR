import assert from "node:assert/strict";
import test from "node:test";
import { chatSaved, kstDate, morningWindow } from "./hrNotificationRules";

test("KST morning and Monday boundaries drive one weekly summary", () => {
  assert.equal(kstDate(new Date("2026-11-08T14:59:00Z")), "2026-11-08");
  assert.deepEqual(morningWindow(new Date("2026-11-08T23:59:00Z")), {
    date: "2026-11-09", due: false, monday: true,
  });
  assert.deepEqual(morningWindow(new Date("2026-11-09T00:00:00Z")), {
    date: "2026-11-09", due: true, monday: true,
  });
  assert.deepEqual(morningWindow(new Date("2026-11-10T00:00:00Z")), {
    date: "2026-11-10", due: true, monday: false,
  });
});

test("HTTP 202 is not delivery unless chat saved a message", () => {
  assert.equal(chatSaved({ chatOk: false, messageSeq: null }), false);
  assert.equal(chatSaved({ chatOk: true, messageSeq: null }), false);
  assert.equal(chatSaved({ chatOk: true, messageSeq: 0 }), false);
  assert.equal(chatSaved({ chatOk: true, messageSeq: 42, roomId: "direct" }), true);
});
