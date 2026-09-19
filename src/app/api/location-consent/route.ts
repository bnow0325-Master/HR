import { NextResponse } from "next/server";
import { LOCATION_CONSENT_VERSION, hasCurrentLocationConsent } from "@/lib/locationConsent";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

async function currentEmployeeId() {
  const employee = await getCurrentWorkboardEmployee("attendance");
  return employee?.id ?? null;
}

export async function GET() {
  const employeeId = await currentEmployeeId();
  if (!employeeId) {
    return NextResponse.json(
      { error: "워크보드 로그인 또는 출퇴근 사용 권한이 필요합니다." },
      { status: 401 },
    );
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { locationConsentAt: true, locationConsentVersion: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "직원 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    consented: hasCurrentLocationConsent(employee),
    consentedAt: employee.locationConsentAt,
    version: LOCATION_CONSENT_VERSION,
  });
}

export async function POST(request: Request) {
  const employeeId = await currentEmployeeId();
  if (!employeeId) {
    return NextResponse.json(
      { error: "워크보드 로그인 또는 출퇴근 사용 권한이 필요합니다." },
      { status: 401 },
    );
  }

  let body: { agreed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (body.agreed !== true) {
    return NextResponse.json({ error: "위치정보 수집 동의가 필요합니다." }, { status: 400 });
  }

  const consentedAt = new Date();
  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      locationConsentAt: consentedAt,
      locationConsentVersion: LOCATION_CONSENT_VERSION,
    },
  });

  return NextResponse.json({
    ok: true,
    consented: true,
    consentedAt,
    version: LOCATION_CONSENT_VERSION,
  });
}
