import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";

process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:3306/test";
process.env.APPROVAL_CEO_EMAIL = "executive@example.test";

test("one attendance save queues CHRO notices for CEO and the employee without resuming generic paused webhooks", async () => {
  const { enqueueAttendanceNotifications } = await import("./hrNotifications");
  const { pausedWebhookRecipients } = await import("./workboardApprovalNotifications");
  const items: Array<Record<string, unknown>> = [];
  const tx = { hrNotificationOutbox: { create: async ({ data }: { data: Record<string, unknown> }) => { items.push(data); } } } as unknown as Prisma.TransactionClient;
  await enqueueAttendanceNotifications(tx, {
    recordId: "record-1", type: "IN", employeeName: "직원A",
    employeeEmail: "staff@example.test", timestamp: new Date("2026-11-09T00:03:00Z"),
  });
  assert.equal(items.length, 2);
  assert.equal(items[0]?.audience, "operations");
  assert.equal(items[1]?.audience, "work");
  assert.equal(items[0]?.idempotencyKey, "hr-chro-v1:hr-attendance-ceo-IN-record-1");
  assert.equal(items[1]?.idempotencyKey, "hr-chro-v1:hr-attendance-self-IN-record-1");
  assert.equal(items[0]?.senderName, "AI CHRO · 인사");
  assert.match(String(items[1]?.message), /^출근이 등록되었습니다/);
  assert.doesNotMatch(String(items[1]?.message), /직원A/);

  items.length = 0;
  const pausedName = [...pausedWebhookRecipients][0];
  assert.ok(pausedName);
  await enqueueAttendanceNotifications(tx, {
    recordId: "record-2", type: "OUT", employeeName: pausedName,
    employeeEmail: "paused@example.test", timestamp: new Date("2026-11-09T09:00:00Z"),
  });
  assert.equal(items.length, 2);
  assert.equal(items[0]?.audience, "operations");
});

test("request, approval, rejection and representative registration use distinct truthful events", async () => {
  const { enqueueAbsenceStatusNotifications } = await import("./hrNotifications");
  const items: Array<Record<string, unknown>> = [];
  const tx = { hrNotificationOutbox: { create: async ({ data }: { data: Record<string, unknown> }) => { items.push(data); } } } as unknown as Prisma.TransactionClient;
  const base = { kind: "leave" as const, requestId: "request-1", employeeName: "테스트직원", employeeEmail: "staff@example.test", description: "2026-11-13 연차" };
  await enqueueAbsenceStatusNotifications(tx, { ...base, status: "PENDING" });
  assert.equal(items.length, 2); assert.match(String(items[0]?.message), /^휴가 신청이 접수되었습니다/);
  assert.equal(items[1]?.recipientEmail, "executive@example.test");
  items.length = 0;
  await enqueueAbsenceStatusNotifications(tx, { ...base, status: "REGISTERED" });
  assert.equal(items.length, 1); assert.match(String(items[0]?.message), /^휴가가 등록되었습니다/);
  assert.doesNotMatch(String(items[0]?.message), /신청|대기/);
  items.length = 0;
  await enqueueAbsenceStatusNotifications(tx, { ...base, status: "REJECTED" });
  assert.equal(items.length, 1); assert.match(String(items[0]?.message), /^휴가가 반려되었습니다/);
  items.length = 0;
  await enqueueAbsenceStatusNotifications(tx, { ...base, kind: "business-trip", status: "APPROVED" });
  assert.equal(items.length, 2); assert.match(String(items[0]?.message), /^출장이 승인되었습니다/);
  assert.doesNotMatch(String(items[0]?.message), /테스트직원/);
});
