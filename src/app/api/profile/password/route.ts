import { NextResponse } from "next/server";
import {
  changeWorkboardPassword,
  workboardAuthConfigured,
} from "@/lib/workboardAuth";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

type PasswordBody = {
  currentPassword?: string;
  newPassword?: string;
};

function validNewPassword(password: string) {
  return (
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}

export async function POST(request: Request) {
  const employee = await getCurrentWorkboardEmployee("workboard");
  if (!employee?.email) {
    return NextResponse.json(
      { error: "워크보드 로그인이 필요합니다." },
      { status: 401 },
    );
  }
  if (!workboardAuthConfigured()) {
    return NextResponse.json(
      { error: "로그인 비밀번호 변경 설정이 완료되지 않았습니다." },
      { status: 503 },
    );
  }

  let body: PasswordBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || currentPassword.length > 128) {
    return NextResponse.json(
      { error: "현재 비밀번호를 입력해 주세요." },
      { status: 400 },
    );
  }
  if (!validNewPassword(newPassword)) {
    return NextResponse.json(
      { error: "새 비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요." },
      { status: 400 },
    );
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "현재 비밀번호와 다른 새 비밀번호를 입력해 주세요." },
      { status: 400 },
    );
  }

  const result = await changeWorkboardPassword(
    employee.email,
    currentPassword,
    newPassword,
  );
  if (!result.ok && result.reason === "invalid_credentials") {
    return NextResponse.json(
      { error: "현재 비밀번호가 올바르지 않습니다." },
      { status: 401 },
    );
  }
  if (!result.ok && result.reason === "password_rejected") {
    return NextResponse.json(
      {
        error:
          "새 비밀번호가 보안 정책에 맞지 않습니다. 더 복잡한 비밀번호를 입력해 주세요.",
      },
      { status: 400 },
    );
  }
  if (!result.ok) {
    return NextResponse.json(
      { error: "로그인 비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "로그인 비밀번호를 변경했습니다.",
  });
}
