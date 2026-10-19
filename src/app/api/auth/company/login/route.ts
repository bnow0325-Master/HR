import { NextRequest, NextResponse } from "next/server";
import { companyApplicationUrl, companyOidcCookieName, createCompanyAuthorization, safeCompanyReturnTo } from "@/lib/companyOidc";
import { getWorkboardEmployeeFromToken, workboardSessionCookieName } from "@/lib/workboardSession";

export async function GET(request: NextRequest) {
  try {
    const returnTo = safeCompanyReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const sessionToken = request.cookies.get(workboardSessionCookieName)?.value;
    if (sessionToken && await getWorkboardEmployeeFromToken(sessionToken)) {
      return NextResponse.redirect(companyApplicationUrl(returnTo));
    }
    const authorization = await createCompanyAuthorization(returnTo);
    const response = NextResponse.redirect(authorization.url);
    response.cookies.set({
      name: companyOidcCookieName(authorization.state), value: authorization.token, httpOnly: true,
      secure: process.env.NODE_ENV === "production", sameSite: "lax",
      path: "/api/auth/company", maxAge: 600,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "사내 통합 로그인 설정을 확인해 주세요." }, { status: 503 });
  }
}
