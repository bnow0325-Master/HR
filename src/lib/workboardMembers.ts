type WorkboardMember = {
  email: string | null;
  name: string;
  systemRole: string;
  active: boolean;
  workboardEnabled: boolean;
};

export type WorkboardSyncResult = {
  ok: boolean;
  state: "synced" | "disabled" | "skipped" | "failed";
  message: string;
};

function configuration() {
  const url = process.env.WORKBOARD_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const key = process.env.WORKBOARD_SUPABASE_SERVICE_ROLE_KEY ?? "";
  return { url, key };
}

function headers(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function setMemberInactive(email: string) {
  const { url, key } = configuration();
  if (!url || !key) return false;

  const response = await fetch(
    `${url}/rest/v1/app_members?email=eq.${encodeURIComponent(email)}`,
    {
      method: "PATCH",
      headers: headers(key),
      body: JSON.stringify({ is_active: false }),
      cache: "no-store",
    },
  );
  return response.ok;
}

export async function syncWorkboardMember(
  employee: WorkboardMember,
  previousEmail?: string | null,
): Promise<WorkboardSyncResult> {
  const { url, key } = configuration();
  if (!url || !key) {
    return {
      ok: false,
      state: "skipped",
      message: "WorkBoard 동기화 환경변수가 설정되지 않았습니다.",
    };
  }

  try {
    const email = employee.email?.trim().toLowerCase() || null;
    const oldEmail = previousEmail?.trim().toLowerCase() || null;

    if (oldEmail && oldEmail !== email) {
      await setMemberInactive(oldEmail);
    }

    if (!email) {
      return {
        ok: true,
        state: "skipped",
        message: "이메일이 없어 WorkBoard 계정을 만들지 않았습니다.",
      };
    }

    const enabled = employee.active && employee.workboardEnabled;
    const response = await fetch(
      `${url}/rest/v1/app_members?on_conflict=email`,
      {
        method: "POST",
        headers: {
          ...headers(key),
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          email,
          full_name: employee.name,
          role: employee.systemRole === "ADMIN" ? "admin" : "member",
          is_active: enabled,
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        state: "failed",
        message: `WorkBoard 동기화에 실패했습니다. (${response.status})`,
      };
    }

    return {
      ok: true,
      state: enabled ? "synced" : "disabled",
      message: enabled
        ? "WorkBoard 권한을 동기화했습니다."
        : "WorkBoard 접근을 비활성화했습니다.",
    };
  } catch {
    return {
      ok: false,
      state: "failed",
      message: "WorkBoard 동기화 중 네트워크 오류가 발생했습니다.",
    };
  }
}
