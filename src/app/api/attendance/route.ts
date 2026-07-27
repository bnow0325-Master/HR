import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isWithinOffice } from "@/lib/location";

type CheckBody = {
  employeeId?: string;
  type?: "IN" | "OUT";
  latitude?: number;
  longitude?: number;
  address?: string;
};

// 출퇴근 기록 생성.
// 검증 순서: 워크보드 로그인 사용자 매칭 → 현재 브라우저 위치.
export async function POST(req: Request) {
  let body: CheckBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { employeeId, type, latitude, longitude } = body;
  const address = body.address?.trim() || null;

  if (!employeeId || (type !== "IN" && type !== "OUT")) {
    return NextResponse.json(
      { error: "직원과 출근/퇴근 구분이 필요합니다." },
      { status: 400 },
    );
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });
  if (!employee || !employee.active) {
    return NextResponse.json(
      { error: "직원을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // 1) 위치 검증
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json(
      { error: "위치 정보가 필요합니다. 위치 권한을 허용해 주세요." },
      { status: 422 },
    );
  }
  const geo = isWithinOffice(latitude, longitude);
  if (!geo.ok) {
    return NextResponse.json(
      {
        error: `사무실에서 ${geo.distance}m 떨어져 있습니다. 사무실 안에서만 출퇴근할 수 있습니다.`,
      },
      { status: 403 },
    );
  }

  const record = await prisma.attendanceRecord.create({
    data: {
      employeeId,
      type,
      method: "PC_LOCATION",
      verified: true,
      latitude,
      longitude,
      note: address,
    },
  });

  return NextResponse.json({
    ok: true,
    record: {
      id: record.id,
      type: record.type,
      timestamp: record.timestamp,
      latitude: record.latitude,
      longitude: record.longitude,
      address: record.note,
    },
  });
}

// 기록 조회 (관리자/디버그용). ?date=YYYY-MM-DD, ?employeeId=
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const employeeId = searchParams.get("employeeId");

  const where: Record<string, unknown> = {};
  if (employeeId) where.employeeId = employeeId;
  if (date) {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59.999`);
    where.timestamp = { gte: start, lte: end };
  }

  const records = await prisma.attendanceRecord.findMany({
    where,
    include: { employee: { select: { name: true, code: true, department: true } } },
    orderBy: { timestamp: "desc" },
    take: 200,
  });

  return NextResponse.json({ records });
}
