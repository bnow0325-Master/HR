import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { companyApplicationUrl, decodeCompanyOidcFlow, exchangeCompanyCode } from "@/lib/companyOidc";
import { createWorkboardSessionToken, workboardSessionCookieName, workboardSessionMaxAge } from "@/lib/workboardSession";

function clearOauthCookie(response: NextResponse) {
  response.cookies.set({ name: "bnow_hr_oauth", value: "", path: "/api/auth/company", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code") || "";
    const state = request.nextUrl.searchParams.get("state") || "";
    const flow = decodeCompanyOidcFlow(request.cookies.get("bnow_hr_oauth")?.value || "");
    if (!code || !flow || flow.state !== state) throw new Error("OIDC callback is invalid.");
    const identity = await exchangeCompanyCode(flow, code);
    const employee = await prisma.employee.findFirst({
      where: {
        email: { equals: identity.email },
        active: true,
      },
      select: { id: true, email: true },
    });
    if (!employee?.email) throw new Error("Active HR employee was not found.");
    const destination = companyApplicationUrl(flow.returnTo);
    const response = NextResponse.redirect(destination);
    response.cookies.set({
      name: workboardSessionCookieName,
      value: createWorkboardSessionToken(employee.id, employee.email),
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: workboardSessionMaxAge,
    });
    return clearOauthCookie(response);
  } catch {
    return clearOauthCookie(NextResponse.redirect(companyApplicationUrl("/auth/company?error=access_denied")));
  }
}
