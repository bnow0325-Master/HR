import { jwtVerify } from "jose";

export const WORKBOARD_HANDOFF_AUDIENCE = "bnow-hr";
const DEFAULT_WORKBOARD_ORIGIN = "https://main.bnow.co.kr";
const ALLOWED_RETURN_PATHS = new Set([
  "/attendance",
  "/check",
  "/records",
  "/leave",
  "/business-trips",
  "/profile",
  "/admin",
  "/admin/employees",
]);

export function safeWorkboardReturnTo(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) return "/attendance";
  const path = value.split("?", 1)[0] || "";
  return ALLOWED_RETURN_PATHS.has(path) ? value : "/attendance";
}

function configuration() {
  const secret = process.env.WORKBOARD_SSO_SECRET?.trim() || "";
  const issuer = process.env.WORKBOARD_ORIGIN?.trim().replace(/\/$/, "") || DEFAULT_WORKBOARD_ORIGIN;
  if (secret.length < 32) throw new Error("WORKBOARD_SSO_SECRET is not configured.");
  return { secret, issuer };
}

export async function verifyWorkboardHandoff(ticket: string) {
  const config = configuration();
  const verified = await jwtVerify(
    ticket,
    new TextEncoder().encode(config.secret),
    {
      algorithms: ["HS256"],
      issuer: config.issuer,
      audience: WORKBOARD_HANDOFF_AUDIENCE,
      clockTolerance: 5,
    },
  );
  const email = typeof verified.payload.email === "string"
    ? verified.payload.email.trim().toLowerCase()
    : "";
  if (!email || typeof verified.payload.sub !== "string" || !verified.payload.jti) {
    throw new Error("WorkBoard handoff identity is incomplete.");
  }
  return {
    email,
    returnTo: safeWorkboardReturnTo(verified.payload.returnTo),
  };
}
