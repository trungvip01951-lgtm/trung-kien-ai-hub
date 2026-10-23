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

export interface ChromePaths {
  nodeBinary: string; cliPath: string; profileDir: string; outputDir: string; executablePath?: string;
  extensionToken?: () => string | null;   // mã ghép nối tiện ích Playwright Extension (chế độ Chrome chính)
}

// Lệnh chạy máy chủ MCP: dùng chính tệp chạy của Electron ở chế độ Node (ELECTRON_RUN_AS_NODE),
// nên máy anh không cần cài Node riêng.
export function chromeServerConfig(s: ChromeSettings, p: ChromePaths): McpStdioServerConfig {
  // --no-webmcp: không nạp công cụ do chính trang web đăng ký (trang lạ có thể tự tạo công cụ đổi dữ liệu).
  const env: Record<string, string> = { ELECTRON_RUN_AS_NODE: "1" };
  if (s.mode === "main") {
    // Chrome anh đang dùng: nối qua tiện ích Playwright Extension, dùng các tài khoản đã đăng nhập sẵn.
    const token = p.extensionToken?.();
    if (token) env.PLAYWRIGHT_MCP_EXTENSION_TOKEN = token;
    return { type: "stdio", command: p.nodeBinary, args: [p.cliPath, "--extension", "--browser", s.browser, "--output-dir", p.outputDir, "--image-responses", "allow", "--no-webmcp"], env };
  }
  const args = [p.cliPath, "--user-data-dir", p.profileDir, "--output-dir", p.outputDir, "--image-responses", "allow", "--no-webmcp"];
  if (p.executablePath) args.push("--executable-path", p.executablePath);
  else args.push("--browser", s.browser);
  return { type: "stdio", command: p.nodeBinary, args, env };
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
const READ = new Set(["browser_snapshot", "browser_take_screenshot", "browser_wait_for", "browser_console_messages", "browser_navigate_back", "browser_resize", "browser_close", "browser_find", "browser_verify_element_visible",
  "browser_generate_locator", "browser_hover", "browser_highlight", "browser_hide_highlight", "browser_get_config", "browser_mouse_move_xy",
  "browser_mouse_wheel", "browser_pdf_save", "browser_annotate"]);
// Thao tác lên trang: có thể đổi dữ liệu trên website.
const INTERACT = new Set(["browser_click", "browser_type", "browser_fill_form", "browser_select_option", "browser_press_key", "browser_drag",
  "browser_drop", "browser_file_upload", "browser_handle_dialog", "browser_mouse_click_xy", "browser_mouse_down", "browser_mouse_up",
  "browser_mouse_drag_xy"]);
// Cookie, bộ nhớ trang, header/nội dung request (có thể chứa mã truy cập), chặn/sửa mạng, ghi vết (có cookie),
// chạy mã Playwright tuỳ ý: không cho.
const BLOCKED = /^browser_(cookie_|localstorage_|sessionstorage_|storage_state|set_storage_state|route|unroute|network_|start_tracing|stop_tracing|run_code)/;
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
  if (toolName === "browser_press_key" && /enter/i.test(String(input.key ?? ""))) return true;   // cả Control+Enter, Shift+Enter
  if (/^browser_mouse_/.test(toolName)) return true;   // bấm theo toạ độ: không biết bấm vào đâu
  return RISKY.test(JSON.stringify(input));
}

// Trạng thái trình duyệt app biết chắc, lấy từ kết quả công cụ gần nhất. Không chắc thì để null (thao tác sẽ hỏi).
export interface BrowserState { url: string | null; refs: Map<string, string> }
export const newBrowserState = (): BrowserState => ({ url: null, refs: new Map() });

function responseText(response: unknown): string {
  if (typeof response === "string") return response;
  const parts = Array.isArray(response) ? response : (response as { content?: unknown })?.content;
  if (Array.isArray(parts)) return parts.map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : "")).join("\n");
  return "";
}

// Địa chỉ trang: chỉ tin dòng "- Page URL:" ĐẦU TIÊN ngay sau tiêu đề "### Page" và trước mọi nội dung do trang quyết định
// (tiêu đề trang, snapshot). Trang lạ tự ghi "Page URL: ..." vào tiêu đề hay nội dung thì không được tính.
export function pageUrlFrom(response: unknown): string | null {
  const text = responseText(response);
  const m = /^### Page\r?\n- Page URL: (\S+)\r?$/m.exec(text);
  if (!m) return null;
  const before = text.slice(0, m.index);
  return /^### (Snapshot|Page)/m.test(before) ? null : m[1];
}

