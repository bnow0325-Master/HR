import { prisma } from "@/lib/prisma";

export const pausedWebhookRecipients = new Set(["손근혁", "박관식"]);

function webhookRecipientPaused(name: string | null | undefined) {
  return Boolean(name && pausedWebhookRecipients.has(name.trim()));
}

function configuredWebhook() {
  const url = process.env.WORKBOARD_STAFF_CHAT_WEBHOOK_URL?.trim();
  const token = process.env.WORKBOARD_STAFF_CHAT_WEBHOOK_TOKEN?.trim();
  if (!url || !token) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return { url: parsed.toString(), token };
  } catch {
    return null;
  }
}

type GeneralApprovalNotification = {
  documentId: string;
  documentNo: string;
  title: string;
  templateName: string;
  requesterEmail: string;
  requesterName: string;
};

async function sendGeneralApprovalMessage(input: {
  idempotencyKey: string;
  recipientEmail: string;
  recipientName?: string;
  title: string;
  message: string;
  documentId: string;
}) {
  if (webhookRecipientPaused(input.recipientName)) return;
  const webhook = configuredWebhook();
  if (!webhook) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const origin = (process.env.APPROVAL_ORIGIN?.trim() || "https://approval.bnow.co.kr").replace(/\/$/, "");
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${webhook.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotencyKey: input.idempotencyKey,
        recipientEmail: input.recipientEmail,
        senderName: "BNOW 결재",
        title: input.title,
        message: input.message,
        pageUrl: `${origin}/?focus=${encodeURIComponent(input.documentId)}`,
        audience: "work",
        type: "confirm_request",
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`WorkBoard webhook returned ${response.status}`);
  } catch {
    console.warn("WorkBoard general approval notification could not be sent.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyCeoAboutApprovalDocument(
  notification: GeneralApprovalNotification,
) {
  const recipientEmail = process.env.APPROVAL_CEO_EMAIL?.trim().toLowerCase()
    || "elon.choo@bnow.co.kr";
  await sendGeneralApprovalMessage({
    idempotencyKey: `approval-submit-${notification.documentId}`,
    recipientEmail,
    title: `${notification.templateName} 결재 요청`,
    message: `${notification.requesterName}님이 ${notification.title} 문서를 대표이사 결재로 상신했습니다. (${notification.documentNo})`,
    documentId: notification.documentId,
  });
}

export async function notifyRequesterAboutApprovalDocument(
  notification: GeneralApprovalNotification & {
    decision: "APPROVED" | "REJECTED";
    decisionNote: string | null;
  },
) {
  const decisionLabel = notification.decision === "APPROVED" ? "승인" : "반려";
  const note = notification.decisionNote ? `\n결재 의견: ${notification.decisionNote}` : "";
  await sendGeneralApprovalMessage({
    idempotencyKey: `approval-decision-${notification.documentId}-${notification.decision}`,
    recipientEmail: notification.requesterEmail,
    recipientName: notification.requesterName,
    title: `${notification.templateName} ${decisionLabel}`,
    message: `${notification.title} 문서가 대표이사 ${decisionLabel} 처리되었습니다. (${notification.documentNo})${note}`,
    documentId: notification.documentId,
  });
}
