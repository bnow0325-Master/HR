import assert from "node:assert/strict";
import test from "node:test";
import {
  companyApplicationUrl,
  companyOidcCookieName,
  decodeCompanyOidcFlow,
  decodeCompanyOidcFlowForState,
  encodeCompanyOidcFlow,
  safeCompanyReturnTo,
} from "./companyOidc";

test("company OIDC return path is restricted to HR pages", () => {
  assert.equal(safeCompanyReturnTo("/leave"), "/leave");
  assert.equal(safeCompanyReturnTo("//evil.example"), "/attendance");
  assert.equal(safeCompanyReturnTo("https://evil.example"), "/attendance");
});

test("company OIDC application URL uses the configured public callback origin", () => {
  configureOidc();
  assert.equal(
    companyApplicationUrl("/auth/company?error=access_denied").toString(),
    "https://hr.example.test/auth/company?error=access_denied",
  );
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

test("parallel OIDC logins keep each state, verifier and return path separate", () => {
  configureOidc();
  const first = {
    state: "a".repeat(43), nonce: "first-nonce", verifier: "first-verifier",
    returnTo: "/leave", issuedAt: Date.now(),
  };
  const second = {
    state: "b".repeat(43), nonce: "second-nonce", verifier: "second-verifier",
    returnTo: "/records", issuedAt: Date.now(),
  };
  const cookies = new Map([
    [companyOidcCookieName(first.state), encodeCompanyOidcFlow(first)],
    [companyOidcCookieName(second.state), encodeCompanyOidcFlow(second)],
  ]);
  assert.notEqual(companyOidcCookieName(first.state), companyOidcCookieName(second.state));
  assert.deepEqual(decodeCompanyOidcFlowForState(second.state, cookies.get(companyOidcCookieName(second.state)) ?? ""), second);
  cookies.delete(companyOidcCookieName(second.state));
  assert.deepEqual(decodeCompanyOidcFlowForState(first.state, cookies.get(companyOidcCookieName(first.state)) ?? ""), first);
  assert.equal(decodeCompanyOidcFlowForState(first.state, encodeCompanyOidcFlow(second)), null);
});
