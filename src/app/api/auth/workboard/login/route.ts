import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyWorkboardAccessToken,
  workboardAuthConfigured,
} from "@/lib/workboardAuth";
import {
  createWorkboardSessionToken,
  workboardSessionConfigured,
  workboardSessionCookieName,
  workboardSessionMaxAge,
} from "@/lib/workboardSession";

type LoginBody = {
  accessToken?: string;
};

export async function POST(request: Request) {
  if (!workboardAuthConfigured() || !workboardSessionConfigured()) {
    return NextResponse.json(
      { error: "워크보드 로그인 연결 설정이 완료되지 않았습니다." },
      { status: 503 },
    );
  }

  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const accessToken = body.accessToken?.trim() ?? "";
  if (!accessToken || accessToken.length > 10_000) {
    return NextResponse.json(
      { error: "워크보드 로그인 정보가 없습니다." },
      { status: 400 },
    );
  }

  let workboardUser: Awaited<ReturnType<typeof verifyWorkboardAccessToken>>;
  try {
    workboardUser = await verifyWorkboardAccessToken(accessToken);
  } catch {
    workboardUser = null;
  }
  if (!workboardUser) {
    return NextResponse.json(
      { error: "워크보드 로그인이 만료되었거나 유효하지 않습니다." },
      { status: 401 },
    );
  }

  const employee = await prisma.employee.findFirst({
    where: {
      email: { equals: workboardUser.email, mode: "insensitive" },
      active: true,
      workboardEnabled: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      email: true,
    },
  });
  if (!employee?.email) {
    return NextResponse.json(
      {
        error:
          "워크보드 계정과 일치하는 재직 직원이 없거나 인사관리 권한이 없습니다.",
      },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ ok: true, employee });
  response.cookies.set({
    name: workboardSessionCookieName,
    value: createWorkboardSessionToken(employee.id, employee.email),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: workboardSessionMaxAge,
  });
  return response;
}
