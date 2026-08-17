import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/adminAuth";
import {
  employeeSelect,
  parseDateOnly,
  validContactPhone,
  validEmail,
  validPhone,
} from "@/lib/employeeData";
import { syncWorkboardMember } from "@/lib/workboardMembers";

type UpdateEmployeeBody = {
  code?: string;
  name?: string;
  department?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  personalEmail?: string | null;
  homeAddress?: string | null;
  emergencyContactPhone?: string | null;
  hireDate?: string;
  terminationDate?: string | null;
  workMinutesPerDay?: number;
  systemRole?: "ADMIN" | "MEMBER";
  attendanceEnabled?: boolean;
  leaveEnabled?: boolean;
  workboardEnabled?: boolean;
  active?: boolean;
};

function optionalDate(value: string | null | undefined) {
  if (value === null || value === "") return null;
  if (value === undefined) return undefined;
  return parseDateOnly(value) ?? undefined;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "관리자 인증이 필요합니다." },
      { status: 401 },
    );
  }

  const { id } = await params;
  let body: UpdateEmployeeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "직원을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const data: {
    code?: string;
    name?: string;
    department?: string | null;
    position?: string | null;
    email?: string | null;
    phone?: string | null;
    personalEmail?: string | null;
    homeAddress?: string | null;
    emergencyContactPhone?: string | null;
    hireDate?: Date;
    terminationDate?: Date | null;
    workMinutesPerDay?: number;
    systemRole?: string;
    attendanceEnabled?: boolean;
    leaveEnabled?: boolean;
    workboardEnabled?: boolean;
    active?: boolean;
  } = {};

  if (typeof body.code === "string" && body.code.trim()) {
    data.code = body.code.trim();
  }
  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
  }
  if (body.department !== undefined) {
    data.department = body.department?.trim() || null;
  }
  if (body.position !== undefined) {
    data.position = body.position?.trim() || null;
  }
  if (body.email !== undefined) {
    const email = body.email?.trim().toLowerCase() || null;
    if (!validEmail(email)) {
      return NextResponse.json(
        { error: "이메일 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    data.email = email;
  }
  if (body.phone !== undefined) {
    const phone = body.phone?.trim() || null;
    if (!validPhone(phone)) {
      return NextResponse.json(
        { error: "휴대폰번호는 010-0000-0000 형식으로 입력해 주세요." },
        { status: 400 },
      );
    }
    data.phone = phone;
  }
  if (body.personalEmail !== undefined) {
    const personalEmail = body.personalEmail?.trim().toLowerCase() || null;
    if (!validEmail(personalEmail)) {
      return NextResponse.json(
        { error: "개인 이메일 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    data.personalEmail = personalEmail;
  }
  if (body.homeAddress !== undefined) {
    const homeAddress = body.homeAddress?.trim() || null;
    if (homeAddress && homeAddress.length > 300) {
      return NextResponse.json(
        { error: "현재 거주지 주소는 300자 이내로 입력해 주세요." },
        { status: 400 },
      );
    }
    data.homeAddress = homeAddress;
  }
  if (body.emergencyContactPhone !== undefined) {
    const emergencyContactPhone =
      body.emergencyContactPhone?.trim() || null;
    if (!validContactPhone(emergencyContactPhone)) {
      return NextResponse.json(
        { error: "비상연락망 연락처를 하이픈이 포함된 전화번호 형식으로 입력해 주세요." },
        { status: 400 },
      );
    }
    data.emergencyContactPhone = emergencyContactPhone;
  }
  if (body.hireDate !== undefined) {
    const hireDate = optionalDate(body.hireDate);
    if (!(hireDate instanceof Date)) {
      return NextResponse.json(
        { error: "입사일 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    data.hireDate = hireDate;
  }
  if (body.terminationDate !== undefined) {
    const terminationDate = optionalDate(body.terminationDate);
    if (terminationDate === undefined) {
      return NextResponse.json(
        { error: "퇴사일 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    data.terminationDate = terminationDate;
    data.active = terminationDate === null;
    if (terminationDate) {
      data.attendanceEnabled = false;
      data.leaveEnabled = false;
      data.workboardEnabled = false;
    }
  }
  if (body.workMinutesPerDay !== undefined) {
    if (
      !Number.isInteger(body.workMinutesPerDay) ||
      body.workMinutesPerDay < 60 ||
      body.workMinutesPerDay > 1440
    ) {
      return NextResponse.json(
        { error: "1일 근무시간을 올바르게 입력해 주세요." },
        { status: 400 },
      );
    }
    data.workMinutesPerDay = body.workMinutesPerDay;
  }
  if (body.systemRole !== undefined) {
    data.systemRole = body.systemRole === "ADMIN" ? "ADMIN" : "MEMBER";
  }
  if (typeof body.attendanceEnabled === "boolean") {
    data.attendanceEnabled = body.attendanceEnabled;
  }
  if (typeof body.leaveEnabled === "boolean") {
    data.leaveEnabled = body.leaveEnabled;
  }
  if (typeof body.workboardEnabled === "boolean") {
    data.workboardEnabled = body.workboardEnabled;
  }
  if (
    typeof body.active === "boolean" &&
    body.terminationDate === undefined
  ) {
    data.active = body.active;
  }

  const nextHireDate = data.hireDate ?? existing.hireDate;
  const nextTerminationDate =
    data.terminationDate === undefined
      ? existing.terminationDate
      : data.terminationDate;
  if (
    nextHireDate &&
    nextTerminationDate &&
    nextTerminationDate < nextHireDate
  ) {
    return NextResponse.json(
      { error: "퇴사일은 입사일보다 빠를 수 없습니다." },
      { status: 400 },
    );
  }

  const nextActive =
    nextTerminationDate === null && (data.active ?? existing.active);
  data.active = nextActive;
  if (!nextActive) {
    data.attendanceEnabled = false;
    data.leaveEnabled = false;
    data.workboardEnabled = false;
  }

  const nextCode = data.code ?? existing.code;
  const nextEmail =
    data.email === undefined ? existing.email : data.email;
  const nextPersonalEmail =
    data.personalEmail === undefined
      ? existing.personalEmail
      : data.personalEmail;
  if (!nextEmail) {
    data.workboardEnabled = false;
  }
  const duplicate = await prisma.employee.findFirst({
    where: {
      id: { not: id },
      OR: [
        { code: nextCode },
        ...(nextEmail
          ? [{ email: { equals: nextEmail, mode: "insensitive" as const } }]
          : []),
        ...(nextPersonalEmail
          ? [
              {
                personalEmail: {
                  equals: nextPersonalEmail,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ],
    },
    select: { code: true },
  });
  if (duplicate) {
    return NextResponse.json(
      {
        error:
          "동일한 사번, 회사 이메일 또는 개인 이메일을 사용 중인 직원이 있습니다.",
      },
      { status: 409 },
    );
  }

  const employee = await prisma.employee.update({
    where: { id },
    data,
    select: employeeSelect,
  });
  const workboardSync = await syncWorkboardMember(
    employee,
    existing.email,
  );

  return NextResponse.json({ ok: true, employee, workboardSync });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "관리자 인증이 필요합니다." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "직원을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      active: false,
      attendanceEnabled: false,
      leaveEnabled: false,
      workboardEnabled: false,
      terminationDate: existing.terminationDate ?? new Date(),
    },
    select: employeeSelect,
  });
  const workboardSync = await syncWorkboardMember(
    employee,
    existing.email,
  );

  return NextResponse.json({ ok: true, employee, workboardSync });
}
