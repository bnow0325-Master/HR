import { prisma } from "@/lib/prisma";

type ApprovalRequestKind = "leave" | "business-trip";

type ApprovalNotification = {
  kind: ApprovalRequestKind;
  requestId: string;
  employeeName: string;
  employeeCode: string;
  description: string;
};

type ApprovalDecisionNotification = ApprovalNotification & {
  employeeEmail: string | null;
  decision: "APPROVED" | "REJECTED";
  reviewerNote: string | null;
};

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

function approvalPageUrl(kind: ApprovalRequestKind, requestId: string) {
  const origin = (process.env.HR_PUBLIC_ORIGIN?.trim() || "https://hr.bnow.co.kr")
    .replace(/\/$/, "");
  return `${origin}/admin/approvals?focus=${kind}:${encodeURIComponent(requestId)}`;
}

/**
 * WorkBoard UI is intentionally not coupled to HR. This server-to-server webhook
 * creates a BnowTalk message only when its shared inbound token is configured.
 */
export async function notifyAdminsAboutApprovalRequest(
  notification: ApprovalNotification,
) {
  try {
    const webhook = configuredWebhook();
    if (!webhook) {
      console.warn("HR approval notification skipped: WorkBoard webhook is not configured.");
      return;
    }

    const admins = await prisma.employee.findMany({
    where: {
      active: true,
      systemRole: "ADMIN",
      workboardEnabled: true,
      email: { not: null },
    },
    select: { email: true },
  });

    const recipientEmails = admins.flatMap((admin) =>
    admin.email?.trim() ? [admin.email.trim()] : [],
  );
    if (recipientEmails.length === 0) {
    console.warn("HR approval notification skipped: no active WorkBoard administrator found.");
    return;
  }

    const kindLabel = notification.kind === "leave" ? "휴가" : "출장";
    const pageUrl = approvalPageUrl(notification.kind, notification.requestId);

    const results = await Promise.allSettled(
    recipientEmails.map(async (recipientEmail) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${webhook.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            idempotencyKey: `hr-${notification.kind}-${notification.requestId}-${recipientEmail}`,
            recipientEmail,
            senderName: "BNOW 인사관리",
            title: `${kindLabel} 승인 요청`,
            message: `${notification.employeeName}(${notification.employeeCode})님이 ${notification.description} 신청했습니다. 인사관리에서 승인 또는 반려해 주세요.`,
            pageUrl,
            type: "confirm_request",
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`WorkBoard webhook returned ${response.status}`);
        }
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

    if (results.some((result) => result.status === "rejected")) {
      console.warn("HR approval notification was not delivered to every administrator.");
    }
  } catch {
    // Approval requests must never fail because the optional chat integration is unavailable.
    console.warn("HR approval notification could not be sent.");
  }
}

/**
 * 결재 결과는 신청자 본인에게만 비노우톡으로 전달한다. 결재 처리는 알림
 * 전달 실패와 분리되어 있으므로, 채팅 장애가 승인/반려 상태를 되돌리지 않는다.
 */
export async function notifyEmployeeAboutApprovalDecision(
  notification: ApprovalDecisionNotification,
) {
  try {
    const webhook = configuredWebhook();
    const recipientEmail = notification.employeeEmail?.trim();
    if (!webhook || !recipientEmail) return;

    const kindLabel = notification.kind === "leave" ? "휴가" : "출장";
    const decisionLabel = notification.decision === "APPROVED" ? "승인" : "반려";
    const resultLabel = notification.decision === "APPROVED" ? "결재 완료" : "결재 반려";
    const note = notification.reviewerNote
      ? `\n결재 메모: ${notification.reviewerNote}`
      : "";
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${webhook.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotencyKey: `hr-decision-${notification.kind}-${notification.requestId}-${notification.decision}`,
        recipientEmail,
        senderName: "BNOW 인사관리",
        title: `${kindLabel} ${resultLabel}`,
        message: `신청하신 ${notification.description} ${kindLabel}가 ${decisionLabel}되었습니다.${note}`,
        pageUrl: `${(process.env.HR_PUBLIC_ORIGIN?.trim() || "https://hr.bnow.co.kr").replace(/\/$/, "")}/${notification.kind === "leave" ? "leave" : "business-trips"}`,
        audience: "work",
        type: "confirm_request",
      }),
    });
    if (!response.ok) {
      console.warn("HR approval decision notification could not be delivered.");
    }
  } catch {
    console.warn("HR approval decision notification could not be sent.");
  }
}
