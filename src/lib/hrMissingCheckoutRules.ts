import { kstDate, morningWindow } from "./hrNotificationRules";

const DAY = 86_400_000;
export type CheckoutEvent = { type: string; timestamp: Date; cancelledAt: Date | null };
export type MissingCheckoutDecision = "not-due" | "none" | "working" | "closed" | "review" | "missing";

/** Never use the report status label. Ambiguous/cancelled/multi-open sessions are
 * held for review. A still-open session remains working for its first 24 hours. */
export function missingCheckoutDecision(events: CheckoutEvent[], workDate: string, now: Date, absence = false): MissingCheckoutDecision {
  const age = Date.parse(`${kstDate(now)}T00:00:00Z`) - Date.parse(`${workDate}T00:00:00Z`);
  if (!morningWindow(now).due || age < DAY || age > 2 * DAY) return "not-due";
  if (absence) return "review";
  let open: Date | null = null; let targetIn = false; let ambiguous = false; let targetClosed = false;
  for (const event of [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
    if (event.timestamp > now) continue;
    const target = kstDate(event.timestamp) === workDate;
    if (event.cancelledAt) { if (target || (open && kstDate(open) === workDate)) ambiguous = true; continue; }
    if (event.type === "IN") {
      if (open && (target || kstDate(open) === workDate)) ambiguous = true;
      open = event.timestamp;
      if (target) targetIn = true;
    } else if (event.type === "OUT") {
      if (!open) { if (target) ambiguous = true; continue; }
      const duration = event.timestamp.getTime() - open.getTime();
      if (kstDate(open) === workDate) {
        if (duration < 0 || duration > DAY) ambiguous = true;
        else targetClosed = true;
      }
      open = null;
    } else if (target) ambiguous = true;
  }
  if (!targetIn) return "none";
  if (ambiguous) return "review";
  if (open && kstDate(open) === workDate) return now.getTime() - open.getTime() <= DAY ? "working" : "missing";
  return targetClosed ? "closed" : "review";
}
