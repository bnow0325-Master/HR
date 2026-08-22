import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizationEventDate,
  authorizationLetterNumber,
  authorizationOrganization,
  authorizationScope,
  defaultAuthorizationForm,
} from "./authorizationLetter";

test("authorization text fields are normalized", () => {
  assert.equal(
    authorizationOrganization("  대전창조경제혁신센터  "),
    "대전창조경제혁신센터",
  );
  assert.equal(
    authorizationScope("  대리 참석   및 발표  "),
    "대리 참석 및 발표",
  );
});

test("invalid event date falls back to the Korean current date", () => {
  const now = new Date("2026-08-22T02:00:00.000Z");
  assert.equal(authorizationEventDate("2026-02-30", now), "2026-08-22");
});

test("authorization metadata is deterministic", () => {
  assert.equal(
    authorizationLetterNumber("2026-08-22", "004"),
    "BNOW-POA-20260822-004",
  );
  assert.deepEqual(defaultAuthorizationForm(new Date("2026-08-21T15:30:00Z")), {
    organization: "",
    eventDate: "2026-08-22",
    title: "대리 참석 및 발표",
    scope: "행사 대리 참석, 발표 및 현장 안내 수령·확인 업무",
    issuedOn: "2026-08-22",
  });
});
