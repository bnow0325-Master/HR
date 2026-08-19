type CompanyIdentityEmployee = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  position: string | null;
  email: string | null;
  systemRole: string;
  active: boolean;
  attendanceEnabled: boolean;
  leaveEnabled: boolean;
  workboardEnabled: boolean;
};

export type CompanyIdentitySyncResult = {
  ok: boolean;
  state: "synced" | "disabled" | "skipped" | "failed";
  message: string;
};

export type CompanyIdentityPasswordResult = {
  ok: boolean;
  message: string;
};

type IdentityConfiguration = {
  url: string;
  realm: string;
  clientId: string;
  clientSecret: string;
};

type KeycloakUser = {
  id?: string;
  username?: string;
  email?: string;
  enabled?: boolean;
  requiredActions?: string[];
};

type KeycloakRole = {
  id: string;
  name: string;
};

const MANAGED_REALM_ROLES = [
  "company_employee",
  "company_admin",
  "workboard_user",
  "hr_user",
  "hr_admin",
] as const;

let cachedToken:
  | { cacheKey: string; value: string; expiresAt: number }
  | undefined;

function configuration(): IdentityConfiguration | null {
  const values = {
    url: process.env.BNOW_IDENTITY_URL?.replace(/\/$/, "") ?? "",
    realm: process.env.BNOW_IDENTITY_REALM?.trim() ?? "",
    clientId: process.env.BNOW_IDENTITY_ADMIN_CLIENT_ID?.trim() ?? "",
    clientSecret:
      process.env.BNOW_IDENTITY_ADMIN_CLIENT_SECRET?.trim() ?? "",
  };
  const configured = Object.values(values).filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== Object.keys(values).length) {
    throw new Error("BNOW identity environment variables are incomplete.");
  }
  return values;
}

export function desiredIdentityRoles(
  employee: Pick<
    CompanyIdentityEmployee,
    | "active"
    | "systemRole"
    | "attendanceEnabled"
    | "leaveEnabled"
    | "workboardEnabled"
  >,
) {
  if (!employee.active) return [];

  const roles = ["company_employee"];
  if (employee.systemRole === "ADMIN") {
    roles.push("company_admin", "hr_admin");
  }
  if (employee.attendanceEnabled || employee.leaveEnabled) {
    roles.push("hr_user");
  }
  if (employee.workboardEnabled) roles.push("workboard_user");
  return roles;
}

export function identityProfileName(fullName: string) {
  const normalized = fullName.trim().replace(/\s+/g, " ");
  if (/^[가-힣]{2,4}$/.test(normalized)) {
    return {
      firstName: normalized.slice(1),
      lastName: normalized.slice(0, 1),
    };
  }

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length > 1) {
    return {
      firstName: parts.slice(0, -1).join(" "),
      lastName: parts.at(-1) ?? "-",
    };
  }

  return { firstName: normalized || "-", lastName: "-" };
}

function realmAdminUrl(config: IdentityConfiguration, path: string) {
  return `${config.url}/admin/realms/${encodeURIComponent(config.realm)}${path}`;
}

async function adminToken(config: IdentityConfiguration) {
  const cacheKey = `${config.url}|${config.realm}|${config.clientId}`;
  if (
    cachedToken?.cacheKey === cacheKey &&
    cachedToken.expiresAt > Date.now() + 10_000
  ) {
    return cachedToken.value;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const response = await fetch(
    `${config.url}/realms/${encodeURIComponent(config.realm)}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Identity token request failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof payload.access_token !== "string") {
    throw new Error("Identity token response did not include an access token.");
  }
  const expiresIn =
    typeof payload.expires_in === "number" ? payload.expires_in : 60;
  cachedToken = {
    cacheKey,
    value: payload.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return payload.access_token;
}

function adminHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function findUser(
  config: IdentityConfiguration,
  token: string,
  email: string,
) {
  const query = new URLSearchParams({ username: email, exact: "true", max: "2" });
  const response = await fetch(
    `${realmAdminUrl(config, "/users")}?${query.toString()}`,
    { headers: adminHeaders(token), cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`Identity user lookup failed (${response.status}).`);
  }
  const users = (await response.json()) as KeycloakUser[];
  return users.find(
    (user) => user.username?.toLowerCase() === email.toLowerCase(),
  );
}

async function updateUser(
  config: IdentityConfiguration,
  token: string,
  userId: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(
    realmAdminUrl(config, `/users/${encodeURIComponent(userId)}`),
    {
      method: "PUT",
      headers: adminHeaders(token),
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Identity user update failed (${response.status}).`);
  }
}

async function disableUserByEmail(
  config: IdentityConfiguration,
  token: string,
  email: string,
) {
  const user = await findUser(config, token, email);
  if (!user?.id) return;
  await updateUser(config, token, user.id, { enabled: false });
}

async function upsertUser(
  config: IdentityConfiguration,
  token: string,
  employee: CompanyIdentityEmployee,
  email: string,
) {
  const enabled = employee.active;
  const profileName = identityProfileName(employee.name);
  const representation = {
    username: email,
    email,
    ...profileName,
    enabled,
    emailVerified: true,
    attributes: {
      employee_id: [employee.id],
      employee_code: [employee.code],
      department: [employee.department ?? ""],
      position: [employee.position ?? ""],
    },
  };
  let user = await findUser(config, token, email);
  if (user?.id) {
    const requiredActions = user.requiredActions?.filter(
      (action) => action !== "UPDATE_PROFILE",
    );
    await updateUser(config, token, user.id, {
      ...representation,
      ...(requiredActions ? { requiredActions } : {}),
    });
    return { id: user.id, enabled };
  }

  const response = await fetch(realmAdminUrl(config, "/users"), {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify(representation),
    cache: "no-store",
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`Identity user creation failed (${response.status}).`);
  }

  const location = response.headers.get("location");
  const locationId = location?.split("/").filter(Boolean).at(-1);
  if (locationId) return { id: locationId, enabled };

  user = await findUser(config, token, email);
  if (!user?.id) throw new Error("Identity user was created but not found.");
  return { id: user.id, enabled };
}

