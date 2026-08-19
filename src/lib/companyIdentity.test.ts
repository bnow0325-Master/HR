import assert from "node:assert/strict";
import test from "node:test";
import {
  desiredIdentityRoles,
  identityProfileName,
  setCompanyIdentityTemporaryPassword,
  syncCompanyIdentity,
} from "./companyIdentity";

function configureIdentity(clientId: string) {
  process.env.BNOW_IDENTITY_URL = "https://auth.example.test";
  process.env.BNOW_IDENTITY_REALM = "bnow";
  process.env.BNOW_IDENTITY_ADMIN_CLIENT_ID = clientId;
  process.env.BNOW_IDENTITY_ADMIN_CLIENT_SECRET = "test-secret";
}

function employee(active = true) {
  return {
    id: "employee-1",
    code: "E001",
    name: "Test Employee",
    department: "Operations",
    position: "Manager",
    email: "employee@example.test",
    systemRole: "MEMBER",
    active,
    attendanceEnabled: active,
    leaveEnabled: active,
    workboardEnabled: active,
  };
}

test("active administrator receives HR and WorkBoard roles", () => {
  assert.deepEqual(
    desiredIdentityRoles({
      active: true,
      systemRole: "ADMIN",
      attendanceEnabled: true,
      leaveEnabled: true,
      workboardEnabled: true,
    }),
    [
      "company_employee",
      "company_admin",
      "hr_admin",
      "hr_user",
      "workboard_user",
    ],
  );
});

test("active employee only receives roles for enabled applications", () => {
  assert.deepEqual(
    desiredIdentityRoles({
      active: true,
      systemRole: "MEMBER",
      attendanceEnabled: false,
      leaveEnabled: false,
      workboardEnabled: true,
    }),
    ["company_employee", "workboard_user"],
  );
});

test("inactive employee receives no managed roles", () => {
  assert.deepEqual(
    desiredIdentityRoles({
      active: false,
      systemRole: "ADMIN",
      attendanceEnabled: true,
      leaveEnabled: true,
      workboardEnabled: true,
    }),
    [],
  );
});

test("employee names are preserved as one display value", () => {
  assert.deepEqual(identityProfileName("추동현"), {
    firstName: "추동현",
    lastName: "",
  });
  assert.deepEqual(identityProfileName("Test Employee"), {
    firstName: "Test Employee",
    lastName: "",
  });
  assert.deepEqual(identityProfileName("WEIHUANG"), {
    firstName: "WEIHUANG",
    lastName: "",
  });
});

