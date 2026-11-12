import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { hrChatDeliveryConfig } from "./hrChroTransport";

test("CHRO credentials only go to the canonical HTTPS chat API with a role-scoped bearer", () => {
  const url = "https://chat.bnow.co.kr/api/staff-chat/webhooks/incoming";
  const config = hrChatDeliveryConfig(url, "fixture-secret", true)!;
  assert.equal(config.url, "https://chat.bnow.co.kr/api/staff-chat/ai-executives/chro/employee-messages");
  assert.equal(config.token, createHmac("sha256", "fixture-secret").update("bnowtalk-ai-executive:v1:chro").digest("hex"));
  assert.notEqual(config.token, "fixture-secret");
  for (const bad of [undefined, "http://chat.bnow.co.kr/api/staff-chat/webhooks/incoming", "https://evil.example.test/incoming", "https://chat.bnow.co.kr.evil.example.test/api/staff-chat/webhooks/incoming", `${url}?redirect=1`, `${url}#fragment`, "https://user@chat.bnow.co.kr/api/staff-chat/webhooks/incoming", "https://chat.bnow.co.kr/elsewhere"]) assert.equal(hrChatDeliveryConfig(bad, "fixture-secret", true), null);
  assert.equal(hrChatDeliveryConfig(url, "", true), null);
  assert.equal(hrChatDeliveryConfig(url, "fixture-secret", false)?.token, "fixture-secret");
});
