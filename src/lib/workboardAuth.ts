type SupabaseUser = {
  id?: string;
  email?: string;
};

type PasswordChangeResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_credentials" | "password_rejected" | "unavailable";
    };

function configuration() {
  return {
    url: process.env.WORKBOARD_SUPABASE_URL?.trim() ?? "",
    anonKey: process.env.WORKBOARD_SUPABASE_ANON_KEY?.trim() ?? "",
  };
}

export function workboardAuthConfigured() {
  const { url, anonKey } = configuration();
  return Boolean(url && anonKey);
}

export async function verifyWorkboardAccessToken(accessToken: string) {
  const { url, anonKey } = configuration();
  if (!url || !anonKey) return null;

  let userUrl: URL;
  try {
    userUrl = new URL("/auth/v1/user", url);
  } catch {
    return null;
  }

  const response = await fetch(userUrl, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;

  const user = (await response.json()) as SupabaseUser;
  const email = user.email?.trim().toLowerCase();
  if (!user.id || !email) return null;

  return { id: user.id, email };
}

export async function changeWorkboardPassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<PasswordChangeResult> {
  const { url, anonKey } = configuration();
  if (!url || !anonKey) return { ok: false, reason: "unavailable" };

  try {
    const tokenUrl = new URL("/auth/v1/token", url);
    tokenUrl.searchParams.set("grant_type", "password");
    const loginResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password: currentPassword }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (loginResponse.status === 400 || loginResponse.status === 401) {
      return { ok: false, reason: "invalid_credentials" };
    }
    if (!loginResponse.ok) return { ok: false, reason: "unavailable" };

    const loginData = (await loginResponse.json()) as {
      access_token?: string;
    };
    if (!loginData.access_token) {
      return { ok: false, reason: "unavailable" };
    }

    const updateResponse = await fetch(new URL("/auth/v1/user", url), {
      method: "PUT",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${loginData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: newPassword }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (updateResponse.ok) return { ok: true };
    if (updateResponse.status === 400 || updateResponse.status === 422) {
      return { ok: false, reason: "password_rejected" };
    }
    return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
