import assert from "node:assert/strict";
import test from "node:test";
import { missingCheckoutDecision } from "./hrMissingCheckoutRules";

const now = new Date("2026-11-13T00:01:00Z"); // KST 09:01
const event = (type: string, time: string, cancelled = false) => ({ type, timestamp: new Date(time), cancelledAt: cancelled ? now : null });
test("only yesterday's unambiguous open session older than 24h is reminded after 09:00 KST", () => {
  const list = [event("IN", "2026-11-12T00:00:00Z")];
  assert.equal(missingCheckoutDecision(list, "2026-11-12", now), "missing");
  assert.equal(missingCheckoutDecision(list, "2026-11-12", new Date("2026-11-12T23:59:00Z")), "not-due");
  assert.equal(missingCheckoutDecision(list, "2026-11-10", now), "not-due");
  assert.equal(missingCheckoutDecision([], "2026-11-12", now), "none");
  assert.equal(missingCheckoutDecision(list, "2026-11-12", now, true), "review");
});

test("09:30 IN is rechecked after 24h; 21:00 and 23:59 IN remain candidates across date boundaries", () => {
  const normal = [event("IN", "2026-11-12T00:30:00Z")];
  assert.equal(missingCheckoutDecision(normal, "2026-11-12", now), "working");
  assert.equal(missingCheckoutDecision(normal, "2026-11-12", new Date("2026-11-13T00:35:00Z")), "missing");
  const night = [event("IN", "2026-11-12T12:00:00Z")];
  assert.equal(missingCheckoutDecision(night, "2026-11-12", new Date("2026-11-13T12:05:00Z")), "missing");
  const late = [event("IN", "2026-11-12T14:59:00Z")];
  assert.equal(missingCheckoutDecision(late, "2026-11-12", new Date("2026-11-14T00:00:00Z")), "missing");
  assert.equal(missingCheckoutDecision([...late, event("OUT", "2026-11-13T06:00:00Z")], "2026-11-12", new Date("2026-11-14T00:00:00Z")), "closed");
});
test("night shift and next-day OUT, cancelled OUT, duplicate IN and orphan OUT do not trigger", () => {
  const night = [event("IN", "2026-11-12T12:00:00Z")];
  assert.equal(missingCheckoutDecision(night, "2026-11-12", now), "working");
  assert.equal(missingCheckoutDecision([...night, event("OUT", "2026-11-12T23:50:00Z")], "2026-11-12", now), "closed");
  const start = event("IN", "2026-11-12T00:00:00Z");
  assert.equal(missingCheckoutDecision([start, event("OUT", "2026-11-12T09:00:00Z", true)], "2026-11-12", now), "review");
  assert.equal(missingCheckoutDecision([start, event("IN", "2026-11-12T01:00:00Z")], "2026-11-12", now), "review");
  assert.equal(missingCheckoutDecision([start, event("OUT", "2026-11-12T09:00:00Z"), event("OUT", "2026-11-12T09:00:00Z")], "2026-11-12", now), "review");
});
test("multiple completed sessions are valid; only a later unclosed session is considered", () => {
  const events = [event("IN", "2026-11-11T20:00:00Z"), event("OUT", "2026-11-12T00:00:00Z"), event("IN", "2026-11-12T01:00:00Z"), event("OUT", "2026-11-12T09:00:00Z")];
  assert.equal(missingCheckoutDecision(events, "2026-11-12", now), "closed");
  assert.equal(missingCheckoutDecision([event("IN", "2026-11-12T00:00:00Z"), event("OUT", "2026-11-12T08:00:00Z")], "2026-11-12", now), "closed");
});
