import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const workboardSessionCookieName = "bnow_hr_session";
export const workboardSessionMaxAge = 60 * 60 * 12;

type WorkboardSessionPayload = {
  employeeId: string;
  email: string;
  expiresAt: number;
};

type EmployeeCapability = "any" | "attendance" | "leave" | "workboard";

function sessionSecret() {
  return process.env.BNOW_IDENTITY_SESSION_SECRET?.trim() ?? "";
}

function sign(encodedPayload: string) {
  return createHmac("sha256", sessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function workboardSessionConfigured() {
  return sessionSecret().length >= 32;
}

export function createWorkboardSessionToken(
  employeeId: string,
  email: string,
) {
  if (!workboardSessionConfigured()) {
    throw new Error("BNOW_IDENTITY_SESSION_SECRET is not configured.");
  }

  const payload: WorkboardSessionPayload = {
    employeeId,
    email: email.trim().toLowerCase(),
    expiresAt: Math.floor(Date.now() / 1000) + workboardSessionMaxAge,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function parseWorkboardSessionToken(token: string) {
  if (!workboardSessionConfigured()) return null;

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra || !safeEqual(signature, sign(encodedPayload))) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<WorkboardSessionPayload>;
    if (
      typeof payload.employeeId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload as WorkboardSessionPayload;
  } catch {
    return null;
  }
}

export async function getCurrentWorkboardEmployee(
  capability: EmployeeCapability = "any",
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(workboardSessionCookieName)?.value;
  if (!token) return null;

  const session = parseWorkboardSessionToken(token);
  if (!session) return null;

  return prisma.employee.findFirst({
    where: {
      id: session.employeeId,
      email: { equals: session.email },
      active: true,
      ...(capability === "workboard" ? { workboardEnabled: true } : {}),
      ...(capability === "attendance" ? { attendanceEnabled: true } : {}),
      ...(capability === "leave" ? { leaveEnabled: true } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      department: true,
      position: true,
      email: true,
      hireDate: true,
      workMinutesPerDay: true,
      systemRole: true,
      attendanceEnabled: true,
      leaveEnabled: true,
      workboardEnabled: true,
      profilePhotoUpdatedAt: true,
      active: true,
    },
  });
}
