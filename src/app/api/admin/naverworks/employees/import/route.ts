import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";
import { parseNaverWorksEmployeeRosterWorkbook } from "@/lib/naverworksEmployeeRoster";
import { buildNaverWorksEmployeeSyncPlan } from "@/lib/naverworksEmployeeSync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const current = await getCurrentWorkboardEmployee("any");
  if (current?.systemRole !== "ADMIN") return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "네이버웍스에서 내려받은 .xlsx 파일을 선택해 주세요." }, { status: 400 });
  }

  try {
    const rows = parseNaverWorksEmployeeRosterWorkbook(Buffer.from(await file.arrayBuffer()));
    const employees = await prisma.employee.findMany({
      select: { id: true, code: true, name: true, email: true, externalLoginId: true, active: true },
    });
    const plan = buildNaverWorksEmployeeSyncPlan(rows, employees);
    const mappings = plan.items.filter((item) => item.action === "MAP_LOGIN" && item.employee);

    await prisma.$transaction(
      mappings.map((item) =>
        prisma.employee.update({
          where: { id: item.employee!.id },
          data: { externalLoginId: item.row.loginId },
        }),
      ),
    );

    return NextResponse.json({ ok: true, summary: { ...plan.summary, appliedMappings: mappings.length } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "엑셀 파일을 읽지 못했습니다." }, { status: 400 });
  }
}
