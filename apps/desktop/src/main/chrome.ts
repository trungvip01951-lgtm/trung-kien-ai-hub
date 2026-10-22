import path from "node:path";
import type { McpStdioServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { ChromeSettings, SiteMode } from "../shared/contract";
import type { Decision } from "./policy";

// Điều khiển trình duyệt (Mốc 2) bằng Playwright MCP chính thức (@playwright/mcp, ghim 0.0.83).
// - Hồ sơ trình duyệt riêng trong thư mục dữ liệu app, không đụng hồ sơ Chrome chính của anh Trung.
// - Dùng Chrome (hoặc Edge) đã cài trên máy, không tải trình duyệt khác.
// - Quyền theo website do app kiểm ở lớp hỏi quyền (PreToolUse): tài liệu Playwright MCP ghi rõ
//   --allowed-origins "không phải hàng rào bảo mật", nên không dựa vào nó.

export const CHROME_SERVER = "chrome";
const PREFIX = `mcp__${CHROME_SERVER}__`;

export interface ChromePaths { nodeBinary: string; cliPath: string; profileDir: string; outputDir: string; executablePath?: string }

// Lệnh chạy máy chủ MCP: dùng chính tệp chạy của Electron ở chế độ Node (ELECTRON_RUN_AS_NODE),
// nên máy anh không cần cài Node riêng.
export function chromeServerConfig(s: ChromeSettings, p: ChromePaths): McpStdioServerConfig {
  const args = [p.cliPath, "--user-data-dir", p.profileDir, "--output-dir", p.outputDir, "--image-responses", "allow"];
  if (p.executablePath) args.push("--executable-path", p.executablePath);
  else args.push("--browser", s.browser);
  return { type: "stdio", command: p.nodeBinary, args, env: { ELECTRON_RUN_AS_NODE: "1" } };
}

export const CHROME_GUIDE = [
  "Trình duyệt: dùng các công cụ mcp__chrome__ (hồ sơ trình duyệt riêng của app).",
  "- Đọc trang bằng browser_snapshot; sau mỗi thao tác quan trọng chụp lại snapshot để xác minh trang đã đổi đúng.",
  "- Lỗi thì thử lại tối đa 1 lần sau khi snapshot lại; vẫn lỗi thì dừng và báo.",
  "- Gặp CAPTCHA, xác minh người dùng hoặc trang đăng nhập: dừng, nhờ anh Trung tự làm trong trình duyệt của app. Không tìm cách vượt.",
  "- Không đọc, chép hay gửi cookie, mã truy cập, mật khẩu.",
  "- Thao tác đăng, lưu, gửi, xoá, thanh toán hay sửa tài khoản: app sẽ hỏi anh Trung trước; ghi rõ sẽ bấm gì và vì sao.",
].join("\n");

export const isBrowserTool = (toolName: string) => toolName.startsWith(PREFIX);

// Chỉ đọc hoặc điều hướng trong trang: không đổi dữ liệu trên website.
const READ = new Set(["browser_snapshot", "browser_take_screenshot", "browser_wait_for", "browser_console_messages", "browser_network_requests",
  "browser_network_request", "browser_navigate_back", "browser_resize", "browser_close", "browser_find", "browser_verify_element_visible",
  "browser_generate_locator", "browser_hover", "browser_highlight", "browser_hide_highlight", "browser_get_config", "browser_mouse_move_xy",
  "browser_mouse_wheel", "browser_pdf_save", "browser_annotate"]);
// Thao tác lên trang: có thể đổi dữ liệu trên website.
const INTERACT = new Set(["browser_click", "browser_type", "browser_fill_form", "browser_select_option", "browser_press_key", "browser_drag",
  "browser_drop", "browser_file_upload", "browser_handle_dialog", "browser_mouse_click_xy", "browser_mouse_down", "browser_mouse_up",
  "browser_mouse_drag_xy"]);
// Cookie, bộ nhớ trang, chặn/sửa mạng, ghi vết (có cookie), chạy mã Playwright tuỳ ý: không cho.
const BLOCKED = /^browser_(cookie_|localstorage_|sessionstorage_|storage_state|set_storage_state|route|unroute|network_state_set|start_tracing|stop_tracing|run_code)/;
// Chữ trên nút/ô cho thấy thao tác gửi đi, lưu hay đổi dữ liệu thật.
const RISKY = /(?<![\p{L}\p{N}])(đăng|lưu|gửi|xoá|xóa|huỷ|hủy|thanh toán|đặt hàng|mua|xác nhận|cập nhật|áp dụng|chuyển tiền|dang bai|luu|gui|xoa|publish|post|save|submit|send|delete|remove|update|apply|confirm|pay|checkout|order|buy|sign ?(in|up|out)|log ?(in|out)|password|mật khẩu)(?![\p{L}\p{N}])/iu;

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.hostname.toLowerCase() : null;
  } catch { return null; }
}

