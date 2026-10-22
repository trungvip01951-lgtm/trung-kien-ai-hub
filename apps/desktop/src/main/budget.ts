import type { Limits } from "../shared/contract";

export const DEFAULT_LIMITS: Limits = { perTaskUsd: 5, dailyUsd: 10, monthlyUsd: 150, cycleStartDay: 1, warnPercents: [70, 90, 100] };

// Không cho bắt đầu việc nếu chỉ còn ít hơn mức này (một lượt gọi agent đã tốn vài xu).
export const MIN_TASK_USD = 0.05;
// SDK chỉ dừng khi ước tính của nó chạm maxBudgetUsd và có thể vượt nhẹ, nên đưa cho SDK
// 85% phần được phép; phần lõi còn tự ngắt khi ước tính riêng chạm 100%.
export const SDK_HEADROOM = 0.85;

// 0h giờ máy (máy anh Trung đặt giờ Việt Nam) của ngày chứa `now`.
export function dayStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Ngày bắt đầu kỳ thanh toán gần nhất (tín dụng gói Max hết hạn cuối mỗi kỳ).
export function cycleStart(now: Date, startDay: number): Date {
  const d = Math.min(Math.max(Math.trunc(startDay) || 1, 1), 28);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), d);
  return now >= thisMonth ? thisMonth : new Date(now.getFullYear(), now.getMonth() - 1, d);
}

export function validateLimits(l: Limits): string | null {
  const nums = [l.perTaskUsd, l.dailyUsd, l.monthlyUsd];
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return "Hạn mức phải là số dương.";
  if (l.perTaskUsd > l.dailyUsd) return "Hạn mức mỗi việc không được lớn hơn hạn mức ngày.";
  if (l.dailyUsd > l.monthlyUsd) return "Hạn mức ngày không được lớn hơn hạn mức kỳ.";
  if (!Number.isInteger(l.cycleStartDay) || l.cycleStartDay < 1 || l.cycleStartDay > 28) return "Ngày bắt đầu kỳ phải từ 1 đến 28.";
  return null;
}

const usd = (n: number) => `${n.toFixed(2)} USD`;

// Số tiền tối đa việc kế tiếp được dùng, hoặc lý do bị chặn.
export function allowance(l: Limits, spentToday: number, spentCycle: number): { allowedUsd: number; blockedReason: string | null } {
  const leftDay = l.dailyUsd - spentToday;
  const leftCycle = l.monthlyUsd - spentCycle;
  const allowed = Math.min(l.perTaskUsd, leftDay, leftCycle);
  if (allowed >= MIN_TASK_USD) return { allowedUsd: allowed, blockedReason: null };
  const reason = leftCycle < MIN_TASK_USD
    ? `Đã dùng ${usd(spentCycle)} / hạn mức kỳ ${usd(l.monthlyUsd)}. Chờ kỳ mới hoặc nâng hạn mức trong mục Chi phí API.`
    : `Đã dùng ${usd(spentToday)} / hạn mức ngày ${usd(l.dailyUsd)}. Chờ sang ngày mới hoặc nâng hạn mức trong mục Chi phí API.`;
  return { allowedUsd: Math.max(allowed, 0), blockedReason: reason };
}

// Ngưỡng cảnh báo cao nhất vừa bị vượt qua khi chi tiêu đi từ `before` lên `after`.
export function crossedWarning(before: number, after: number, limit: number, percents: number[]): number | null {
  let hit: number | null = null;
  for (const p of [...percents].sort((a, b) => a - b)) {
    const t = (limit * p) / 100;
    if (before < t && after >= t) hit = p;
  }
  return hit;
}
