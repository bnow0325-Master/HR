import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/adminAuth";
import { syncWorkboardMember } from "@/lib/workboardMembers";
import {
  employeeSelect,
  parseDateOnly,
  validEmail,
  validPhone,
} from "@/lib/employeeData";

type EmployeeBody = {
  code?: string;
  name?: string;
  department?: string;
  position?: string;
  email?: string;
  phone?: string;
  hireDate?: string;
  terminationDate?: string;
  workMinutesPerDay?: number;
  systemRole?: "ADMIN" | "MEMBER";
  attendanceEnabled?: boolean;
  leaveEnabled?: boolean;
  workboardEnabled?: boolean;
};

export async function GET() {
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

  return NextResponse.json({ employees });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "관리자 인증이 필요합니다." },
      { status: 401 },
    );
  }

  let body: EmployeeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const code = body.code?.trim();
  const name = body.name?.trim();
  const department = body.department?.trim() || null;
  const position = body.position?.trim() || null;
  const email = body.email?.trim().toLowerCase() || null;
  const phone = body.phone?.trim() || null;
  const hireDate = parseDateOnly(body.hireDate);
  const terminationDate = body.terminationDate
    ? parseDateOnly(body.terminationDate)
    : null;
  const workMinutesPerDay = Number(body.workMinutesPerDay ?? 480);
  const systemRole = body.systemRole === "ADMIN" ? "ADMIN" : "MEMBER";
  const active = terminationDate === null;

  if (!code || !name || !hireDate) {
    return NextResponse.json(
      { error: "사번, 이름, 입사일은 필수입니다." },
      { status: 400 },
    );
  }
  if (terminationDate && terminationDate < hireDate) {
    return NextResponse.json(
      { error: "퇴사일은 입사일보다 빠를 수 없습니다." },
      { status: 400 },
    );
  }
  if (
    !Number.isInteger(workMinutesPerDay) ||
    workMinutesPerDay < 60 ||
    workMinutesPerDay > 1440
  ) {
    return NextResponse.json(
      { error: "1일 근무시간을 올바르게 입력해 주세요." },
      { status: 400 },
    );
  }
  if (!validEmail(email)) {
    return NextResponse.json(
      { error: "이메일 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  if (!validPhone(phone)) {
    return NextResponse.json(
      { error: "휴대폰번호는 010-0000-0000 형식으로 입력해 주세요." },
      { status: 400 },
    );
  }

  const duplicate = await prisma.employee.findFirst({
    where: {
      OR: [
        { code },
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { code: true, email: true },
  });
  if (duplicate) {
    return NextResponse.json(
      {
        error:
          duplicate.code === code
            ? "이미 등록된 사번입니다."
            : "이미 등록된 이메일입니다.",
      },
      { status: 409 },
    );
  }

  const employee = await prisma.employee.create({
    data: {
      code,
      name,
      department,
      position,
      email,
      phone,
      hireDate,
      terminationDate,
      workMinutesPerDay,
      systemRole,
      attendanceEnabled: active && body.attendanceEnabled !== false,
      leaveEnabled: active && body.leaveEnabled !== false,
      workboardEnabled:
        active && Boolean(email) && body.workboardEnabled !== false,
      active,
    },
    select: employeeSelect,
  });
  const workboardSync = await syncWorkboardMember(employee);

  return NextResponse.json(
    { ok: true, employee, workboardSync },
    { status: 201 },
  );
}
