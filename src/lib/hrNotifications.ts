import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { chatSaved, kstTime, compactHrDates } from "@/lib/hrNotificationRules";
import { CHRO_KEY_PREFIX, CHRO_SENDER_NAME, hrChatDeliveryConfig, hrChroActivation } from "@/lib/hrChroTransport";
import { missingCheckoutStillDue } from "@/lib/hrMissingCheckoutSchedule";

export { kstDate, kstTime } from "@/lib/hrNotificationRules";

export const CEO_EMAIL = (process.env.APPROVAL_CEO_EMAIL?.trim() || "elon.choo@bnow.co.kr").toLowerCase();

async function enqueue(
  tx: Prisma.TransactionClient,
  input: { key: string; recipientEmail: string; audience: "work" | "operations"; title: string; message: string },
) {
  await tx.hrNotificationOutbox.create({ data: {
    idempotencyKey: `${CHRO_KEY_PREFIX}${input.key}`,
    recipientEmail: input.recipientEmail.toLowerCase(),
    audience: input.audience,
    senderName: CHRO_SENDER_NAME,
    status: "CHRO_PENDING",
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
    message: `${input.employeeName}님 ${label} · ${input.type === "CANCEL_OUT" ? "원래 퇴근 시각: " : ""}${when}`,
  });
  if (input.employeeEmail?.trim()) {
    await enqueue(tx, {
      key: `hr-attendance-self-${input.type}-${input.recordId}`,
      recipientEmail: input.employeeEmail.trim(),
      audience: "work",
      title: label,
      message: `${input.type === "IN" ? "출근이 등록되었습니다." : input.type === "OUT" ? "퇴근이 등록되었습니다." : "퇴근 등록이 취소되었습니다."}\n${input.type === "CANCEL_OUT" ? "취소한 퇴근 시각" : "등록 시각"}: ${when} (한국시간)`,
    });
  }
}

export async function enqueueAbsenceStatusNotifications(
  tx: Prisma.TransactionClient,
  input: { kind: "leave" | "business-trip"; requestId: string; employeeName: string; employeeEmail: string | null; description: string; status: "PENDING" | "APPROVED" | "REJECTED" | "REGISTERED" },
) {
  const label = input.kind === "leave" ? "휴가" : "출장";
  const state = input.status === "REGISTERED" ? "등록되었습니다." : input.status === "APPROVED" ? "승인되었습니다." : "반려되었습니다.";
  const text = input.status === "PENDING" ? `${label} 신청이 접수되었습니다.` : `${label}${input.kind === "leave" ? "가" : "이"} ${state}`;
  if (input.employeeEmail?.trim()) await enqueue(tx, {
    key: `absence:${input.kind}:${input.requestId}:${input.status}:self`, recipientEmail: input.employeeEmail.trim(), audience: "work",
    title: text, message: `${text}\n일정: ${compactHrDates(input.description)} (한국시간)`,
  });
  if (input.status === "PENDING") await enqueue(tx, {
    key: `absence:${input.kind}:${input.requestId}:PENDING:ceo`, recipientEmail: CEO_EMAIL, audience: "operations",
    title: `${label} 승인 요청`, message: `${input.employeeName}님 ${label} 신청이 접수되었습니다.\n대상 일정(KST): ${input.description}\n인사관리에서 승인 또는 반려해 주세요.\nhttps://approval.bnow.co.kr/`,
  });
  if (input.status === "APPROVED") await enqueueApprovedAbsenceNotification(tx, input);
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

function webhookConfig(chro = false) {
  return hrChatDeliveryConfig(process.env.WORKBOARD_STAFF_CHAT_WEBHOOK_URL, process.env.WORKBOARD_STAFF_CHAT_WEBHOOK_TOKEN, chro);
}

async function eventStillCurrent(key: string, recipientEmail: string) {
  const missing = /^hr-chro-v1:missing-out:/.test(key);
  if (missing) return missingCheckoutStillDue(key, recipientEmail);
  const absence = /^hr-chro-v1:absence:(leave|business-trip):([^:]+):(PENDING|APPROVED|REJECTED|REGISTERED):(self|ceo)$/.exec(key);
  if (absence) {
    const row = absence[1] === "leave"
      ? await prisma.leaveRequest.findUnique({ where: { id: absence[2] }, include: { employee: true } })
      : await prisma.businessTrip.findUnique({ where: { id: absence[2] }, include: { employee: true } });
    if (!row || !row.employee.active || row.status !== (absence[3] === "REGISTERED" ? "APPROVED" : absence[3])) return false;
    if (absence[4] === "self" && row.employee.email?.trim().toLowerCase() !== recipientEmail.toLowerCase()) return false;
  }
  const attendance = /^hr-chro-v1:hr-attendance-(self|ceo)-(IN|OUT|CANCEL_OUT)-(.+)$/.exec(key);
  if (attendance) {
    const row = await prisma.attendanceRecord.findUnique({ where: { id: attendance[3] }, include: { employee: true } });
    if (!row || !row.employee.active || (attendance[2] === "CANCEL_OUT" ? !row.cancelledAt : Boolean(row.cancelledAt))) return false;
    if (attendance[1] === "self" && row.employee.email?.trim().toLowerCase() !== recipientEmail.toLowerCase()) return false;
  }
  return true;
}

/** The inbound chat API keeps the same key idempotent across retries. */
export async function dispatchPendingHrNotifications(limit = 10, onlyKey?: string) {
  const config = webhookConfig();
  if (!config) return { sent: 0, failed: 0, pending: await prisma.hrNotificationOutbox.count({ where: { status: { in: ["PENDING", "SENDING", "CHRO_PENDING", "CHRO_SENDING"] } } }), configured: false };
  const now = new Date();
  const rows = await prisma.hrNotificationOutbox.findMany({
    where: { status: { in: ["PENDING", "SENDING", "CHRO_PENDING", "CHRO_SENDING"] }, nextAttemptAt: { lte: now },
      ...(onlyKey ? { idempotencyKey: onlyKey } : {}) },
    orderBy: { createdAt: "asc" }, take: Math.min(Math.max(limit, 1), 100),
  });
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const chro = row.idempotencyKey.startsWith(CHRO_KEY_PREFIX);
    const activation = hrChroActivation();
    if (chro && (!activation || now < activation)) continue;
    const claimed = await prisma.hrNotificationOutbox.updateMany({
      where: { id: row.id, status: row.status, nextAttemptAt: { lte: now } },
      data: { status: chro ? "CHRO_SENDING" : "SENDING", attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 120_000) },
    });
    if (claimed.count !== 1) continue;
    if (chro && (row.createdAt < activation! || !await eventStillCurrent(row.idempotencyKey, row.recipientEmail))) {
      await prisma.hrNotificationOutbox.update({ where: { id: row.id }, data: { status: "SKIPPED", lastError: "event superseded or recipient unavailable" } });
      continue;
    }
    const destination = webhookConfig(chro)!;
    let error = "delivery failed";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      let response: Response;
      try {
        response = await fetch(destination.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${destination.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(chro ? {
            idempotencyKey: row.idempotencyKey, recipientEmail: row.recipientEmail,
            message: row.message.replace(/^어제\((\d{4}\.\d{2}\.\d{2})\)/, (text, date: string) => date.replaceAll(".", "-") === new Date(now.getTime() - 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10) ? text : date).slice(0, 4000),
          } : {
            idempotencyKey: row.idempotencyKey, recipientEmail: row.recipientEmail,
            audience: row.audience, senderName: row.senderName, title: row.title,
            message: row.message, type: "confirm_request",
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
      } else {
        if (chro && response.status === 404) {
          const result = await response.json().catch(() => null) as { error?: unknown } | null;
          if (result?.error === "recipient not found") {
            await prisma.hrNotificationOutbox.update({ where: { id: row.id }, data: { status: "BLOCKED", lastError: "recipient unavailable; administrator review required" } });
            failed++;
            continue;
          }
        }
        error = `webhook HTTP ${response.status}`;
      }
    } catch { error = "webhook unavailable"; }
    failed++;
    await prisma.hrNotificationOutbox.update({ where: { id: row.id }, data: {
      status: chro ? "CHRO_PENDING" : "PENDING", lastError: error,
      nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** Math.min(row.attempts, 7))),
    } });
  }
  return { sent, failed, pending: await prisma.hrNotificationOutbox.count({ where: { status: { in: ["PENDING", "SENDING", "CHRO_PENDING", "CHRO_SENDING"] } } }), configured: true, chroConfigured: Boolean(hrChroActivation()) };
}
