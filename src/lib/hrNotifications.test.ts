import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";

process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:3306/test";

test("one attendance save queues CEO and only the allowed employee", async () => {
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
  assert.equal(items[0]?.idempotencyKey, "hr-attendance-ceo-IN-record-1");
  assert.equal(items[1]?.idempotencyKey, "hr-attendance-self-IN-record-1");
  assert.equal(items[0]?.senderName, "[BNOW]");

  items.length = 0;
  const pausedName = [...pausedWebhookRecipients][0];
  assert.ok(pausedName);
  await enqueueAttendanceNotifications(tx, {
    recordId: "record-2", type: "OUT", employeeName: pausedName,
    employeeEmail: "paused@example.test", timestamp: new Date("2026-11-09T09:00:00Z"),
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.audience, "operations");
});
