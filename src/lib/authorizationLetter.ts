import { certificateIssueDate, todayInKorea } from "./employmentCertificate";

const DEFAULT_ORGANIZATION = "수신처 미지정";
const DEFAULT_AUTHORITY = "대리 참석 및 발표";
const DEFAULT_SCOPE = "행사 대리 참석, 발표 및 현장 안내 수령·확인 업무";

function normalizedText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return normalized || fallback;
}

export function authorizationOrganization(value: unknown) {
  return normalizedText(value, DEFAULT_ORGANIZATION, 100);
}

export function authorizationTitle(value: unknown) {
  return normalizedText(value, DEFAULT_AUTHORITY, 120);
}

export function authorizationScope(value: unknown) {
  return normalizedText(value, DEFAULT_SCOPE, 500);
}

export function authorizationEventDate(value: unknown, now = new Date()) {
  return certificateIssueDate(value, now);
}

export function authorizationIssueDate(value: unknown, now = new Date()) {
  return certificateIssueDate(value, now);
}

export function authorizationLetterNumber(
  issueDate: string,
  employeeCode: string,
) {
  const safeCode = employeeCode.replace(/[^A-Za-z0-9-]/g, "") || "EMPLOYEE";
  return `BNOW-POA-${issueDate.replaceAll("-", "")}-${safeCode}`;
}

export function defaultAuthorizationForm(now = new Date()) {
  const today = todayInKorea(now);
  return {
    organization: "",
    eventDate: today,
    title: DEFAULT_AUTHORITY,
    scope: DEFAULT_SCOPE,
    issuedOn: today,
  };
}
