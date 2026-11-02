const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstDayRange(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const calendar = new Date(utc);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  const start = new Date(utc - KST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 86400000) };
}

export function parseKstTime(date: string, time: unknown) {
  if (time === null || time === undefined || time === "") return null;
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return undefined;
  const range = kstDayRange(date);
  if (!range) return undefined;
  const [hour, minute] = time.split(":").map(Number);
  return new Date(range.start.getTime() + (hour * 60 + minute) * 60000);
}

export function correctionDateAllowed(date: string, now = new Date()) {
  const range = kstDayRange(date);
  if (!range) return false;
  return range.start.getTime() <= now.getTime()
    && now.getTime() - range.start.getTime() <= 366 * 86400000;
}

export function correctionConflict(
  existing: { type: string; timestamp: Date }[],
  checkInAt: Date | null,
  checkOutAt: Date | null,
) {
  const firstIn = existing.filter((item) => item.type === "IN").sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0];
  const lastOut = existing.filter((item) => item.type === "OUT").sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
  if ((checkInAt && firstIn) || (checkOutAt && lastOut)) return true;
  const effectiveIn = checkInAt ?? firstIn?.timestamp;
  const effectiveOut = checkOutAt ?? lastOut?.timestamp;
  return Boolean(effectiveIn && effectiveOut && effectiveIn.getTime() >= effectiveOut.getTime());
}
