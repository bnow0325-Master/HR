import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/adminAuth";

// 직원 목록 (관리자용, 활성/비활성 모두)
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const employees = await prisma.employee.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      department: true,
      active: true,
      createdAt: true,
    },
  });
  return NextResponse.json({
    employees,
  });
}

// 직원 추가
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: {
    code?: string;
    name?: string;
    department?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const code = body.code?.trim();
  const name = body.name?.trim();
  const department = body.department?.trim() || null;

  if (!code || !name) {
    return NextResponse.json(
      { error: "사번과 이름은 필수입니다." },
      { status: 400 },
    );
  }

  const exists = await prisma.employee.findUnique({ where: { code } });
  if (exists) {
    return NextResponse.json(
      { error: "이미 존재하는 사번입니다." },
      { status: 409 },
    );
  }

  const employee = await prisma.employee.create({
    data: { code, name, department },
    select: { id: true, code: true, name: true, department: true, active: true },
  });
  return NextResponse.json({ ok: true, employee }, { status: 201 });
}
