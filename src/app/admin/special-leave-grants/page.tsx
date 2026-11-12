import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";
import SpecialLeaveGrantForm from "./SpecialLeaveGrantForm";

export const dynamic = "force-dynamic";

export default async function SpecialLeaveGrantsPage() {
  const admin = await getCurrentWorkboardEmployee("any");
  const ceoEmail = (process.env.APPROVAL_CEO_EMAIL?.trim() || "elon.choo@bnow.co.kr").toLowerCase();
  if (!admin || admin.email?.toLowerCase() !== ceoEmail || admin.systemRole !== "ADMIN" || !admin.workboardEnabled) redirect("/admin");
  const [employees, grants] = await Promise.all([
    prisma.employee.findMany({ where: { active: true, leaveEnabled: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.specialLeaveGrant.findMany({ include: { employee: { select: { name: true, code: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <main className="mx-auto max-w-3xl p-6">
    <a href="/admin" className="text-sm text-slate-500">← 관리자 대시보드</a>
    <h1 className="mt-5 text-2xl font-bold text-slate-900">별도 유급 특별휴가 부여</h1>
    <p className="mt-2 text-sm text-slate-600">연차와 별도로 1일을 부여하고 근무일·사유·승인자를 기록합니다. 휴일근로 임금 정산은 별도로 확인해야 합니다.</p>
    <SpecialLeaveGrantForm employees={employees} today={today} />
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold text-slate-900">최근 부여 내역</h2>
      {grants.length === 0 ? <p className="mt-3 text-sm text-slate-500">부여 내역이 없습니다.</p> : <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {grants.map((grant) => <li key={grant.id} className="py-3">
          <span className="font-semibold">{grant.employee.name} · {grant.employee.code}</span> · 근무일 {grant.sourceWorkDate.toISOString().slice(0, 10)} · 1일
          <p className="mt-1 text-slate-600">{grant.reason}</p>
        </li>)}
      </ul>}
    </section>
  </main>;
}
