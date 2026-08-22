import assert from "node:assert/strict";
import test from "node:test";
import {
  certificateIssueDate,
  certificatePurpose,
  employmentCertificateNumber,
  formatCertificateDate,
  todayInKorea,
} from "./employmentCertificate";

test("certificate purpose is normalized and bounded", () => {
  assert.equal(certificatePurpose("  금융기관   제출용  "), "금융기관 제출용");
  assert.equal(certificatePurpose(""), "제출용");
  assert.equal(certificatePurpose("가".repeat(100)).length, 80);
});

test("certificate date falls back to the current Korean date", () => {
  const now = new Date("2026-08-21T16:00:00.000Z");
  assert.equal(todayInKorea(now), "2026-08-22");
  assert.equal(certificateIssueDate("invalid", now), "2026-08-22");
  assert.equal(certificateIssueDate("2026-02-30", now), "2026-08-22");
  assert.equal(certificateIssueDate("2026-08-20", now), "2026-08-20");
});

test("certificate metadata is formatted consistently", () => {
  assert.equal(formatCertificateDate("2025-02-03"), "2025년 02월 03일");
  assert.equal(
    employmentCertificateNumber("2026-08-22", "004"),
    "BNOW-HR-20260822-004",
  );
});
