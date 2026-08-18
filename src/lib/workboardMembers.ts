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

export type WorkboardAccountResult = {
  ok: boolean;
  state: "created" | "updated" | "failed";
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

type WorkboardAuthUser = {
  id?: unknown;
  email?: unknown;
};

async function findWorkboardAuthUser(
  url: string,
  key: string,
  email: string,
) {
  const response = await fetch(
    `${url}/auth/v1/admin/users?page=1&per_page=1000`,
    {
      headers: headers(key),
      cache: "no-store",
    },
  );
  if (!response.ok) return null;

  const payload = (await response.json()) as
    | WorkboardAuthUser[]
    | { users?: WorkboardAuthUser[] };
  const users = Array.isArray(payload) ? payload : payload.users ?? [];
  const matched = users.find(
    (user) =>
      typeof user.email === "string" &&
      user.email.toLowerCase() === email.toLowerCase(),
  );
  return matched && typeof matched.id === "string" ? matched.id : null;
}

export async function provisionWorkboardAccount(input: {
  email: string;
  password: string;
  name: string;
  systemRole: "ADMIN" | "MEMBER";
}): Promise<WorkboardAccountResult> {
  const { url, key } = configuration();
  if (!url || !key) {
    return {
      ok: false,
      state: "failed",
      message: "WorkBoard 계정 관리 환경변수가 설정되지 않았습니다.",
    };
  }

  try {
    const email = input.email.trim().toLowerCase();
    const createResponse = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        email,
        password: input.password,
        email_confirm: true,
        user_metadata: { full_name: input.name },
      }),
      cache: "no-store",
    });

    let state: WorkboardAccountResult["state"] = "created";
    if (!createResponse.ok) {
      const userId = await findWorkboardAuthUser(url, key, email);
      if (!userId) {
        return {
          ok: false,
          state: "failed",
          message: `WorkBoard 로그인 계정을 만들지 못했습니다. (${createResponse.status})`,
        };
      }

      const updateResponse = await fetch(
        `${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "PUT",
          headers: headers(key),
          body: JSON.stringify({ password: input.password }),
          cache: "no-store",
        },
      );
      if (!updateResponse.ok) {
        return {
          ok: false,
          state: "failed",
          message: `WorkBoard 비밀번호를 재설정하지 못했습니다. (${updateResponse.status})`,
        };
      }
      state = "updated";
    }

    const memberSync = await syncWorkboardMember({
      email,
      name: input.name,
      systemRole: input.systemRole,
      active: true,
      workboardEnabled: true,
    });
    if (!memberSync.ok) {
      return {
        ok: false,
        state: "failed",
        message: `로그인 계정은 처리했지만 권한 동기화에 실패했습니다. ${memberSync.message}`,
      };
    }

    return {
      ok: true,
      state,
      message:
        state === "created"
          ? "WorkBoard 로그인 계정을 만들었습니다."
          : "기존 WorkBoard 계정의 비밀번호와 권한을 갱신했습니다.",
    };
  } catch {
    return {
      ok: false,
      state: "failed",
      message: "WorkBoard 계정 처리 중 네트워크 오류가 발생했습니다.",
    };
  }
}
