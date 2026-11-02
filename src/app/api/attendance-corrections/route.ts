import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";
import { correctionConflict, correctionDateAllowed, kstDayRange, parseKstTime } from "@/lib/attendanceCorrection";
import { notifyAdminsAboutApprovalRequest } from "@/lib/workboardApprovalNotifications";

type RequestBody = { workDate?: string; checkInTime?: string; checkOutTime?: string; reason?: string };

export async function GET() {
  const employee = await getCurrentWorkboardEmployee("attendance");
  if (!employee) return NextResponse.json({ error: "출퇴근 권한이 필요합니다." }, { status: 401 });
  const requests = await prisma.attendanceCorrectionRequest.findMany({
    where: { employeeId: employee.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ requests }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const employee = await getCurrentWorkboardEmployee("attendance");
  if (!employee) return NextResponse.json({ error: "출퇴근 권한이 필요합니다." }, { status: 401 });
  let body: RequestBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const workDate = body.workDate ?? "";
  const range = kstDayRange(workDate);
  const checkInAt = parseKstTime(workDate, body.checkInTime);
  const checkOutAt = parseKstTime(workDate, body.checkOutTime);
  const reason = body.reason?.trim() ?? "";
  if (!range || !correctionDateAllowed(workDate) || checkInAt === undefined || checkOutAt === undefined
      || (!checkInAt && !checkOutAt) || !reason || reason.length > 2000) {
    return NextResponse.json({ error: "최근 1년 이내의 날짜, 누락 시각과 사유를 정확히 입력해 주세요." }, { status: 400 });
  }
  if ((checkInAt && checkInAt > new Date()) || (checkOutAt && checkOutAt > new Date())) {
    return NextResponse.json({ error: "미래 시각은 신청할 수 없습니다." }, { status: 400 });
  }
  const [existing, imported, pending] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employeeId: employee.id, cancelledAt: null, timestamp: { gte: range.start, lt: range.end } },
      select: { type: true, timestamp: true },
    }),
    prisma.naverWorksDailyRecord.findUnique({
      where: { employeeId_baseDate: { employeeId: employee.id, baseDate: new Date(`${workDate}T00:00:00Z`) } },
      select: { checkInAt: true, checkOutAt: true },
    }),
    prisma.attendanceCorrectionRequest.findFirst({
      where: { employeeId: employee.id, workDate: new Date(`${workDate}T00:00:00Z`), status: "PENDING" },
      select: { id: true },
    }),
  ]);
  if (pending) return NextResponse.json({ error: "이 날짜는 이미 검토 중입니다." }, { status: 409 });
  const sourceRecords = [
    ...existing,
    ...(imported?.checkInAt ? [{ type: "IN", timestamp: imported.checkInAt }] : []),
    ...(imported?.checkOutAt ? [{ type: "OUT", timestamp: imported.checkOutAt }] : []),
  ];
  if (correctionConflict(sourceRecords, checkInAt, checkOutAt)) {
    return NextResponse.json({ error: "이미 등록된 출퇴근 시각과 중복되거나 순서가 맞지 않습니다." }, { status: 409 });
  }
  const created = await prisma.attendanceCorrectionRequest.create({
    data: { employeeId: employee.id, workDate: new Date(`${workDate}T00:00:00Z`),
      pendingWorkDate: new Date(`${workDate}T00:00:00Z`), checkInAt, checkOutAt, reason },
  }).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return null;
    throw error;
  });
  if (!created) return NextResponse.json({ error: "이 날짜는 이미 검토 중입니다." }, { status: 409 });
  await notifyAdminsAboutApprovalRequest({
    kind: "attendance-correction", requestId: created.id,
    employeeName: employee.name, employeeCode: employee.code,
    description: `${workDate} 출퇴근 사후 등록`,
  });
  return NextResponse.json({ request: created }, { status: 201 });
}
