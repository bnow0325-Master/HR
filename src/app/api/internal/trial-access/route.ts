import { NextResponse } from "next/server";
import {
  employeeDirectoryApiConfigured,
  isEmployeeDirectoryRequestAuthorized,
} from "@/lib/internalApiAuth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

export async function GET(request: Request) {
  if (!employeeDirectoryApiConfigured()) {
    return NextResponse.json({ error: "직원명부 연동이 설정되지 않았습니다." }, {
      status: 503,
      headers: responseHeaders,
    });
  }
  if (!isEmployeeDirectoryRequestAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "인증되지 않은 요청입니다." }, {
      status: 401,
      headers: responseHeaders,
    });
  }

  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "유효한 이메일이 필요합니다." }, {
      status: 400,
      headers: responseHeaders,
    });
  }

  const employee = await prisma.employee.findFirst({
    where: {
      active: true,
      terminationDate: null,
      OR: [
        { email: { equals: email } },
        { personalEmail: { equals: email } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      position: true,
      systemRole: true,
    },
  });

  return NextResponse.json({ employee }, { headers: responseHeaders });
}
