import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { syncCompanyIdentity } from "@/lib/companyIdentity";
import { employeeSelect } from "@/lib/employeeData";
import { prisma } from "@/lib/prisma";

const BATCH_SIZE = 5;

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "관리자 인증이 필요합니다." },
      { status: 401 },
    );
  }

  const employees = await prisma.employee.findMany({
    orderBy: { code: "asc" },
    select: employeeSelect,
  });
  const results: Array<{
    employeeId: string;
    code: string;
    state: "synced" | "disabled" | "skipped" | "failed";
    message: string;
  }> = [];

  for (let offset = 0; offset < employees.length; offset += BATCH_SIZE) {
    const batch = employees.slice(offset, offset + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (employee) => ({
        employee,
        result: await syncCompanyIdentity(employee),
      })),
    );
    for (const { employee, result } of batchResults) {
      results.push({
        employeeId: employee.id,
        code: employee.code,
        state: result.state,
        message: result.message,
      });
    }
  }

  const summary = {
    total: results.length,
    synced: results.filter((result) => result.state === "synced").length,
    disabled: results.filter((result) => result.state === "disabled").length,
    skipped: results.filter((result) => result.state === "skipped").length,
    failed: results.filter((result) => result.state === "failed").length,
  };

  return NextResponse.json({ ok: summary.failed === 0, summary, results });
}

