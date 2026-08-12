type SupabaseUser = {
  id?: string;
  email?: string;
};

export function workboardAuthConfigured() {
  return Boolean(
    process.env.WORKBOARD_SUPABASE_URL?.trim() &&
      process.env.WORKBOARD_SUPABASE_ANON_KEY?.trim(),
  );
}

export async function verifyWorkboardAccessToken(accessToken: string) {
  const supabaseUrl = process.env.WORKBOARD_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.WORKBOARD_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!supabaseUrl || !anonKey) return null;

  let userUrl: URL;
  try {
    userUrl = new URL("/auth/v1/user", supabaseUrl);
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
