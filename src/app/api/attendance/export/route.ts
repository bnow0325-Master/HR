import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { periodRange, type Period } from "@/lib/stats";
import { isAdmin } from "@/lib/adminAuth";

// 기간별 출퇴근 기록을 CSV로 내려받는다. ?period=today|week|month|year
function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const period = (searchParams.get("period") ?? "month") as Period;
  const { start, end } = periodRange(period, new Date());

  const records = await prisma.attendanceRecord.findMany({
    where: { timestamp: { gte: start, lte: end } },
    include: {
      employee: { select: { name: true, code: true, department: true } },
    },
    orderBy: { timestamp: "asc" },
  });

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);

  const header = [
    "사번",
    "이름",
    "부서",
    "구분",
    "시각",
    "방식",
    "현장확인",
    "위치주소",
    "위도",
    "경도",
  ];
  const rows = records.map((r) =>
    [
      r.employee.code,
      r.employee.name,
      r.employee.department ?? "",
      r.type === "IN" ? "출근" : "퇴근",
      fmt(r.timestamp),
      r.method,
      r.verified ? "확인" : "미확인",
      r.note ?? "",
      r.latitude ?? "",
      r.longitude ?? "",
    ]
      .map((v) => csvEscape(String(v)))
      .join(","),
  );

  // Excel 한글 깨짐 방지를 위한 UTF-8 BOM
  const csv = "﻿" + [header.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${period}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
