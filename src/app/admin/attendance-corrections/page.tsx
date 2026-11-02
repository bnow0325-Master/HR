import { redirect } from "next/navigation";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";
import CorrectionQueue from "./CorrectionQueue";

export const dynamic = "force-dynamic";

export default async function AdminAttendanceCorrectionsPage() {
  const employee = await getCurrentWorkboardEmployee("any");
  if (!employee || employee.systemRole !== "ADMIN") redirect("/admin/login");
  const representativeEmail = process.env.APPROVAL_CEO_EMAIL?.trim().toLowerCase() || "elon.choo@bnow.co.kr";
  if (employee.email?.toLowerCase() !== representativeEmail) redirect("/admin");
  return <CorrectionQueue />;
}
