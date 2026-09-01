export type CustomerChatRevocationResult = {
  ok: boolean;
  state: "revoked" | "skipped" | "failed";
  emails: string[];
  message: string;
};

function configuration() {
  const url = process.env.CUSTOMER_CHAT_INTERNAL_URL?.trim().replace(/\/$/, "") ?? "";
  const key = process.env.CUSTOMER_CHAT_INTERNAL_KEY?.trim() ?? "";
  const configured = [url, key].filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== 2) throw new Error("Customer chat revocation environment variables are incomplete.");

  const parsed = new URL(url);
  const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (parsed.protocol !== "https:" && !(loopback && parsed.protocol === "http:")) {
    throw new Error("Customer chat revocation URL must use HTTPS.");
  }
  return { url, key };
}

export async function revokeCustomerChatAccess(
  emails: Array<string | null | undefined>,
): Promise<CustomerChatRevocationResult> {
  const normalized = [...new Set(
    emails
      .map((email) => email?.trim().toLowerCase() ?? "")
      .filter((email) => email.includes("@") && email.length <= 254),
  )];
  if (normalized.length === 0) {
    return {
      ok: true,
      state: "skipped",
      emails: [],
      message: "폐기할 고객채팅 계정이 없습니다.",
    };
  }

  let config: ReturnType<typeof configuration>;
  try {
    config = configuration();
  } catch {
    return {
      ok: false,
      state: "failed",
      emails: normalized,
      message: "고객채팅 폐기 연동 환경변수 설정이 완전하지 않습니다.",
    };
  }
  if (!config) {
    return {
      ok: false,
      state: "failed",
      emails: normalized,
      message: "고객채팅 세션 폐기 연동이 설정되지 않았습니다.",
    };
  }

  try {
    for (const email of normalized) {
      const response = await fetch(
        `${config.url}/access?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: { "X-Workboard-Internal-Key": config.key },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!response.ok) {
        throw new Error(`Customer chat access revocation failed (${response.status}).`);
      }
    }
    return {
      ok: true,
      state: "revoked",
      emails: normalized,
      message: "고객채팅 세션과 푸시 기기를 폐기했습니다.",
    };
  } catch {
    return {
      ok: false,
      state: "failed",
      emails: normalized,
      message: "고객채팅 세션·푸시 기기 폐기에 실패했습니다. 즉시 재시도해 주세요.",
    };
  }
}
