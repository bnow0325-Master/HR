export function kstDate(date: Date): string {
  return new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function kstTime(date: Date): string {
  return new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 16).replaceAll("-", ".").replace("T", " ");
}

export function compactHrDates(description: string) {
  return description.replace(/\b(\d{4})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})\.?/g, (_match, y: string, m: string, d: string) => `${y}.${m.padStart(2, "0")}.${d.padStart(2, "0")}`);
}

export function morningWindow(now: Date) {
  const date = kstDate(now);
  const shifted = new Date(now.getTime() + 9 * 3_600_000);
  return { date, due: shifted.getUTCHours() >= 9, monday: shifted.getUTCDay() === 1 };
}

export function chatSaved(value: unknown): value is { chatOk: true; messageSeq: number; roomId?: string | null } {
  if (!value || typeof value !== "object") return false;
  const item = value as { chatOk?: unknown; messageSeq?: unknown };
  return item.chatOk === true && typeof item.messageSeq === "number" && Number.isSafeInteger(item.messageSeq) && item.messageSeq > 0;
}
