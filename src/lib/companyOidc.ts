import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type CompanyOidcFlow = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  issuedAt: number;
};

type Configuration = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  sessionSecret: string;
};

type Metadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

const ALLOWED_RETURN_PATHS = new Set([
  "/attendance", "/check", "/records", "/leave", "/business-trips", "/profile", "/admin", "/admin/employees",
]);
let metadataCache: { issuer: string; value: Metadata; expiresAt: number } | undefined;

function configuration(): Configuration | null {
  const url = process.env.BNOW_IDENTITY_URL?.replace(/\/$/, "") || "";
  const realm = process.env.BNOW_IDENTITY_REALM?.trim() || "";
  const values = {
    issuer: url && realm ? url + "/realms/" + encodeURIComponent(realm) : "",
    clientId: process.env.BNOW_IDENTITY_LOGIN_CLIENT_ID?.trim() || "",
    clientSecret: process.env.BNOW_IDENTITY_LOGIN_CLIENT_SECRET?.trim() || "",
    redirectUri: process.env.BNOW_IDENTITY_LOGIN_REDIRECT_URI?.trim() || "",
    sessionSecret: process.env.BNOW_IDENTITY_SESSION_SECRET?.trim() || "",
  };
  const configured = Object.values(values).filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== Object.keys(values).length || values.sessionSecret.length < 32) {
    throw new Error("Company OIDC environment variables are incomplete.");
  }
  return values;
}

export function companyOidcConfigured() {
  try { return Boolean(configuration()); } catch { return false; }
}

export function companyApplicationUrl(path: string) {
  const config = configuration();
  if (!config) throw new Error("Company OIDC is not configured.");
  return new URL(path, new URL(config.redirectUri).origin);
}

export function safeCompanyReturnTo(value: unknown) {
  if (typeof value !== "string") return "/attendance";
  const path = value.split("?", 1)[0] || "";
  return ALLOWED_RETURN_PATHS.has(path) ? value : "/attendance";
}

function randomValue() { return randomBytes(32).toString("base64url"); }
function signature(config: Configuration, encoded: string) {
  return createHmac("sha256", config.sessionSecret).update(encoded).digest("base64url");
}

export function encodeCompanyOidcFlow(flow: CompanyOidcFlow) {
  const config = configuration();
  if (!config) throw new Error("Company OIDC is not configured.");
  const encoded = Buffer.from(JSON.stringify(flow)).toString("base64url");
  return encoded + "." + signature(config, encoded);
}

export function decodeCompanyOidcFlow(token: string) {
  const config = configuration();
  if (!config) return null;
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) return null;
  const expected = signature(config, encoded);
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const flow = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CompanyOidcFlow;
    const validIssuedAt =
      Number.isFinite(flow.issuedAt) &&
      flow.issuedAt >= Date.now() - 10 * 60 * 1000 &&
      flow.issuedAt <= Date.now() + 60 * 1000;
    return flow.state && flow.nonce && flow.verifier && validIssuedAt
      ? flow
      : null;
  } catch { return null; }
}

async function metadata(config: Configuration) {
  if (metadataCache?.issuer === config.issuer && metadataCache.expiresAt > Date.now()) return metadataCache.value;
  const response = await fetch(config.issuer + "/.well-known/openid-configuration", {
    cache: "no-store", signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("OIDC discovery failed.");
  const value = await response.json() as Metadata;
  if (value.issuer !== config.issuer || !value.authorization_endpoint || !value.token_endpoint || !value.jwks_uri) {
    throw new Error("OIDC discovery response is invalid.");
  }
  metadataCache = { issuer: config.issuer, value, expiresAt: Date.now() + 300_000 };
  return value;
}

export async function createCompanyAuthorization(returnTo: unknown) {
  const config = configuration();
  if (!config) throw new Error("Company OIDC is not configured.");
  const discovery = await metadata(config);
  const flow: CompanyOidcFlow = {
    state: randomValue(),
    nonce: randomValue(),
    verifier: randomValue(),
    returnTo: safeCompanyReturnTo(returnTo),
    issuedAt: Date.now(),
  };
  const challenge = createHash("sha256").update(flow.verifier).digest("base64url");
  const url = new URL(discovery.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri,
    scope: "openid email profile", state: flow.state, nonce: flow.nonce,
    code_challenge: challenge, code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), token: encodeCompanyOidcFlow(flow) };
}

export async function exchangeCompanyCode(flow: CompanyOidcFlow, code: string) {
  const config = configuration();
  if (!config) throw new Error("Company OIDC is not configured.");
  const discovery = await metadata(config);
  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(config.clientId + ":" + config.clientSecret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code", client_id: config.clientId, redirect_uri: config.redirectUri,
      code, code_verifier: flow.verifier,
    }),
    cache: "no-store", signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("OIDC token exchange failed.");
  const tokens = await response.json() as { id_token?: unknown };
  if (typeof tokens.id_token !== "string") throw new Error("OIDC ID token is missing.");
  const verified = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(discovery.jwks_uri)), {
    issuer: config.issuer, audience: config.clientId,
  });
  if (verified.payload.nonce !== flow.nonce) throw new Error("OIDC nonce validation failed.");
  const email = typeof verified.payload.email === "string" ? verified.payload.email.trim().toLowerCase() : "";
  const access = verified.payload.realm_access as { roles?: unknown } | undefined;
  const roles = Array.isArray(access?.roles) ? access.roles.filter((role): role is string => typeof role === "string") : [];
  if (!email || (!roles.includes("hr_user") && !roles.includes("company_admin"))) {
    throw new Error("HR access role is missing.");
  }
  return { email, roles };
}
