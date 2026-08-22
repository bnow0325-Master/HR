const DEFAULT_PURPOSE = "제출용";

function configuredValue(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

export function employmentCertificateCompany() {
  return {
    legalName: configuredValue("HR_CERTIFICATE_COMPANY_NAME", "(주)비노우"),
    representativeName: configuredValue(
      "HR_CERTIFICATE_REPRESENTATIVE_NAME",
      "추동현",
    ),
    representativeTitle: configuredValue(
      "HR_CERTIFICATE_REPRESENTATIVE_TITLE",
      "대표이사",
    ),
    businessNumber: configuredValue(
      "HR_CERTIFICATE_BUSINESS_NUMBER",
      "132-86-37808",
    ),
    corporateNumber: configuredValue(
      "HR_CERTIFICATE_CORPORATE_NUMBER",
      "110111-8903430",
    ),
    address: configuredValue(
      "HR_CERTIFICATE_COMPANY_ADDRESS",
      "서울특별시 중구 명동길 73, 6층(명동1가)",
    ),
  };
}

export function certificatePurpose(value: unknown) {
  if (typeof value !== "string") return DEFAULT_PURPOSE;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, 80);
  return normalized || DEFAULT_PURPOSE;
}

export function todayInKorea(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function certificateIssueDate(value: unknown, now = new Date()) {
  const fallback = todayInKorea(now);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? fallback
    : value;
}

export function formatCertificateDate(value: string | Date | null) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getUTCFullYear()}년 ${String(date.getUTCMonth() + 1).padStart(2, "0")}월 ${String(date.getUTCDate()).padStart(2, "0")}일`;
}

export function employmentCertificateNumber(issueDate: string, employeeCode: string) {
  const safeCode = employeeCode.replace(/[^A-Za-z0-9-]/g, "") || "EMPLOYEE";
  return `BNOW-HR-${issueDate.replaceAll("-", "")}-${safeCode}`;
}
