import assert from "node:assert/strict";
import test from "node:test";
import { revokeCustomerChatAccess } from "./customerChatAccess";

test("revocation calls LC_CHAT once per normalized employee email", async () => {
  process.env.CUSTOMER_CHAT_INTERNAL_URL = "https://main.example.test/api/customer-chat-internal";
  process.env.CUSTOMER_CHAT_INTERNAL_KEY = "test-internal-key-with-more-than-32-characters";
  const originalFetch = global.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ revoked: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await revokeCustomerChatAccess([
      " Employee@Example.test ",
      "employee@example.test",
      null,
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.state, "revoked");
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/access\?email=employee%40example\.test$/);
    assert.equal(requests[0].init?.method, "DELETE");
    assert.deepEqual(requests[0].init?.headers, {
      "X-Workboard-Internal-Key": process.env.CUSTOMER_CHAT_INTERNAL_KEY,
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("required revocation fails closed when integration is not configured", async () => {
  delete process.env.CUSTOMER_CHAT_INTERNAL_URL;
  delete process.env.CUSTOMER_CHAT_INTERNAL_KEY;
  const result = await revokeCustomerChatAccess(["employee@example.test"]);
  assert.equal(result.ok, false);
  assert.equal(result.state, "failed");
});

test("no target is a successful no-op", async () => {
  const result = await revokeCustomerChatAccess([null, ""]);
  assert.equal(result.ok, true);
  assert.equal(result.state, "skipped");
});
