import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validContactPhone, validEmail } from "@/lib/employeeData";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

const profileSelect = {
  id: true,
  code: true,
  name: true,
  department: true,
  position: true,
  email: true,
  phone: true,
  personalEmail: true,
  homeAddress: true,
  emergencyContactPhone: true,
  updatedAt: true,
} as const;

type ProfileBody = {
  personalEmail?: string | null;
  homeAddress?: string | null;
  emergencyContactPhone?: string | null;
};

async function currentEmployee() {
  return getCurrentWorkboardEmployee("workboard");
}

export async function GET() {
  const employee = await currentEmployee();
  if (!employee) {
    return NextResponse.json(
      { error: "워크보드 로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const profile = await prisma.employee.findUnique({
    where: { id: employee.id },
    select: profileSelect,
  });
  if (!profile) {
    return NextResponse.json(
      { error: "직원 정보를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { profile },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const employee = await currentEmployee();
  if (!employee) {
    return NextResponse.json(
      { error: "워크보드 로그인이 필요합니다." },
      { status: 401 },
    );
  }

  let body: ProfileBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const personalEmail =
    typeof body.personalEmail === "string"
      ? body.personalEmail.trim().toLowerCase() || null
      : null;
  const homeAddress =
    typeof body.homeAddress === "string"
      ? body.homeAddress.trim() || null
      : null;
  const emergencyContactPhone =
    typeof body.emergencyContactPhone === "string"
      ? body.emergencyContactPhone.trim() || null
      : null;

  if (!validEmail(personalEmail)) {
    return NextResponse.json(
      { error: "개인 이메일을 올바른 형식으로 입력해 주세요." },
      { status: 400 },
    );
  }
  if (!personalEmail) {
    return NextResponse.json(
      { error: "개인 이메일을 입력해 주세요." },
      { status: 400 },
    );
  }
  if (!validContactPhone(emergencyContactPhone)) {
    return NextResponse.json(
      {
        error:
          "비상연락망 연락처를 하이픈이 포함된 전화번호 형식으로 입력해 주세요.",
      },
      { status: 400 },
    );
  }
  if (!emergencyContactPhone) {
    return NextResponse.json(
      { error: "비상연락망 연락처를 입력해 주세요." },
      { status: 400 },
    );
  }
  if (!homeAddress) {
    return NextResponse.json(
      { error: "우편물 수령 가능 주소를 입력해 주세요." },
      { status: 400 },
    );
  }
  if (homeAddress && homeAddress.length > 300) {
    return NextResponse.json(
      { error: "우편물 수령 가능 주소는 300자 이내로 입력해 주세요." },
      { status: 400 },
    );
  }

  if (personalEmail) {
    const duplicate = await prisma.employee.findFirst({
      where: {
        id: { not: employee.id },
        personalEmail: {
          equals: personalEmail,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "이미 다른 직원이 사용 중인 개인 이메일입니다." },
        { status: 409 },
      );
    }
  }

  const profile = await prisma.employee.update({
    where: { id: employee.id },
    data: {
      personalEmail,
      homeAddress,
      emergencyContactPhone,
    },
    select: profileSelect,
  });

  return NextResponse.json({ ok: true, profile });
}
