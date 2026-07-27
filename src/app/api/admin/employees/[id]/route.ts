import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/adminAuth";

// 직원 정보 수정 (이름/부서/활성 상태)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;

  let body: {
    name?: string;
    department?: string | null;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    return NextResponse.json(
      { error: "직원을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const data: {
    name?: string;
    department?: string | null;
    active?: boolean;
  } = {};
  if (typeof body.name === "string" && body.name.trim())
    data.name = body.name.trim();
  if (body.department !== undefined)
    data.department = body.department?.trim() || null;
  if (typeof body.active === "boolean") data.active = body.active;

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "변경할 내용이 없습니다." },
      { status: 400 },
    );
  }

  const updated = await prisma.employee.update({
    where: { id },
    data,
    select: { id: true, code: true, name: true, department: true, active: true },
  });
  return NextResponse.json({ ok: true, employee: updated });
}

// 직원 비활성화 (기록 보존을 위해 실제 삭제 대신 active=false)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    return NextResponse.json(
      { error: "직원을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  await prisma.employee.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
