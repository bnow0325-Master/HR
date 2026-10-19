import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { companyApplicationUrl, companyOidcCookieName, decodeCompanyOidcFlowForState, exchangeCompanyCode } from "@/lib/companyOidc";
import { createWorkboardSessionToken, workboardSessionCookieName, workboardSessionMaxAge } from "@/lib/workboardSession";

function clearOauthCookie(response: NextResponse, cookieName: string | null) {
  if (cookieName) response.cookies.set({ name: cookieName, value: "", path: "/api/auth/company", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  let cookieName: string | null = null;
  try {
    const code = request.nextUrl.searchParams.get("code") || "";
    const state = request.nextUrl.searchParams.get("state") || "";
    cookieName = companyOidcCookieName(state);
    const flow = decodeCompanyOidcFlowForState(state, request.cookies.get(cookieName)?.value || "");
    if (!code || !flow) throw new Error("OIDC callback is invalid.");
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
    return clearOauthCookie(response, cookieName);
  } catch {
    return clearOauthCookie(NextResponse.redirect(companyApplicationUrl("/auth/company?error=access_denied")), cookieName);
  }
}
