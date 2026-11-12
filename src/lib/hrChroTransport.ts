import { createHmac } from "node:crypto";

export const CHRO_SENDER_NAME = "AI CHRO · 인사";
export const CHRO_KEY_PREFIX = "hr-chro-v1:";
/** Explicit deployment cutover; never infer activation from elapsed clock time. */
export function hrChroActivation() {
  const raw = process.env.HR_CHRO_NOTIFICATIONS_START_AT?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}
export function hrChatDeliveryConfig(rawUrl: string | undefined, secret: string | undefined, chro: boolean) {
  if (!rawUrl?.trim() || !secret?.trim()) return null;
  try {
    const url = new URL(rawUrl.trim());
    if (url.origin !== "https://chat.bnow.co.kr" || url.pathname !== "/api/staff-chat/webhooks/incoming" || url.username || url.password || url.search || url.hash) return null;
    return {
      url: chro ? `${url.origin}/api/staff-chat/ai-executives/chro/employee-messages` : url.href,
      token: chro ? createHmac("sha256", secret.trim()).update("bnowtalk-ai-executive:v1:chro").digest("hex") : secret.trim(),
    };
  } catch { return null; }
}
