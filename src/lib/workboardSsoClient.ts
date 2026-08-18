const COMPANY_LOGIN_URL = "/api/auth/company/login";

const EMPLOYEE_PATHS = new Set([
  "/attendance",
  "/check",
  "/records",
  "/leave",
  "/business-trips",
  "/profile",
]);

export function isEmployeePath(pathname: string) {
  return EMPLOYEE_PATHS.has(pathname);
}

export function workboardLoginUrl(pathname: string) {
  const returnTo = isEmployeePath(pathname) ? pathname : "/attendance";
  return `${COMPANY_LOGIN_URL}?returnTo=${encodeURIComponent(returnTo)}`;
}
