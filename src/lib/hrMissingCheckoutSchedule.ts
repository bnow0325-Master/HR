import { prisma } from "@/lib/prisma";
import { startOfKstDate } from "@/lib/annualLeave";
import { kstDate, morningWindow } from "@/lib/hrNotificationRules";
import { CHRO_KEY_PREFIX, CHRO_SENDER_NAME, hrChroActivation } from "@/lib/hrChroTransport";
import { missingCheckoutDecision } from "@/lib/hrMissingCheckoutRules";

const DAY = 86_400_000;
function previousDate(now: Date, days: number) { return kstDate(new Date(now.getTime() - days * DAY)); }

async function decision(employeeId: string, workDate: string, now: Date) {
  const start = startOfKstDate(workDate);
  const activation = hrChroActivation();
  if (!start || !activation) return "review" as const;
  const [events, leaves, trips] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { employeeId, timestamp: { gte: new Date(start.getTime() - DAY), lte: now } }, orderBy: [{ timestamp: "asc" }, { id: "asc" }], select: { type: true, timestamp: true, cancelledAt: true } }),
    prisma.leaveRequest.count({ where: { employeeId, status: "APPROVED", leaveDate: { gte: start, lt: new Date(start.getTime() + DAY) } } }),
    prisma.businessTrip.count({ where: { employeeId, status: "APPROVED", startDate: { lt: new Date(start.getTime() + DAY) }, endDate: { gte: start } } }),
  ]);
  // No retrospective employee reminders when the feature is first activated.
  if (events.some((e) => e.type === "IN" && kstDate(e.timestamp) === workDate && e.timestamp < activation)) return "none" as const;
  return missingCheckoutDecision(events, workDate, now, leaves > 0 || trips > 0);
}

export async function enqueueDueMissingCheckouts(now = new Date()) {
  const activation = hrChroActivation();
  if (!activation || now < activation || !morningWindow(now).due) return { due: false, queued: 0, review: 0, working: 0 };
  let queued = 0; let review = 0; let working = 0;
  // Two dates cover a 23:59 IN without a historical backfill. Re-evaluate every tick.
  const employees = await prisma.employee.findMany({ where: { active: true, workboardEnabled: true, attendanceEnabled: true, email: { not: null } }, select: { id: true, email: true } });
  for (const employee of employees) {
    if (!employee.email?.trim()) continue;
    for (const days of [1, 2]) {
      const workDate = previousDate(now, days);
      const result = await decision(employee.id, workDate, now);
      if (result === "review") review++;
      if (result === "working") working++;
      if (result !== "missing") continue;
      const labelDate = workDate.replaceAll("-", ".");
      const prefix = days === 1 ? `어제(${labelDate})` : labelDate;
      const saved = await prisma.hrNotificationOutbox.createMany({ data: [{
        idempotencyKey: `${CHRO_KEY_PREFIX}missing-out:${workDate}:${employee.id}`,
        recipientEmail: employee.email.trim().toLowerCase(), audience: "work", senderName: CHRO_SENDER_NAME, status: "CHRO_PENDING",
        title: "퇴근 기록 확인", message: `${prefix} 퇴근 기록이 확인되지 않았습니다. 근무기록을 확인해 주세요.`,
      }], skipDuplicates: true });
      queued += saved.count;
    }
  }
  return { due: true, queued, review, working };
}

/** Re-read actual records immediately before sending; a completed/cancelled or
 * ambiguous session cannot send a stale reminder from a pending retry. */
export async function missingCheckoutStillDue(key: string, recipientEmail: string, now = new Date()) {
  const match = /^hr-chro-v1:missing-out:(\d{4}-\d{2}-\d{2}):([^:]+)$/.exec(key);
  if (!match) return false;
  const employee = await prisma.employee.findUnique({ where: { id: match[2] }, select: { active: true, workboardEnabled: true, attendanceEnabled: true, email: true } });
  if (!employee?.active || !employee.workboardEnabled || !employee.attendanceEnabled || employee.email?.trim().toLowerCase() !== recipientEmail.toLowerCase()) return false;
  return await decision(match[2], match[1], now) === "missing";
}