async function syncRealmRoles(
  config: IdentityConfiguration,
  token: string,
  userId: string,
  desiredRoleNames: string[],
) {
  const [rolesResponse, assignedResponse] = await Promise.all([
    fetch(realmAdminUrl(config, "/roles?first=0&max=500"), {
      headers: adminHeaders(token),
      cache: "no-store",
    }),
    fetch(
      realmAdminUrl(
        config,
        `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      ),
      { headers: adminHeaders(token), cache: "no-store" },
    ),
  ]);
  if (!rolesResponse.ok || !assignedResponse.ok) {
    throw new Error(
      `Identity role lookup failed (${rolesResponse.status}/${assignedResponse.status}).`,
    );
  }

  const allRoles = (await rolesResponse.json()) as KeycloakRole[];
  const assignedRoles = (await assignedResponse.json()) as KeycloakRole[];
  const desired = new Set(desiredRoleNames);
  const assigned = new Set(assignedRoles.map((role) => role.name));
  const managed = new Set<string>(MANAGED_REALM_ROLES);
  const missingDefinitions = desiredRoleNames.filter(
    (name) => !allRoles.some((role) => role.name === name),
  );
  if (missingDefinitions.length > 0) {
    throw new Error(`Identity roles are missing: ${missingDefinitions.join(", ")}.`);
  }

  const toAdd = allRoles.filter(
    (role) => desired.has(role.name) && !assigned.has(role.name),
  );
  const toRemove = assignedRoles.filter(
    (role) => managed.has(role.name) && !desired.has(role.name),
  );
  const mappingUrl = realmAdminUrl(
    config,
    `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
  );
  if (toAdd.length > 0) {
    const response = await fetch(mappingUrl, {
      method: "POST",
      headers: adminHeaders(token),
      body: JSON.stringify(toAdd),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Identity role assignment failed (${response.status}).`);
    }
  }
  if (toRemove.length > 0) {
    const response = await fetch(mappingUrl, {
      method: "DELETE",
      headers: adminHeaders(token),
      body: JSON.stringify(toRemove),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Identity role removal failed (${response.status}).`);
    }
  }
}

export async function syncCompanyIdentity(
  employee: CompanyIdentityEmployee,
  previousEmail?: string | null,
): Promise<CompanyIdentitySyncResult> {
  let config: IdentityConfiguration | null;
  try {
    config = configuration();
  } catch {
    return {
      ok: false,
      state: "failed",
      message: "사내 인증 환경변수 설정이 완전하지 않습니다.",
    };
  }
  if (!config) {
    return {
      ok: false,
      state: "skipped",
      message: "사내 인증 동기화 환경변수가 설정되지 않았습니다.",
    };
  }

  const email = employee.email?.trim().toLowerCase() || null;
  const oldEmail = previousEmail?.trim().toLowerCase() || null;
  if (!email && !oldEmail) {
    return {
      ok: true,
      state: "skipped",
      message: "회사 이메일이 없어 사내 로그인 계정을 만들지 않았습니다.",
    };
  }

  try {
    const token = await adminToken(config);
    if (oldEmail && oldEmail !== email) {
      await disableUserByEmail(config, token, oldEmail);
    }
    if (!email) {
      return {
        ok: true,
        state: "disabled",
        message: "기존 사내 로그인 계정을 비활성화했습니다.",
      };
    }

    const user = await upsertUser(config, token, employee, email);
    await syncRealmRoles(
      config,
      token,
      user.id,
      desiredIdentityRoles(employee),
    );
    return {
      ok: true,
      state: user.enabled ? "synced" : "disabled",
      message: user.enabled
        ? "사내 로그인 계정과 권한을 동기화했습니다."
        : "퇴사자의 사내 로그인 계정을 비활성화했습니다.",
    };
  } catch {
    return {
      ok: false,
      state: "failed",
      message: "사내 인증 계정 동기화에 실패했습니다.",
    };
  }
}

export async function setCompanyIdentityTemporaryPassword(
  email: string,
  password: string,
): Promise<CompanyIdentityPasswordResult> {
  let config: IdentityConfiguration | null;
  try {
    config = configuration();
  } catch {
    return {
      ok: false,
      message: "사내 인증 환경변수 설정이 완전하지 않습니다.",
    };
  }
  if (!config) {
    return {
      ok: false,
      message: "사내 인증 서버가 설정되지 않았습니다.",
    };
  }

  try {
    const token = await adminToken(config);
    const user = await findUser(config, token, email.trim().toLowerCase());
    if (!user?.id) {
      return {
        ok: false,
        message: "사내 로그인 계정을 찾을 수 없습니다.",
      };
    }

    const response = await fetch(
      realmAdminUrl(
        config,
        `/users/${encodeURIComponent(user.id)}/reset-password`,
      ),
      {
        method: "PUT",
        headers: adminHeaders(token),
        body: JSON.stringify({
          type: "password",
          value: password,
          temporary: true,
        }),
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new Error(`Identity password reset failed (${response.status}).`);
    }

    return {
      ok: true,
      message:
        "사내 통합 계정의 임시 비밀번호를 설정했습니다. 다음 로그인에서 새 비밀번호로 변경해야 합니다.",
    };
  } catch {
    return {
      ok: false,
      message: "사내 통합 계정의 임시 비밀번호 설정에 실패했습니다.",
    };
  }
}
