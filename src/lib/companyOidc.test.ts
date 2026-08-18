import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeCompanyOidcFlow,
  encodeCompanyOidcFlow,
  safeCompanyReturnTo,
} from "./companyOidc";

test("company OIDC return path is restricted to HR pages", () => {
  assert.equal(safeCompanyReturnTo("/leave"), "/leave");
  assert.equal(safeCompanyReturnTo("//evil.example"), "/attendance");
  assert.equal(safeCompanyReturnTo("https://evil.example"), "/attendance");
});

function configureOidc() {
  process.env.BNOW_IDENTITY_URL = "https://auth.example.test";
  process.env.BNOW_IDENTITY_REALM = "bnow";
  process.env.BNOW_IDENTITY_LOGIN_CLIENT_ID = "hr-server-test";
  process.env.BNOW_IDENTITY_LOGIN_CLIENT_SECRET = "test-client-secret";
  process.env.BNOW_IDENTITY_LOGIN_REDIRECT_URI =
    "https://hr.example.test/api/auth/company/callback";
  process.env.BNOW_IDENTITY_SESSION_SECRET = "a".repeat(32);
}

test("company OIDC flow accepts a recent signed value", () => {
  configureOidc();
  const flow = {
    state: "state",
    nonce: "nonce",
    verifier: "verifier",
    returnTo: "/attendance",
    issuedAt: Date.now(),
  };
  assert.deepEqual(decodeCompanyOidcFlow(encodeCompanyOidcFlow(flow)), flow);
});

test("company OIDC flow rejects an expired signed value", () => {
  configureOidc();
  const token = encodeCompanyOidcFlow({
    state: "state",
    nonce: "nonce",
    verifier: "verifier",
    returnTo: "/attendance",
    issuedAt: Date.now() - 11 * 60 * 1000,
  });
  assert.equal(decodeCompanyOidcFlow(token), null);
});
