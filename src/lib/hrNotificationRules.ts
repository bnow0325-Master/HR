export function kstDate(date: Date): string {
  return new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function kstTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit",
    minute: "2-digit", hour12: false,
  }).format(date);
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
