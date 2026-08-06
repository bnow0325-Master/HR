import { timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function employeeDirectoryApiConfigured(): boolean {
  return (process.env.EMPLOYEE_DIRECTORY_API_TOKEN?.trim().length ?? 0) >= 32;
}

export function isEmployeeDirectoryRequestAuthorized(
  authorizationHeader: string | null,
): boolean {
  const configuredToken = process.env.EMPLOYEE_DIRECTORY_API_TOKEN?.trim() ?? "";
  if (configuredToken.length < 32 || !authorizationHeader) return false;

  const [scheme, suppliedToken, extra] = authorizationHeader.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !suppliedToken || extra) {
    return false;
  }
  return safeEqual(suppliedToken, configuredToken);
}
