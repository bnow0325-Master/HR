import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type RecordsBody = {
  employeeId?: string;
  month?: string;
};

type EmployeeLite = {
  id: string;
  code: string;
  name: string;
  department: string | null;
};

type RecordLite = {
  type: string;
  timestamp: Date;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
};

function parseMonth(month: string | undefined) {
  const match = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  if (!match) return null;

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    year < 2000 ||
    year > 2100 ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return null;
  }

  return { year, monthIndex: monthNumber - 1 };
}

function kstMonthRange(year: number, monthIndex: number) {
  const start = new Date(Date.UTC(year, monthIndex, 1) - KST_OFFSET_MS);
  const end = new Date(Date.UTC(year, monthIndex + 1, 1) - KST_OFFSET_MS);
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return { start, end, days };
}

function kstDateKey(date: Date) {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function kstTime(date: Date | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

function summarizeDay(records: RecordLite[]) {
  const sorted = [...records].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
  let firstIn: Date | null = null;
  let lastOut: Date | null = null;
  let firstInAddress: string | null = null;
  let lastOutAddress: string | null = null;
  let firstInLatitude: number | null = null;
  let firstInLongitude: number | null = null;
  let lastOutLatitude: number | null = null;
  let lastOutLongitude: number | null = null;
  let pendingIn: Date | null = null;
  let totalMinutes = 0;
  let open = false;

  for (const record of sorted) {
    if (record.type === "IN") {
      if (!firstIn) {
        firstIn = record.timestamp;
        firstInAddress = record.note;
        firstInLatitude = record.latitude;
        firstInLongitude = record.longitude;
      }
      pendingIn = record.timestamp;
      open = true;
    }
    if (record.type === "OUT") {
      lastOut = record.timestamp;
      lastOutAddress = record.note;
      lastOutLatitude = record.latitude;
      lastOutLongitude = record.longitude;
      if (pendingIn) {
        const minutes = Math.round(
          (record.timestamp.getTime() - pendingIn.getTime()) / 60000,
        );
        if (minutes > 0) totalMinutes += minutes;
        pendingIn = null;
        open = false;
      }
    }
  }

  return {
    firstIn,
    lastOut,
    firstInAddress,
    lastOutAddress,
    firstInLatitude,
    firstInLongitude,
    lastOutLatitude,
    lastOutLongitude,
    totalMinutes,
    open,
  };
}

export async function POST(req: Request) {
  let body: RecordsBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const month = parseMonth(body.month);
  if (!month) {
    return NextResponse.json(
      { error: "조회할 월을 선택해 주세요." },
      { status: 400 },
    );
  }

  if (!body.employeeId) {
    return NextResponse.json(
      { error: "직원을 선택해 주세요." },
      { status: 400 },
    );
  }

  const requester = await prisma.employee.findUnique({
    where: { id: body.employeeId },
    select: {
      id: true,
      code: true,
      name: true,
      department: true,
      active: true,
    },
  });

  if (!requester || !requester.active) {
    return NextResponse.json(
      { error: "직원을 찾을 수 없습니다." },
      { status: 401 },
    );
  }

  const { start, end, days } = kstMonthRange(month.year, month.monthIndex);
  const records = await prisma.attendanceRecord.findMany({
    where: {
      employeeId: requester.id,
      timestamp: { gte: start, lt: end },
    },
    select: {
      employeeId: true,
      type: true,
      timestamp: true,
      latitude: true,
      longitude: true,
      note: true,
    },
    orderBy: [{ employeeId: "asc" }, { timestamp: "asc" }],
  });

  const recordsByEmployeeDay = new Map<string, RecordLite[]>();
  for (const record of records) {
    const key = `${record.employeeId}:${kstDateKey(record.timestamp)}`;
    const list = recordsByEmployeeDay.get(key) ?? [];
    list.push(record);
    recordsByEmployeeDay.set(key, list);
  }

  const monthPrefix = `${month.year}-${String(month.monthIndex + 1).padStart(
    2,
    "0",
  )}`;

  let monthlyMinutes = 0;
  const rows = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const date = `${monthPrefix}-${String(day).padStart(2, "0")}`;
    const summary = summarizeDay(
      recordsByEmployeeDay.get(`${requester.id}:${date}`) ?? [],
    );
    monthlyMinutes += summary.totalMinutes;
    return {
      date,
      day,
      checkIn: kstTime(summary.firstIn),
      checkOut: kstTime(summary.lastOut),
      checkInAddress: summary.firstInAddress ?? "-",
      checkOutAddress: summary.lastOutAddress ?? "-",
      checkInLatitude: summary.firstInLatitude,
      checkInLongitude: summary.firstInLongitude,
      checkOutLatitude: summary.lastOutLatitude,
      checkOutLongitude: summary.lastOutLongitude,
      workMinutes: summary.totalMinutes,
      workTime: summary.totalMinutes ? formatMinutes(summary.totalMinutes) : "-",
      open: summary.open,
    };
  });

  return NextResponse.json({
    month: `${month.year}-${String(month.monthIndex + 1).padStart(2, "0")}`,
    monthLabel: `${month.year}년 ${month.monthIndex + 1}월`,
    isManager: false,
    employees: [requester],
    groups: [
      {
        employee: requester,
        rows,
        totalMinutes: monthlyMinutes,
        totalTime: formatMinutes(monthlyMinutes),
      },
    ],
  });
}
