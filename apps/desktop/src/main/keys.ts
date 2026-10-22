// Phần logic thuần của nhiều API key (không phụ thuộc Electron, để kiểm thử được).

export interface KeyEntry { id: string; label: string; key: string; addedAt: string }
export interface KeyState { lastError?: string | null; lastErrorAt?: string | null; lastUsedAt?: string | null }

// Key vừa báo hết tiền / bị từ chối trong khoảng này thì xếp xuống cuối, đỡ mất thời gian thử lại.
export const COOLDOWN_MS = 30 * 60 * 1000;

export function validateKey(k: string): string | null {
  if (!k.startsWith("sk-ant-")) return "Key phải bắt đầu bằng sk-ant- (lấy trong Claude Console → API Keys).";
  if (k.startsWith("sk-ant-admin")) return "Đây là Admin key. Dùng API key thường của workspace.";
  if (k.startsWith("sk-ant-oat")) return "Đây là mã đăng nhập gói Claude, không phải API key.";
  return null;
}

// Giữ thứ tự ưu tiên anh Trung đặt; key đang trong thời gian nghỉ sau lỗi xuống cuối (vẫn được thử nếu các key khác cũng lỗi).
export function orderForUse(list: KeyEntry[], state: Record<string, KeyState>, now: Date): KeyEntry[] {
  const cooling = (e: KeyEntry) => {
    const t = state[e.id]?.lastErrorAt;
    return !!t && now.getTime() - Date.parse(t) < COOLDOWN_MS;
  };
  return [...list.filter((e) => !cooling(e)), ...list.filter(cooling)];
}

// Lỗi do key (hết tiền, sai key, bị khoá, quá giới hạn tốc độ): chuyển sang key kế tiếp.
const SWITCH_ERRORS = new Set(["billing_error", "authentication_failed", "account_on_hold", "verification_required", "rate_limit"]);
const SWITCH_TEXT = /credit balance|insufficient|billing|invalid api key|authentication|rate.?limit|spend limit|usage limit/i;

// Key cấp tổ chức (không gắn workspace): máy chủ đòi header anthropic-workspace-id. Anh Trung gặp 22/10/2026.
const NO_WORKSPACE = /not scoped to a workspace|anthropic-workspace-id/i;
export const NO_WORKSPACE_REASON = "Key không thuộc workspace nào. Vào Claude Console → Workspaces → chọn workspace → API Keys → Create Key, rồi thêm key mới đó";

export function keyErrorReason(assistantError?: string | null, resultText?: string | null): string | null {
  if (resultText && NO_WORKSPACE.test(resultText)) return NO_WORKSPACE_REASON;
  if (assistantError && SWITCH_ERRORS.has(assistantError)) return LABELS[assistantError] ?? assistantError;
  if (resultText && SWITCH_TEXT.test(resultText)) return resultText.slice(0, 200);
  return null;
}

const LABELS: Record<string, string> = {
  billing_error: "Hết tín dụng hoặc lỗi thanh toán",
  authentication_failed: "Key sai hoặc đã bị thu hồi",
  account_on_hold: "Tài khoản bị tạm khoá",
  verification_required: "Tài khoản cần xác minh",
  rate_limit: "Quá giới hạn tốc độ",
};
