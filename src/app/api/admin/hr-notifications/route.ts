import { prisma } from "@/lib/prisma";
import { CEO_EMAIL, dispatchPendingHrNotifications, kstDate } from "@/lib/hrNotifications";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

async function authorized() {
  const employee = await getCurrentWorkboardEmployee("any");
  return employee?.email?.toLowerCase() === CEO_EMAIL && employee.active && employee.workboardEnabled && employee.systemRole === "ADMIN";
}

export async function GET() {
  if (!(await authorized())) return Response.json({ error: "forbidden" }, { status: 403 });
  const [pending, sending, sent] = await Promise.all([
    prisma.hrNotificationOutbox.count({ where: { status: "PENDING" } }),
    prisma.hrNotificationOutbox.count({ where: { status: "SENDING" } }),
    prisma.hrNotificationOutbox.count({ where: { status: "SENT" } }),
  ]);
  return Response.json({ pending, sending, sent }, { headers: { "Cache-Control": "private, no-store" } });
}

/** One fixed, harmless connection check per KST day. No caller-supplied recipient or message. */
export async function POST() {
  if (!(await authorized())) return Response.json({ error: "forbidden" }, { status: 403 });
  const key = `hr-ceo-connection-${kstDate(new Date())}`;
  await prisma.hrNotificationOutbox.createMany({ data: [{
    idempotencyKey: key, recipientEmail: CEO_EMAIL, audience: "operations",
    senderName: "[BNOW]", title: "인사 알림 연결 확인",
    message: "대표 전용 인사 알림 채팅 연결을 확인합니다. 실제 출퇴근·휴가·출장 기록은 생성되지 않았습니다.",
  }], skipDuplicates: true });
  const delivery = await dispatchPendingHrNotifications(1, key);
  const status = await prisma.hrNotificationOutbox.findUnique({
    where: { idempotencyKey: key }, select: { status: true, remoteRoomId: true, remoteMessageSeq: true },
  });
  return Response.json({ connection: status, delivery }, { headers: { "Cache-Control": "private, no-store" } });
}
