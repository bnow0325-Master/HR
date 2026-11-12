import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";
import LeaveRegistrationForm from "./LeaveRegistrationForm";

export const dynamic = "force-dynamic";

export default async function LeaveRegistrationPage() {
  const admin = await getCurrentWorkboardEmployee("any");
  const ceoEmail = (process.env.APPROVAL_CEO_EMAIL?.trim() || "elon.choo@bnow.co.kr").toLowerCase();
  if (!admin || admin.email?.toLowerCase() !== ceoEmail || admin.systemRole !== "ADMIN" || !admin.workboardEnabled) redirect("/admin");
  const employees = await prisma.employee.findMany({ where: { active: true, leaveEnabled: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <main className="mx-auto max-w-2xl p-6">
    <a href="/admin" className="text-sm text-slate-500">← 관리자 대시보드</a>
    <h1 className="mt-5 text-2xl font-bold text-slate-900">직원 휴가 직접 등록</h1>
    <p className="mt-2 text-sm text-slate-600">대표이사가 직원의 휴가를 승인 상태로 등록합니다. 날짜 중복 및 잔여 한도를 확인하며 감사 기록을 남깁니다.</p>
    <LeaveRegistrationForm employees={employees} today={today} />
  </main>;
}
