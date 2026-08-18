import { NextRequest, NextResponse } from "next/server";
import { createCompanyAuthorization } from "@/lib/companyOidc";

export async function GET(request: NextRequest) {
  try {
    const authorization = await createCompanyAuthorization(request.nextUrl.searchParams.get("returnTo"));
    const response = NextResponse.redirect(authorization.url);
    response.cookies.set({
      name: "bnow_hr_oauth", value: authorization.token, httpOnly: true,
      secure: process.env.NODE_ENV === "production", sameSite: "lax",
      path: "/api/auth/company", maxAge: 600,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "사내 통합 로그인 설정을 확인해 주세요." }, { status: 503 });
  }
}