test("new active employee is created and assigned managed roles", async () => {
  configureIdentity("test-create-client");
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, body });

    if (url.endsWith("/protocol/openid-connect/token")) {
      return Response.json({ access_token: "test-token", expires_in: 60 });
    }
    if (url.includes("/users?") && method === "GET") {
      return Response.json([]);
    }
    if (url.endsWith("/users") && method === "POST") {
      return new Response(null, {
        status: 201,
        headers: {
          location:
            "https://auth.example.test/admin/realms/bnow/users/identity-1",
        },
      });
    }
    if (url.includes("/roles?first=0&max=500")) {
      return Response.json([
        { id: "1", name: "company_employee" },
        { id: "2", name: "company_admin" },
        { id: "3", name: "workboard_user" },
        { id: "4", name: "hr_user" },
        { id: "5", name: "hr_admin" },
      ]);
    }
    if (url.endsWith("/role-mappings/realm") && method === "GET") {
      return Response.json([]);
    }
    if (url.endsWith("/role-mappings/realm") && method === "POST") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  try {
    const result = await syncCompanyIdentity(employee());
    assert.equal(result.state, "synced");
    const create = requests.find(
      (request) => request.url.endsWith("/users") && request.method === "POST",
    );
    assert.deepEqual(create?.body, {
      username: "employee@example.test",
      email: "employee@example.test",
      firstName: "Test Employee",
      lastName: "",
      enabled: true,
      emailVerified: true,
      attributes: {
        employee_id: ["employee-1"],
        employee_code: ["E001"],
        department: ["Operations"],
        position: ["Manager"],
      },
    });
    const roleWrite = requests.find(
      (request) =>
        request.url.endsWith("/role-mappings/realm") &&
        request.method === "POST",
    );
    assert.deepEqual(
      (roleWrite?.body as Array<{ name: string }>).map((role) => role.name),
      ["company_employee", "workboard_user", "hr_user"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("existing employee profile is completed without clearing password actions", async () => {
  configureIdentity("test-profile-client");
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, body });

    if (url.endsWith("/protocol/openid-connect/token")) {
      return Response.json({ access_token: "test-token", expires_in: 60 });
    }
    if (url.includes("/users?") && method === "GET") {
      return Response.json([
        {
          id: "identity-1",
          username: "employee@example.test",
          requiredActions: ["UPDATE_PROFILE", "UPDATE_PASSWORD"],
        },
      ]);
    }
    if (url.endsWith("/users/identity-1") && method === "PUT") {
      return new Response(null, { status: 204 });
    }
    if (url.includes("/roles?first=0&max=500")) {
      return Response.json([
        { id: "1", name: "company_employee" },
        { id: "2", name: "company_admin" },
        { id: "3", name: "workboard_user" },
        { id: "4", name: "hr_user" },
        { id: "5", name: "hr_admin" },
      ]);
    }
    if (url.endsWith("/role-mappings/realm") && method === "GET") {
      return Response.json([
        { id: "1", name: "company_employee" },
        { id: "3", name: "workboard_user" },
        { id: "4", name: "hr_user" },
      ]);
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  try {
    const result = await syncCompanyIdentity(employee());
    assert.equal(result.state, "synced");
    const update = requests.find(
      (request) =>
        request.url.endsWith("/users/identity-1") && request.method === "PUT",
    );
    assert.deepEqual(update?.body, {
      username: "employee@example.test",
      email: "employee@example.test",
      firstName: "Test Employee",
      lastName: "",
      enabled: true,
      emailVerified: true,
      attributes: {
        employee_id: ["employee-1"],
        employee_code: ["E001"],
        department: ["Operations"],
        position: ["Manager"],
      },
      requiredActions: ["UPDATE_PASSWORD"],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("inactive employee is disabled and managed roles are removed", async () => {
  configureIdentity("test-disable-client");
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, body });

    if (url.endsWith("/protocol/openid-connect/token")) {
      return Response.json({ access_token: "test-token", expires_in: 60 });
    }
    if (url.includes("/users?") && method === "GET") {
      return Response.json([
        {
          id: "identity-1",
          username: "employee@example.test",
          enabled: true,
        },
      ]);
    }
    if (url.endsWith("/users/identity-1") && method === "PUT") {
      return new Response(null, { status: 204 });
    }
    if (url.includes("/roles?first=0&max=500")) {
      return Response.json([
        { id: "1", name: "company_employee" },
        { id: "2", name: "company_admin" },
        { id: "3", name: "workboard_user" },
        { id: "4", name: "hr_user" },
        { id: "5", name: "hr_admin" },
      ]);
    }
    if (url.endsWith("/role-mappings/realm") && method === "GET") {
      return Response.json([
        { id: "1", name: "company_employee" },
        { id: "3", name: "workboard_user" },
        { id: "4", name: "hr_user" },
      ]);
    }
    if (url.endsWith("/role-mappings/realm") && method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  try {
    const result = await syncCompanyIdentity(employee(false));
    assert.equal(result.state, "disabled");
    const update = requests.find(
      (request) =>
        request.url.endsWith("/users/identity-1") && request.method === "PUT",
    );
    assert.equal((update?.body as { enabled: boolean }).enabled, false);
    const roleDelete = requests.find(
      (request) =>
        request.url.endsWith("/role-mappings/realm") &&
        request.method === "DELETE",
    );
    assert.deepEqual(
      (roleDelete?.body as Array<{ name: string }>).map((role) => role.name),
      ["company_employee", "workboard_user", "hr_user"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("administrator can set a temporary password without storing it in HR", async () => {
  configureIdentity("test-password-client");
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, body });

    if (url.endsWith("/protocol/openid-connect/token")) {
      return Response.json({ access_token: "test-token", expires_in: 60 });
    }
    if (url.includes("/users?") && method === "GET") {
      return Response.json([
        { id: "identity-1", username: "employee@example.test" },
      ]);
    }
    if (url.endsWith("/users/identity-1/reset-password") && method === "PUT") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  try {
    const result = await setCompanyIdentityTemporaryPassword(
      "employee@example.test",
      "temporary-password-1",
    );
    assert.equal(result.ok, true);
    const reset = requests.find((request) =>
      request.url.endsWith("/users/identity-1/reset-password"),
    );
    assert.deepEqual(reset?.body, {
      type: "password",
      value: "temporary-password-1",
      temporary: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
