import assert from "node:assert/strict";
import { test } from "node:test";
import { COOLDOWN_MS, keyErrorReason, orderForUse, validateKey } from "./keys";

const list = ["a", "b", "c"].map((id) => ({ id, label: id, key: `sk-ant-api03-${id}`, addedAt: "" }));

test("giữ thứ tự ưu tiên, key vừa lỗi xuống cuối trong thời gian nghỉ", () => {
  const now = new Date("2026-10-22T10:00:00Z");
  assert.deepEqual(orderForUse(list, {}, now).map((e) => e.id), ["a", "b", "c"]);
  const recent = { a: { lastErrorAt: new Date(now.getTime() - 60_000).toISOString() } };
  assert.deepEqual(orderForUse(list, recent, now).map((e) => e.id), ["b", "c", "a"]);
  const old = { a: { lastErrorAt: new Date(now.getTime() - COOLDOWN_MS - 1).toISOString() } };
  assert.deepEqual(orderForUse(list, old, now).map((e) => e.id), ["a", "b", "c"]);
});

test("nhận đúng lỗi do key", () => {
  assert.ok(keyErrorReason("billing_error", null));
  assert.ok(keyErrorReason("authentication_failed", null));
  assert.ok(keyErrorReason(null, "Your credit balance is too low to access the API"));
  assert.ok(keyErrorReason(null, "Invalid API key · Fix external API key"));
  assert.equal(keyErrorReason("server_error", "Internal error"), null);
  assert.equal(keyErrorReason("max_output_tokens", null), null);
});

test("kiểm định dạng key", () => {
  assert.equal(validateKey("sk-ant-api03-abc"), null);
  assert.ok(validateKey("abc"));
  assert.ok(validateKey("sk-ant-admin01-abc"));
  assert.ok(validateKey("sk-ant-oat01-abc"));
});
