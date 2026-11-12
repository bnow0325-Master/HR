import assert from "node:assert/strict";
import test from "node:test";
import { chatSaved, kstDate, morningWindow, privateHrChannel } from "./hrNotificationRules";

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

test("only representative attendance events use the private HR chat", () => {
  const representative = "ceo@example.test";
  const base = { idempotencyKey: "hr-attendance-ceo-IN-record-1", recipientEmail: representative, audience: "operations" };
  assert.equal(privateHrChannel(base, representative), "hr");
  assert.equal(privateHrChannel({ ...base, idempotencyKey: "hr-attendance-ceo-OUT-record-2" }, representative), "hr");
  assert.equal(privateHrChannel({ ...base, recipientEmail: "staff@example.test" }, representative), undefined);
  assert.equal(privateHrChannel({ ...base, audience: "work" }, representative), undefined);
  assert.equal(privateHrChannel({ ...base, idempotencyKey: "hr-absence-ceo-leave-1-APPROVED" }, representative), undefined);
  assert.equal(privateHrChannel({ ...base, idempotencyKey: "hr-attendance-self-IN-record-1" }, representative), undefined);
});
