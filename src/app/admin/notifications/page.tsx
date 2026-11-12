import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CEO_EMAIL } from "@/lib/hrNotifications";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";
import ConnectionCheck from "./ConnectionCheck";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const employee = await getCurrentWorkboardEmployee("any");
  if (employee?.email?.toLowerCase() !== CEO_EMAIL || !employee.active || !employee.workboardEnabled || employee.systemRole !== "ADMIN") {
    redirect("/admin");
  }
  const [pending, sending, sent, blocked] = await Promise.all([
    prisma.hrNotificationOutbox.count({ where: { status: "PENDING" } }),
    prisma.hrNotificationOutbox.count({ where: { status: "SENDING" } }),
    prisma.hrNotificationOutbox.count({ where: { status: "SENT" } }),
    prisma.hrNotificationOutbox.count({ where: { status: "BLOCKED" } }),
  ]);
  return <main className="mx-auto max-w-2xl p-6 text-slate-900">
    <Link href="/admin" className="text-sm text-blue-700">← 관리자 화면</Link>
    <h1 className="mt-6 text-2xl font-bold">인사 알림 상태</h1>
    <p className="mt-2 text-sm text-slate-600">출퇴근·휴가·출장 알림의 채팅 저장 상태입니다. 기기 푸시 도착 여부와는 다릅니다.</p>
    <dl className="mt-6 grid grid-cols-2 gap-3 text-center">
      <div className="rounded-lg border p-4"><dt>대기</dt><dd className="text-xl font-bold">{pending}</dd></div>
      <div className="rounded-lg border p-4"><dt>전송 중</dt><dd className="text-xl font-bold">{sending}</dd></div>
      <div className="rounded-lg border p-4"><dt>채팅 저장</dt><dd className="text-xl font-bold">{sent}</dd></div>
      <div className="rounded-lg border p-4"><dt>수신자 점검 필요</dt><dd className="text-xl font-bold">{blocked}</dd></div>
    </dl>
    <ConnectionCheck />
  </main>;
}
