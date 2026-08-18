import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/adminAuth";
import { validEmail } from "@/lib/employeeData";
import { provisionWorkboardAccount } from "@/lib/workboardMembers";

type AccountBody = {
  email?: unknown;
  name?: unknown;
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

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "관리자 인증이 필요합니다." },
      { status: 401 },
    );
  }

  let body: AccountBody;
  try {
    body = (await req.json()) as AccountBody;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const email = typeof body.email === "string"
    ? body.email.trim().toLowerCase()
    : "";
  const requestedName = typeof body.name === "string" ? body.name.trim() : "";
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
      name: true,
      systemRole: true,
      active: true,
      workboardEnabled: true,
    },
  });
  if (employee && (!employee.active || !employee.workboardEnabled)) {
    return NextResponse.json(
      { error: "비활성화된 직원은 WorkBoard 계정을 사용할 수 없습니다." },
      { status: 409 },
    );
  }

  const name = employee?.name ?? requestedName;
  if (!name) {
    return NextResponse.json(
      { error: "직원명부에 없는 계정은 이름을 함께 입력해 주세요." },
      { status: 400 },
    );
  }

  const result = await provisionWorkboardAccount({
    email,
    password,
    name,
    systemRole: employee?.systemRole === "ADMIN" ? "ADMIN" : "MEMBER",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    state: result.state,
    message: result.message,
    linkedToEmployee: Boolean(employee),
  });
}
