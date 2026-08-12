const WORKBOARD_SSO_URL =
  "https://bnow0325-master.github.io/workboard/hr-login.html";

const EMPLOYEE_PATHS = new Set([
  "/attendance",
  "/check",
  "/records",
  "/leave",
  "/business-trips",
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
