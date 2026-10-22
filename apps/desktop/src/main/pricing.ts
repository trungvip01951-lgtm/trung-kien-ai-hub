import type { ModelId } from "../shared/contract";

// Giá dự phòng (USD / 1 triệu token) để ước tính chi phí khi SDK chưa trả tổng chi phí
// (ví dụ việc bị dừng giữa chừng). Nguồn: bảng giá Claude API, bản lưu 06/10/2026.
// cacheWrite và cacheRead của Haiku không có trong bảng: lấy theo tỉ lệ thường dùng
// (ghi cache = 1,25 x giá vào; đọc cache = 0,1 x giá vào) — chỉ là ước tính.
export const PRICES: Record<ModelId, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export interface TokenUsage { input: number; output: number; cacheRead: number; cacheWrite: number }

export function estimateCostUsd(model: string, u: TokenUsage): number {
  // Model lạ (ví dụ AI phụ dùng model khác): tính theo giá cao nhất để không đếm thiếu.
  const p = PRICES[model as ModelId] ?? PRICES["claude-opus-5-5"];
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1e6;
}
