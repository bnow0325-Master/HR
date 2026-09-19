import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createWorkboardSessionToken,
  workboardSessionCookieName,
  workboardSessionMaxAge,
} from "@/lib/workboardSession";
import {
  hrPublicUrl,
  safeWorkboardReturnTo,
  verifyWorkboardHandoff,
} from "@/lib/workboardHandoff";

function companyLoginUrl(returnTo: string) {
  const url = hrPublicUrl("/api/auth/company/login");
  url.searchParams.set("returnTo", safeWorkboardReturnTo(returnTo));
  return url;
}

function requiredCapability(returnTo: string) {
  const path = returnTo.split("?", 1)[0];
  if (path === "/check" || path === "/records") return "attendance";
  if (path === "/leave" || path === "/business-trips") return "leave";
  return "any";
}

export async function POST(request: NextRequest) {
  let returnTo = "/attendance";
  try {
    const form = await request.formData();
    const ticket = form.get("ticket");
    if (typeof ticket !== "string" || !ticket) throw new Error("WorkBoard ticket is missing.");
    const identity = await verifyWorkboardHandoff(ticket);
    returnTo = identity.returnTo;
    const capability = requiredCapability(returnTo);
    const employee = await prisma.employee.findFirst({
      where: {
        email: { equals: identity.email },
        active: true,
        ...(capability === "attendance" ? { attendanceEnabled: true } : {}),
        ...(capability === "leave" ? { leaveEnabled: true } : {}),
      },
      select: { id: true, email: true },
    });
    if (!employee?.email) throw new Error("Active HR employee was not found.");

    const response = NextResponse.redirect(hrPublicUrl(returnTo), 303);
    response.cookies.set({
      name: workboardSessionCookieName,
      value: createWorkboardSessionToken(employee.id, employee.email),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: workboardSessionMaxAge,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return NextResponse.redirect(companyLoginUrl(returnTo), 303);
  }
}
