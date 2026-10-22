import assert from "node:assert/strict";
import { test } from "node:test";
import { allowance, crossedWarning, cycleStart, DEFAULT_LIMITS, validateLimits } from "./budget";

test("kỳ thanh toán: trước ngày bắt đầu thì lùi về tháng trước", () => {
  assert.deepEqual(cycleStart(new Date(2026, 9, 5, 10), 15), new Date(2026, 8, 15));
  assert.deepEqual(cycleStart(new Date(2026, 9, 15, 0), 15), new Date(2026, 9, 15));
  assert.deepEqual(cycleStart(new Date(2026, 0, 3), 10), new Date(2025, 11, 10));
});

test("hạn mức: lấy mức nhỏ nhất giữa việc, ngày, kỳ", () => {
  const l = DEFAULT_LIMITS; // 5 / 10 / 150
  assert.equal(allowance(l, 0, 0).allowedUsd, 5);
  assert.equal(allowance(l, 8, 8).allowedUsd, 2);
  assert.equal(allowance(l, 0, 148).allowedUsd, 2);
  assert.equal(allowance(l, 1, 1).blockedReason, null);
});

test("hạn mức: chặn khi hết ngày hoặc hết kỳ, nêu đúng lý do", () => {
  const day = allowance(DEFAULT_LIMITS, 9.99, 20);
  assert.ok(day.blockedReason?.includes("hạn mức ngày"));
  const cycle = allowance(DEFAULT_LIMITS, 0, 150);
  assert.ok(cycle.blockedReason?.includes("hạn mức kỳ"));
  assert.equal(allowance(DEFAULT_LIMITS, 12, 12).allowedUsd, 0);
});

test("cảnh báo: báo ngưỡng cao nhất vừa vượt, không báo lại", () => {
  assert.equal(crossedWarning(6, 7.5, 10, [70, 90, 100]), 70);
  assert.equal(crossedWarning(6, 10.2, 10, [70, 90, 100]), 100);
  assert.equal(crossedWarning(7.5, 8, 10, [70, 90, 100]), null);
});

test("kiểm hạn mức nhập vào", () => {
  assert.equal(validateLimits(DEFAULT_LIMITS), null);
  assert.ok(validateLimits({ ...DEFAULT_LIMITS, perTaskUsd: 20 }));
  assert.ok(validateLimits({ ...DEFAULT_LIMITS, dailyUsd: -1 }));
  assert.ok(validateLimits({ ...DEFAULT_LIMITS, cycleStartDay: 31 }));
});
