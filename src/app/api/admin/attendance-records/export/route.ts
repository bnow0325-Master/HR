import { isAdmin } from "@/lib/adminAuth";
import { loadAdminAttendanceReport } from "@/lib/adminAttendanceReport";
import { attendanceCsv } from "@/lib/attendanceReport";

export async function GET(request: Request) {
  if (!(await isAdmin())) return new Response("Forbidden", { status: 403 });
  try {
    const params = new URL(request.url).searchParams;
    const report = await loadAdminAttendanceReport(params);
    const filename = `attendance-${report.range.startDay}-${report.range.endDay}.csv`;
    return new Response(attendanceCsv(report.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid request", { status: 400 });
  }
}
