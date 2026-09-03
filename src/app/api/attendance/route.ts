import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isWithinOffice } from "@/lib/location";
import { isAdmin } from "@/lib/adminAuth";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

type CheckBody = {
  action?: "CANCEL_OUT";
  type?: "IN" | "OUT";
  latitude?: number;
  longitude?: number;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const CHECKOUT_CANCEL_WINDOW_MS = 30 * 60 * 1000;

function currentKstDate() {
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function kstDayRange(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const start = new Date(Date.UTC(year, monthIndex, day) - KST_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function checkoutCancelExpiresAt(timestamp: Date) {
  return new Date(timestamp.getTime() + CHECKOUT_CANCEL_WINDOW_MS);
}

export async function POST(req: Request) {
  let body: CheckBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { action, type, latitude, longitude } = body;

  const authenticatedEmployee =
    await getCurrentWorkboardEmployee("attendance");
  if (!authenticatedEmployee) {
    return NextResponse.json(
      { error: "워크보드 로그인 또는 출퇴근 사용 권한이 필요합니다." },
      { status: 401 },
    );
  }
  const employeeId = authenticatedEmployee.id;

  const todayRange = kstDayRange(currentKstDate());
  if (!todayRange) {
    return NextResponse.json(
      { error: "오늘 날짜를 확인하지 못했습니다." },
      { status: 500 },
    );
  }

  if (action === "CANCEL_OUT") {
    const checkoutRecord = await prisma.attendanceRecord.findFirst({
      where: {
        employeeId,
        type: "OUT",
        cancelledAt: null,
        timestamp: { gte: todayRange.start, lt: todayRange.end },
      },
      orderBy: { timestamp: "desc" },
    });

    if (!checkoutRecord) {
      return NextResponse.json(
        { error: "취소할 퇴근 기록이 없습니다." },
        { status: 409 },
      );
    }

    const now = new Date();
    const elapsed = now.getTime() - checkoutRecord.timestamp.getTime();
    if (elapsed < 0 || elapsed > CHECKOUT_CANCEL_WINDOW_MS) {
      return NextResponse.json(
        { error: "퇴근 후 30분 이내에만 취소할 수 있습니다." },
        { status: 409 },
      );
    }

    const update = await prisma.attendanceRecord.updateMany({
      where: { id: checkoutRecord.id, cancelledAt: null },
      data: {
        cancelledAt: now,
        cancelNote: "EMPLOYEE_UNDO_WITHIN_30_MINUTES",
      },
    });

    if (update.count !== 1) {
      return NextResponse.json(
        { error: "이미 취소되었거나 변경된 퇴근 기록입니다." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      cancelledRecordId: checkoutRecord.id,
      cancelledAt: now,
      checkedIn: true,
      completed: false,
      nextAction: "OUT",
    });
  }

  if (type !== "IN" && type !== "OUT") {
    return NextResponse.json(
      { error: "출근/퇴근 구분이 필요합니다." },
      { status: 400 },
    );
  }

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json(
      {
        error: "출퇴근 등록 준비가 완료되지 않았습니다. 브라우저 권한을 확인해 주세요.",
      },
      { status: 422 },
    );
  }

  const geo = isWithinOffice(latitude, longitude);
  if (!geo.ok) {
    return NextResponse.json(
      {
        error: "현재 출퇴근을 등록할 수 없습니다. 관리자에게 문의해 주세요.",
      },
      { status: 403 },
    );
  }

  const todayRecords = await prisma.attendanceRecord.findMany({
    where: {
      employeeId,
      cancelledAt: null,
      timestamp: { gte: todayRange.start, lt: todayRange.end },
    },
    select: { type: true },
    orderBy: { timestamp: "asc" },
  });

  const hasCheckedIn = todayRecords.some((record) => record.type === "IN");
  const hasCheckedOut = todayRecords.some((record) => record.type === "OUT");

  if (type === "IN" && hasCheckedIn) {
    return NextResponse.json(
      { error: "오늘 출근이 이미 등록되었습니다." },
      { status: 409 },
    );
  }
  if (type === "OUT" && !hasCheckedIn) {
    return NextResponse.json(
      { error: "출근을 먼저 등록해 주세요." },
      { status: 409 },
    );
  }
  if (type === "OUT" && hasCheckedOut) {
    return NextResponse.json(
      { error: "오늘 퇴근이 이미 등록되었습니다." },
      { status: 409 },
    );
  }
  if (hasCheckedOut) {
    return NextResponse.json(
      { error: "오늘 출퇴근 기록이 이미 완료되었습니다." },
      { status: 409 },
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
    },
  });

  return NextResponse.json({
    ok: true,
    record: {
      id: record.id,
      type: record.type,
      timestamp: record.timestamp,
    },
    cancelExpiresAt:
      record.type === "OUT" ? checkoutCancelExpiresAt(record.timestamp) : null,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const latestOnly = searchParams.get("latest") === "1";
  const mineOnly = searchParams.get("mine") === "1";

  if (latestOnly || mineOnly) {
    const authenticatedEmployee =
      await getCurrentWorkboardEmployee("attendance");
    if (!authenticatedEmployee) {
      return NextResponse.json(
        { error: "워크보드 로그인 또는 출퇴근 사용 권한이 필요합니다." },
        { status: 401 },
      );
    }
    const authenticatedEmployeeId = authenticatedEmployee.id;

    if (!latestOnly) {
      const where: Record<string, unknown> = {
        employeeId: authenticatedEmployeeId,
        cancelledAt: null,
      };
      if (date) {
        const range = kstDayRange(date);
        if (!range) {
          return NextResponse.json(
            { error: "날짜 형식이 올바르지 않습니다." },
            { status: 400 },
          );
        }
        where.timestamp = { gte: range.start, lt: range.end };
      }

      const records = await prisma.attendanceRecord.findMany({
        where,
        select: {
          id: true,
          type: true,
          timestamp: true,
          cancelledAt: true,
        },
        orderBy: { timestamp: "desc" },
        take: 200,
      });
      return NextResponse.json({ records });
    }

    const todayRange = kstDayRange(currentKstDate());
    const todayRecords = todayRange
      ? await prisma.attendanceRecord.findMany({
          where: {
            employeeId: authenticatedEmployeeId,
            cancelledAt: null,
            timestamp: { gte: todayRange.start, lt: todayRange.end },
          },
          select: {
            id: true,
            type: true,
            timestamp: true,
          },
          orderBy: { timestamp: "asc" },
        })
      : [];

    const hasCheckedIn = todayRecords.some(
      (record) => record.type === "IN",
    );
    const checkoutRecord =
      [...todayRecords].reverse().find((record) => record.type === "OUT") ??
      null;
    const completed = hasCheckedIn && Boolean(checkoutRecord);
    const cancelExpiresAt = checkoutRecord
      ? checkoutCancelExpiresAt(checkoutRecord.timestamp)
      : null;

    return NextResponse.json({
      latestRecord: todayRecords.at(-1) ?? null,
      checkedIn: hasCheckedIn && !checkoutRecord,
      completed,
      nextAction: completed ? null : hasCheckedIn ? "OUT" : "IN",
      checkoutAt: checkoutRecord?.timestamp ?? null,
      cancelExpiresAt,
      canCancelCheckout:
        Boolean(cancelExpiresAt) &&
        (cancelExpiresAt?.getTime() ?? 0) >= Date.now(),
    });
  }

  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "관리자 로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const where: Record<string, unknown> = { cancelledAt: null };
  if (date) {
    const range = kstDayRange(date);
    if (!range) {
      return NextResponse.json(
        { error: "날짜 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    where.timestamp = { gte: range.start, lt: range.end };
  }

  const records = await prisma.attendanceRecord.findMany({
    where,
    include: {
      employee: {
        select: { name: true, code: true, department: true },
      },
    },
    orderBy: { timestamp: "desc" },
    take: 200,
  });

  return NextResponse.json({ records });
}
