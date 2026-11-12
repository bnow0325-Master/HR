import { CHRO_KEY_PREFIX, CHRO_SENDER_NAME } from "@/lib/hrChroTransport";
import { prisma } from "@/lib/prisma";
import { startOfKstDate } from "@/lib/annualLeave";
import { CEO_EMAIL, kstDate } from "@/lib/hrNotifications";
import { morningWindow } from "@/lib/hrNotificationRules";

function addDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function leaveLabel(type: string) {
  return type === "ANNUAL" ? "연차" : type === "AM_HALF" ? "오전 반차" : "오후 반차";
}

export async function enqueueDueHrSummary(now = new Date()) {
  const { date, due, monday } = morningWindow(now);
  if (!due) return { due: false, date };
  const endDate = addDate(date, monday ? 7 : 1);
  const start = startOfKstDate(date);
  const end = startOfKstDate(endDate);
  if (!start || !end) throw new Error("invalid KST summary date");
  const [leaves, trips] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: "APPROVED", leaveDate: { gte: start, lt: end }, employee: { active: true } },
      include: { employee: { select: { name: true } } }, orderBy: [{ leaveDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.businessTrip.findMany({
      where: { status: "APPROVED", startDate: { lt: end }, endDate: { gte: start }, employee: { active: true } },
      include: { employee: { select: { name: true } } }, orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  if (!monday && leaves.length === 0 && trips.length === 0) {
    // Record the 09:00 decision so later approvals do not produce a stale morning digest.
    await prisma.hrNotificationOutbox.createMany({ data: [{
      idempotencyKey: `${CHRO_KEY_PREFIX}hr-summary-ceo-day-${date}`, recipientEmail: CEO_EMAIL,
      audience: "operations", senderName: CHRO_SENDER_NAME, title: "오늘 휴가·출장",
      message: "해당 일정 없음", status: "SKIPPED",
    }], skipDuplicates: true });
    return { due: true, date, queued: false };
  }
  const leaveText = leaves.map((row) => `${row.employee.name} ${kstDate(row.leaveDate)} ${leaveLabel(row.leaveType)}`);
  const tripText = trips.map((row) => `${row.employee.name} ${kstDate(row.startDate)}~${kstDate(row.endDate)}`);
  const title = monday ? "이번 주 휴가·출장 예정" : "오늘 휴가·출장";
  const message = [monday ? `${date}~${addDate(date, 6)}` : date,
    `휴가: ${leaveText.length ? leaveText.join(", ") : "없음"}`,
    `출장: ${tripText.length ? tripText.join(", ") : "없음"}`].join("\n");
  const result = await prisma.hrNotificationOutbox.createMany({
    data: [{
      idempotencyKey: `${CHRO_KEY_PREFIX}hr-summary-ceo-${monday ? "week" : "day"}-${date}`,
      recipientEmail: CEO_EMAIL, audience: "operations", senderName: CHRO_SENDER_NAME, title, message,
    }], skipDuplicates: true,
  });
  return { due: true, date, queued: result.count === 1 };
}