// Quyền của một website: khớp đúng tên miền hoặc tên miền con (www.example.com khớp example.com).
export function siteMode(s: ChromeSettings, url: string | null): SiteMode | null {
  const host = url ? hostOf(url) : null;
  if (!host) return null;
  let best: { len: number; mode: SiteMode } | null = null;
  for (const site of s.sites) {
    const h = site.host.trim().toLowerCase().replace(/^\*\./, "");
    if (h && (host === h || host.endsWith(`.${h}`)) && (!best || h.length > best.len)) best = { len: h.length, mode: site.mode };
  }
  return best?.mode ?? null;
}

const MODE_LABEL: Record<SiteMode, string> = { read: "Chỉ xem", ask: "Hỏi từng thao tác", auto: "Tự làm thao tác thường" };

export function isRiskyAction(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName === "browser_file_upload" || toolName === "browser_handle_dialog" || toolName === "browser_drop") return true;
  if (toolName === "browser_type" && input.submit) return true;
  if (toolName === "browser_press_key" && /^(enter|numpadenter)$/i.test(String(input.key ?? ""))) return true;
  if (/^browser_mouse_/.test(toolName)) return true;   // bấm theo toạ độ: không biết bấm vào đâu
  return RISKY.test(JSON.stringify(input));
}

// Quyết định cho công cụ trình duyệt. currentUrl: trang đang mở (lấy từ kết quả công cụ gần nhất).
// readOnly: việc chạy ở chế độ "Chỉ đọc" thì chỉ được xem trang, không thao tác.
export function decideBrowser(s: ChromeSettings, toolName: string, input: unknown, currentUrl: string | null, readOnly = false): Decision {
  const t = toolName.slice(PREFIX.length);
  const i = (input ?? {}) as Record<string, unknown>;
  if (BLOCKED.test(t)) return { decision: "deny", reason: "Không cho đọc/sửa cookie, bộ nhớ trang, mạng hoặc chạy mã Playwright tuỳ ý." };
  if (t === "browser_evaluate") {
    return readOnly ? { decision: "deny", reason: "Chế độ Chỉ đọc: không chạy mã trên trang." } : { decision: "ask", reason: "Chạy mã JavaScript trên trang (có thể đọc dữ liệu trang)" };
  }
  if (t === "browser_navigate" || (t === "browser_tabs" && typeof i.url === "string")) {
    const url = String(i.url ?? "");
    if (!hostOf(url)) return { decision: "deny", reason: "Chỉ mở trang http/https." };
    return siteMode(s, url) ? { decision: "allow", reason: "Website trong danh sách được phép" }
      : { decision: "ask", reason: `Mở website chưa có trong danh sách được phép: ${hostOf(url)}` };
  }
  if (t === "browser_tabs" || READ.has(t)) return { decision: "allow", reason: "Xem trang" };
  if (INTERACT.has(t)) {
    if (readOnly) return { decision: "deny", reason: "Chế độ Chỉ đọc: chỉ được xem trang, không thao tác." };
    const mode = siteMode(s, currentUrl);
    const host = (currentUrl && hostOf(currentUrl)) ?? "trang chưa rõ";
    if (!mode) return { decision: "ask", reason: `Thao tác trên ${host} (chưa có trong danh sách được phép)` };
    if (mode === "read") return { decision: "deny", reason: `${host} đặt ${MODE_LABEL.read}: không được thao tác.` };
    if (mode === "auto" && !isRiskyAction(t, i)) return { decision: "allow", reason: `${host}: ${MODE_LABEL.auto}` };
    return { decision: "ask", reason: mode === "auto" ? `Thao tác có thể đăng/lưu/gửi/sửa trên ${host}` : `Thao tác trên ${host}` };
  }
  return { decision: "ask", reason: `Công cụ trình duyệt ${t}` };
}

// Kết quả công cụ Playwright MCP có dòng "Page URL: ..." của trang đang mở.
export function pageUrlFrom(response: unknown): string | null {
  const text = typeof response === "string" ? response : JSON.stringify(response ?? "");
  const all = [...text.matchAll(/Page URL: (\S+?)(?:\\n|\s|$)/g)];
  return all.length ? all[all.length - 1][1] : null;
}

export function profilePaths(dataDir: string) {
  return { profileDir: path.join(dataDir, "chrome-profile"), outputDir: path.join(dataDir, "chrome-output") };
}
