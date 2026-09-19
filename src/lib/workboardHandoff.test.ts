import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import {
  hrPublicUrl,
  safeWorkboardReturnTo,
  verifyWorkboardHandoff,
  WORKBOARD_HANDOFF_AUDIENCE,
} from "./workboardHandoff";

const secret = "test-workboard-sso-secret-that-is-long-enough";
process.env.WORKBOARD_SSO_SECRET = secret;
process.env.WORKBOARD_ORIGIN = "https://main.bnow.co.kr";
process.env.HR_PUBLIC_ORIGIN = "https://hr.bnow.co.kr";

async function ticket(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    email: "Employee@BNOW.co.kr",
    returnTo: "/check",
    ...overrides,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("https://main.bnow.co.kr")
    .setAudience(WORKBOARD_HANDOFF_AUDIENCE)
    .setSubject("employee-subject")
    .setJti("ticket-id")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(secret));
}

test("WorkBoard handoff accepts a signed active employee identity", async () => {
  assert.deepEqual(await verifyWorkboardHandoff(await ticket()), {
    email: "employee@bnow.co.kr",
    returnTo: "/check",
  });
});

test("WorkBoard handoff rejects another issuer", async () => {
  const forged = await new SignJWT({ email: "employee@bnow.co.kr", returnTo: "/check" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("https://evil.example")
    .setAudience(WORKBOARD_HANDOFF_AUDIENCE)
    .setSubject("employee-subject")
    .setJti("forged-id")
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(secret));
  await assert.rejects(() => verifyWorkboardHandoff(forged));
});

test("WorkBoard handoff return path cannot leave HR", () => {
  assert.equal(safeWorkboardReturnTo("//evil.example"), "/attendance");
  assert.equal(safeWorkboardReturnTo("https://evil.example"), "/attendance");
  assert.equal(safeWorkboardReturnTo("/admin/employees"), "/admin/employees");
});

test("WorkBoard handoff redirects through the public HR origin", () => {
  assert.equal(hrPublicUrl("/check").toString(), "https://hr.bnow.co.kr/check");
  assert.equal(
    hrPublicUrl("/api/auth/company/login").toString(),
    "https://hr.bnow.co.kr/api/auth/company/login",
  );
});
