const WORKBOARD_SSO_URL =
  "https://main.bnow.co.kr/hr-login.html";

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
  const url = new URL(WORKBOARD_SSO_URL);
  url.searchParams.set("return_to", returnTo);
  return url.toString();
}
