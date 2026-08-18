import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { validEmail } from "@/lib/employeeData";
import {
  setCompanyIdentityTemporaryPassword,
  syncCompanyIdentity,
} from "@/lib/companyIdentity";
import { prisma } from "@/lib/prisma";

type PasswordBody = {
  email?: unknown;
  password?: unknown;
};

function validPassword(password: string) {
  return (
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "관리자 인증이 필요합니다." },
      { status: 401 },
    );
  }

  let body: PasswordBody;
  try {
    body = (await request.json()) as PasswordBody;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !validEmail(email)) {
    return NextResponse.json(
      { error: "회사 이메일을 올바르게 입력해 주세요." },
      { status: 400 },
    );
  }
  if (!validPassword(password)) {
    return NextResponse.json(
      { error: "비밀번호는 영문과 숫자를 포함한 8~128자로 입력해 주세요." },
      { status: 400 },
    );
  }

  const employee = await prisma.employee.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      code: true,
      name: true,
      department: true,
      position: true,
      email: true,
      systemRole: true,
      active: true,
      attendanceEnabled: true,
      leaveEnabled: true,
      workboardEnabled: true,
    },
  });
  if (!employee) {
    return NextResponse.json(
      { error: "직원명부에 등록된 회사 이메일만 사용할 수 있습니다." },
      { status: 404 },
    );
  }
  if (!employee.active) {
    return NextResponse.json(
      { error: "퇴사 또는 비활성 직원의 계정은 재설정할 수 없습니다." },
      { status: 409 },
    );
  }

  const sync = await syncCompanyIdentity(employee);
  if (!sync.ok) {
    return NextResponse.json({ error: sync.message }, { status: 502 });
  }
  const result = await setCompanyIdentityTemporaryPassword(email, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, message: result.message });
}
