import { timingSafeEqual } from "node:crypto";
import { enqueueDueHrSummary } from "@/lib/hrNotificationSchedule";
import { dispatchPendingHrNotifications } from "@/lib/hrNotifications";

export const dynamic = "force-dynamic";

function authorized(header: string | null) {
  const expected = process.env.HR_NOTIFICATION_CRON_TOKEN?.trim() || "";
  const received = /^Bearer (.+)$/i.exec(header || "")?.[1]?.trim() || "";
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return Boolean(expected && received && left.length === right.length && timingSafeEqual(left, right));
}

/** Call every 1–5 minutes; the outbox and date key prevent duplicate messages. */
export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await enqueueDueHrSummary();
  const delivery = await dispatchPendingHrNotifications(10);
  return Response.json({ summary, delivery }, { headers: { "Cache-Control": "no-store" } });
}