// Chữ của từng phần tử (ref) trong snapshot gần nhất, để xét thao tác theo chữ thật trên trang, không theo lời mô tả của model.
export function refsFrom(response: unknown): Map<string, string> | null {
  const text = responseText(response);
  const i = text.search(/^### Snapshot/m);
  if (i < 0) return null;
  const refs = new Map<string, string>();
  for (const line of text.slice(i).split(/\r?\n/)) {
    const m = /\[ref=([\w-]+)\]/.exec(line);
    if (m) refs.set(m[1], line.trim());
  }
  return refs;
}

// Cập nhật sau mỗi công cụ trình duyệt: kết quả không có địa chỉ tin được (đổi tab, lỗi...) thì coi như chưa rõ trang.
export function updateBrowserState(st: BrowserState, toolName: string, response: unknown) {
  if (!isBrowserTool(toolName)) return;
  const url = pageUrlFrom(response);
  const refs = refsFrom(response);
  if (url) { if (url !== st.url) st.refs = new Map(); st.url = url; } else { st.url = null; st.refs = new Map(); }
  if (refs && url) st.refs = refs;
}

// Quyết định cho công cụ trình duyệt theo trang đang mở (st).
// readOnly: việc chạy ở chế độ "Chỉ đọc" thì chỉ được xem trang, không thao tác. full: việc "Đủ quyền", chỉ giữ các chặn bắt buộc.
export function decideBrowser(s: ChromeSettings, toolName: string, input: unknown, st: BrowserState, readOnly = false, full = false): Decision {
  const currentUrl = st.url;
  const t = toolName.slice(PREFIX.length);
  const i = (input ?? {}) as Record<string, unknown>;
  // Tên tệp tự đặt được tính từ thư mục dự án (ghi đè được tệp dự án): không cho, để app tự lưu vào thư mục của app.
  if (i.filename !== undefined) return { decision: "deny", reason: "Không đặt tên tệp; ảnh và snapshot tự lưu vào thư mục của app." };
  if (BLOCKED.test(t)) return { decision: "deny", reason: "Không cho đọc/sửa cookie, bộ nhớ trang, mạng hoặc chạy mã Playwright tuỳ ý." };
  // Chạy mã trên trang đọc được cookie/bộ nhớ trang: hỏi, trừ Đủ quyền (anh Trung chốt 23/10/2026: Đủ quyền không hỏi gì).
  // Công cụ đọc/sửa cookie, bộ nhớ trang vẫn bị chặn ở trên.
  if (t === "browser_evaluate") {
    return readOnly ? { decision: "deny", reason: "Chế độ Chỉ đọc: không chạy mã trên trang." }
      : full ? { decision: "allow", reason: "Đủ quyền" }
      : { decision: "ask", reason: "Chạy mã JavaScript trên trang (có thể đọc cookie, dữ liệu trang)", noAlways: true };
  }
  if (full) return { decision: "allow", reason: "Đủ quyền" };
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
    // Tự làm chỉ khi biết chắc chữ thật của phần tử (ref có trong snapshot gần nhất) và chữ đó không phải đăng/lưu/gửi...
    const refText = (r: unknown) => (typeof r === "string" ? st.refs.get(r) ?? null : null);
    const targets = t === "browser_fill_form" && Array.isArray(i.fields) ? (i.fields as Record<string, unknown>[]).map((f) => f.target ?? f.ref)
      : [i.target ?? i.ref];
    const texts = targets.map(refText);
    const known = t === "browser_press_key" || texts.every((x) => x !== null);
    if (mode === "auto" && known && !isRiskyAction(t, i) && !texts.some((x) => x && RISKY.test(x))) return { decision: "allow", reason: `${host}: ${MODE_LABEL.auto}` };
    const seen = texts.filter((x): x is string => !!x).map((x) => x.replace(/\s*\[ref=[\w-]+\].*$/, "").replace(/^- /, ""));
    const onPage = seen.length ? ` · chữ trên trang: ${seen.join("; ")}` : "";
    return { decision: "ask", noAlways: mode === "auto" || !mode || t === "browser_file_upload", reason: (mode === "auto" ? `Thao tác có thể đăng/lưu/gửi/sửa trên ${host}` : `Thao tác trên ${host}`) + onPage };
  }
  if (readOnly) return { decision: "deny", reason: `Chế độ Chỉ đọc: không dùng công cụ trình duyệt ${t}.` };
  return { decision: "ask", reason: `Công cụ trình duyệt ${t}` };
}

export function profilePaths(dataDir: string) {
  return { profileDir: path.join(dataDir, "chrome-profile"), outputDir: path.join(dataDir, "chrome-output") };
}
