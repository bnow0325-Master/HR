import assert from "node:assert/strict";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { NextRequest } from "next/server";

process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/test";
process.env.BNOW_IDENTITY_URL = "https://auth.example.test";
process.env.BNOW_IDENTITY_REALM = "bnow";
process.env.BNOW_IDENTITY_LOGIN_CLIENT_ID = "hr-server-test";
process.env.BNOW_IDENTITY_LOGIN_CLIENT_SECRET = "test-client-secret";
process.env.BNOW_IDENTITY_LOGIN_REDIRECT_URI = "https://hr.example.test/api/auth/company/callback";
process.env.BNOW_IDENTITY_SESSION_SECRET = "a".repeat(32);
let activeEmployee = true;
let lastEmployeeFilter: unknown;
(globalThis as unknown as { prisma: unknown }).prisma = {
  employee: {
    findFirst: async (query: { where: unknown }) => {
      lastEmployeeFilter = query.where;
      const filter = query.where as { id: string; email: { equals: string } };
      return activeEmployee ? { id: filter.id, email: filter.email.equals } : null;
    },
  },
};

const metadata = {
  issuer: "https://auth.example.test/realms/bnow",
  authorization_endpoint: "https://auth.example.test/authorize",
  token_endpoint: "https://auth.example.test/token",
  jwks_uri: "https://auth.example.test/jwks",
};

test("parallel login routes issue independent state cookies and return paths", async (context) => {
  const fetched: string[] = [];
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    fetched.push(String(input));
    return Response.json(metadata);
  });
  const { GET } = await import("../app/api/auth/company/login/route");
  const { decodeCompanyOidcFlow } = await import("./companyOidc");
  const first = await GET(new NextRequest("https://hr.example.test/api/auth/company/login?returnTo=%2Fleave"));
  const second = await GET(new NextRequest("https://hr.example.test/api/auth/company/login?returnTo=%2Frecords"));
  assert.equal(first.status, 307);
  assert.equal(second.status, 307);
  const firstCookie = first.cookies.getAll()[0];
  const secondCookie = second.cookies.getAll()[0];
  assert.ok(firstCookie?.name.startsWith("bnow_hr_oauth_"));
  assert.ok(secondCookie?.name.startsWith("bnow_hr_oauth_"));
  assert.notEqual(firstCookie.name, secondCookie.name);
  const firstFlow = decodeCompanyOidcFlow(firstCookie.value);
  const secondFlow = decodeCompanyOidcFlow(secondCookie.value);
  assert.equal(firstFlow?.returnTo, "/leave");
  assert.equal(secondFlow?.returnTo, "/records");
  assert.notEqual(firstFlow?.verifier, secondFlow?.verifier);
  assert.equal(new URL(first.headers.get("location")!).searchParams.get("state"), firstFlow?.state);
  assert.equal(new URL(second.headers.get("location")!).searchParams.get("state"), secondFlow?.state);
  assert.equal(fetched.length, 1);
});

test("a callback failure clears only its own state cookie", async () => {
  const { GET } = await import("../app/api/auth/company/callback/route");
  const { companyOidcCookieName, encodeCompanyOidcFlow } = await import("./companyOidc");
  const firstState = "a".repeat(43);
  const secondState = "b".repeat(43);
  const firstName = companyOidcCookieName(firstState);
  const secondName = companyOidcCookieName(secondState);
  const firstToken = encodeCompanyOidcFlow({
    state: firstState, nonce: "nonce-1", verifier: "verifier-1", returnTo: "/leave", issuedAt: Date.now(),
  });
  const secondToken = encodeCompanyOidcFlow({
    state: secondState, nonce: "nonce-2", verifier: "verifier-2", returnTo: "/records", issuedAt: Date.now(),
  });
  const request = new NextRequest(`https://hr.example.test/api/auth/company/callback?state=${firstState}`, {
    headers: { cookie: `${firstName}=${firstToken}; ${secondName}=${secondToken}` },
  });
  const response = await GET(request);
  assert.equal(response.status, 307);
  assert.equal(response.cookies.getAll().length, 1);
  assert.equal(response.cookies.getAll()[0].name, firstName);
  assert.equal(response.cookies.getAll()[0].maxAge, 0);
  assert.equal(response.headers.get("location"), "https://hr.example.test/auth/company?error=access_denied");
});

