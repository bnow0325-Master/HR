import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { chatSaved, kstTime, privateHrChannel } from "@/lib/hrNotificationRules";
import { pausedWebhookRecipients } from "@/lib/workboardApprovalNotifications";

export { kstDate, kstTime } from "@/lib/hrNotificationRules";

export const CEO_EMAIL = (process.env.APPROVAL_CEO_EMAIL?.trim() || "elon.choo@bnow.co.kr").toLowerCase();

async function enqueue(
  tx: Prisma.TransactionClient,
  input: { key: string; recipientEmail: string; audience: "work" | "operations"; title: string; message: string },
) {
  await tx.hrNotificationOutbox.create({ data: {
    idempotencyKey: input.key,
    recipientEmail: input.recipientEmail.toLowerCase(),
    audience: input.audience,
    senderName: "[BNOW]",
    title: input.title,
    message: input.message,
  } });
}

export async function enqueueAttendanceNotifications(
  tx: Prisma.TransactionClient,
  input: { recordId: string; type: "IN" | "OUT" | "CANCEL_OUT"; employeeName: string; employeeEmail: string | null; timestamp: Date },
) {
  const label = input.type === "IN" ? "출근 등록" : input.type === "OUT" ? "퇴근 등록" : "퇴근 등록 취소";
  const when = kstTime(input.timestamp);
  await enqueue(tx, {
    key: `hr-attendance-ceo-${input.type}-${input.recordId}`,
    recipientEmail: CEO_EMAIL,
    audience: "operations",
    title: label,
    message: `${input.employeeName}님 ${label} · ${when}`,
  });
  if (input.employeeEmail?.trim() && !pausedWebhookRecipients.has(input.employeeName.trim())) {
    await enqueue(tx, {
      key: `hr-attendance-self-${input.type}-${input.recordId}`,
      recipientEmail: input.employeeEmail.trim(),
      audience: "work",
      title: label,
      message: `본인의 ${label}이 완료되었습니다. · ${when}`,
    });
  }
}

export async function enqueueApprovedAbsenceNotification(
  tx: Prisma.TransactionClient,
  input: { kind: "leave" | "business-trip"; requestId: string; employeeName: string; description: string },
) {
  const label = input.kind === "leave" ? "휴가 승인" : "출장 승인";
  await enqueue(tx, {
    key: `hr-absence-ceo-${input.kind}-${input.requestId}-APPROVED`,
    recipientEmail: CEO_EMAIL,
    audience: "operations",
    title: label,
    message: `${input.employeeName}님 ${label} · ${input.description}`,
  });
}

function webhookConfig() {
  const url = process.env.WORKBOARD_STAFF_CHAT_WEBHOOK_URL?.trim();
  const token = process.env.WORKBOARD_STAFF_CHAT_WEBHOOK_TOKEN?.trim();
  if (!url || !token) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
    return { url, token };
  } catch { return null; }
}

/** The inbound chat API keeps the same key idempotent across retries. */
export async function dispatchPendingHrNotifications(limit = 10, onlyKey?: string) {
  const config = webhookConfig();
  if (!config) return { sent: 0, failed: 0, pending: await prisma.hrNotificationOutbox.count({ where: { status: { in: ["PENDING", "SENDING"] } } }), configured: false };
  const now = new Date();
  const rows = await prisma.hrNotificationOutbox.findMany({
    where: { status: { in: ["PENDING", "SENDING"] }, nextAttemptAt: { lte: now },
      ...(onlyKey ? { idempotencyKey: onlyKey } : {}) },
    orderBy: { createdAt: "asc" }, take: Math.min(Math.max(limit, 1), 100),
  });
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const claimed = await prisma.hrNotificationOutbox.updateMany({
      where: { id: row.id, status: row.status, nextAttemptAt: { lte: now } },
      data: { status: "SENDING", attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 120_000) },
    });
    if (claimed.count !== 1) continue;
    let error = "delivery failed";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      let response: Response;
      try {
        response = await fetch(config.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: row.idempotencyKey, recipientEmail: row.recipientEmail,
            audience: row.audience, senderName: row.senderName, title: row.title,
            message: row.message, type: "confirm_request",
            ...(privateHrChannel(row, CEO_EMAIL) ? { channel: "hr" } : {}),
          }),
          signal: controller.signal,
        });
      } finally { clearTimeout(timeout); }
      if (response.ok) {
        const result: { chatOk?: boolean; messageSeq?: number | null; roomId?: string | null } = await response.json();
        if (chatSaved(result)) {
          await prisma.hrNotificationOutbox.update({ where: { id: row.id }, data: {
            status: "SENT", sentAt: new Date(), lastError: null,
            remoteRoomId: result.roomId || null, remoteMessageSeq: result.messageSeq,
          } });
          sent++;
          continue;
        }
        error = "chat not accepted";
      } else error = `webhook HTTP ${response.status}`;
    } catch { error = "webhook unavailable"; }
    failed++;
    await prisma.hrNotificationOutbox.update({ where: { id: row.id }, data: {
      status: "PENDING", lastError: error,
      nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** Math.min(row.attempts, 7))),
    } });
  }
  return { sent, failed, pending: await prisma.hrNotificationOutbox.count({ where: { status: { in: ["PENDING", "SENDING"] } } }), configured: true };
}