test("callbacks in reverse order exchange each matching PKCE verifier and return path", async (context) => {
  const { GET } = await import("../app/api/auth/company/callback/route");
  const { companyOidcCookieName, encodeCompanyOidcFlow } = await import("./companyOidc");
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "test-key", use: "sig", alg: "RS256" };
  const flows = [
    { state: "c".repeat(43), nonce: "nonce-1", verifier: "verifier-1", returnTo: "/leave", issuedAt: Date.now() },
    { state: "d".repeat(43), nonce: "nonce-2", verifier: "verifier-2", returnTo: "/records", issuedAt: Date.now() },
  ];
  const exchanged: string[] = [];
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/jwks")) return Response.json({ keys: [jwk] });
    if (url.endsWith("/token")) {
      const params = new URLSearchParams(init?.body as string);
      const code = params.get("code") ?? "";
      const flow = flows.find((candidate) => candidate.verifier === params.get("code_verifier"));
      assert.ok(flow);
      assert.equal(code, flow?.state);
      exchanged.push(flow.verifier);
      const idToken = await new SignJWT({
        email: "test@example.test", nonce: flow.nonce, realm_access: { roles: ["hr_user"] },
      }).setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer(metadata.issuer).setAudience("hr-server-test")
        .setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return Response.json({ id_token: idToken });
    }
    return Response.json(metadata);
  });
  activeEmployee = true;
  const cookieHeader = flows.map((flow) =>
    `${companyOidcCookieName(flow.state)}=${encodeCompanyOidcFlow(flow)}`,
  ).join("; ");
  for (const flow of [...flows].reverse()) {
    const request = new NextRequest(`https://hr.example.test/api/auth/company/callback?code=${flow.state}&state=${flow.state}`, {
      headers: { cookie: cookieHeader },
    });
    const response = await GET(request);
    assert.equal(response.headers.get("location"), `https://hr.example.test${flow.returnTo}`);
    assert.equal(response.cookies.get(companyOidcCookieName(flow.state))?.maxAge, 0);
    assert.ok(response.cookies.get("bnow_hr_session")?.value);
  }
  assert.deepEqual(exchanged, ["verifier-2", "verifier-1"]);
});

test("a valid active employee session skips OIDC while inactive access does not", async (context) => {
  const { createWorkboardSessionToken, workboardSessionCookieName } = await import("./workboardSession");
  const { GET } = await import("../app/api/auth/company/login/route");
  const fetches: string[] = [];
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    fetches.push(String(input));
    return Response.json(metadata);
  });
  activeEmployee = true;
  const token = createWorkboardSessionToken("employee-1", "test@example.test");
  const request = new NextRequest("https://hr.example.test/api/auth/company/login?returnTo=%2Fleave", {
    headers: { cookie: `${workboardSessionCookieName}=${token}` },
  });
  const reused = await GET(request);
  assert.equal(reused.headers.get("location"), "https://hr.example.test/leave");
  assert.equal(reused.cookies.getAll().length, 0);
  assert.equal(fetches.length, 0);
  assert.deepEqual(lastEmployeeFilter, {
    id: "employee-1", email: { equals: "test@example.test" }, active: true,
  });

  const otherToken = createWorkboardSessionToken("employee-2", "other@example.test");
  const otherRequest = new NextRequest("https://hr.example.test/api/auth/company/login?returnTo=%2Frecords", {
    headers: { cookie: `${workboardSessionCookieName}=${otherToken}` },
  });
  const otherSession = await GET(otherRequest);
  assert.equal(otherSession.headers.get("location"), "https://hr.example.test/records");
  assert.equal(fetches.length, 0);

  activeEmployee = false;
  const login = await GET(request);
  assert.equal(new URL(login.headers.get("location")!).origin, "https://auth.example.test");
  assert.equal(login.cookies.getAll().length, 1);
});
