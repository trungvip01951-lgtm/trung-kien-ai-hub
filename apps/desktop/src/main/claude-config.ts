import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

// Khai báo máy chủ MCP "trung-kien-hub" vào app Claude (máy tính) và Claude Code trên máy anh.
export const SERVER_NAME = "trung-kien-hub";

export interface McpEntry { command: string; args: string[]; env: Record<string, string> }

export function bridgeEntry(exe: string, script: string, dataDir: string): McpEntry {
  return { command: exe, args: [script, "--data", dataDir], env: { ELECTRON_RUN_AS_NODE: "1" } };
}

// Gộp vào cấu hình có sẵn, giữ nguyên các máy chủ khác. Tệp hỏng thì không ghi (tránh làm mất cấu hình của anh).
export function mergeConfig(text: string | null, entry: McpEntry): string {
  let cfg: Record<string, unknown> = {};
  if (text && text.replace(/^\uFEFF/, "").trim()) {
    const parsed = JSON.parse(text.replace(/^\uFEFF/, "")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Tệp cấu hình của app Claude không đúng dạng.");
    cfg = parsed as Record<string, unknown>;
  }
  const servers = (cfg.mcpServers && typeof cfg.mcpServers === "object" ? cfg.mcpServers : {}) as Record<string, unknown>;
  return JSON.stringify({ ...cfg, mcpServers: { ...servers, [SERVER_NAME]: entry } }, null, 2);
}

// Các nơi app Claude (máy tính) để cấu hình trên Windows: bản cài thường và bản Microsoft Store.
export function claudeDesktopConfigs(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [];
  if (env.APPDATA) out.push(path.join(env.APPDATA, "Claude", "claude_desktop_config.json"));
  const pk = env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Packages") : "";
  if (pk && existsSync(pk)) {
    for (const d of readdirSync(pk)) {
      if (!/^Claude_/i.test(d)) continue;
      const dir = path.join(pk, d, "LocalCache", "Roaming", "Claude");
      if (existsSync(dir)) out.push(path.join(dir, "claude_desktop_config.json"));
    }
  }
  return out;
}

// Ghi vào app Claude (máy tính); sao lưu tệp cũ bên cạnh trước khi ghi.
export function installDesktop(entry: McpEntry, files = claudeDesktopConfigs()): { ok: boolean; message: string } {
  if (!files.length) return { ok: false, message: "Không tìm thấy thư mục cấu hình của app Claude (APPDATA)." };
  const done: string[] = [];
  for (const f of files) {
    const old = existsSync(f) ? readFileSync(f, "utf8") : null;
    let next: string;
    try { next = mergeConfig(old, entry); } catch (err) { return { ok: false, message: `${f}: ${err instanceof Error ? err.message : String(err)} Em không ghi để khỏi hỏng cấu hình.` }; }
    mkdirSync(path.dirname(f), { recursive: true });
    if (old !== null) copyFileSync(f, `${f}.truoc-hub-${Date.now()}.bak`);
    // Ghi ra tệp tạm rồi đổi tên: không để tệp cấu hình nửa chừng.
    const tmp = `${f}.hub-tmp`;
    writeFileSync(tmp, next);
    renameSync(tmp, f);
    done.push(f);
  }
  return { ok: true, message: `Đã khai báo vào app Claude (${done.join("; ")}). Thoát hẳn app Claude (cả biểu tượng ở khay hệ thống) rồi mở lại để nạp. Nếu lúc đó app Claude đang mở và anh đổi cài đặt trong nó, bấm Cài lại lần nữa.` };
}

// Claude Code: lệnh chính thức `claude mcp add` (không sửa tay tệp ~/.claude.json đang được Claude Code dùng).
// Không dùng JSON trong dòng lệnh: PowerShell 5.1 làm hỏng dấu " bên trong khi chuyển cho chương trình ngoài.
export function claudeCodeArgs(entry: McpEntry): string[] {
  return ["mcp", "add", "--scope", "user", ...Object.entries(entry.env).flatMap(([k, v]) => ["-e", `${k}=${v}`]), SERVER_NAME, "--", entry.command, ...entry.args];
}

// Dòng lệnh để anh tự chạy (cmd hoặc PowerShell): bao đường dẫn có dấu cách bằng dấu ".
export function claudeCodeCommand(entry: McpEntry): string {
  return ["claude", ...claudeCodeArgs(entry)].map((a) => (/[\s&()^%!]/.test(a) ? `"${a}"` : a)).join(" ");
}

// Chạy lệnh claude: bản cài sẵn (claude.exe) chạy thẳng; bản cài bằng npm chỉ có claude.cmd, phải qua cmd.
function runClaude(args: string[]): Promise<{ code: number | null; out: string; missing: boolean }> {
  const once = (shell: boolean) => new Promise<{ code: number | null; out: string; missing: boolean }>((resolve) => {
    let out = "";
    const p = shell
      ? spawn(["claude", ...args].map((a) => `"${a}"`).join(" "), { shell: true, windowsHide: true })
      : spawn("claude", args, { windowsHide: true });
    p.stdout?.on("data", (c) => (out += c));
    p.stderr?.on("data", (c) => (out += c));
    p.on("error", () => resolve({ code: null, out, missing: true }));
    p.on("close", (code) => resolve({ code, out, missing: shell && code !== 0 && /not recognized|không được nhận dạng|not found/i.test(out) }));
  });
  return once(false).then((r) => (r.missing && process.platform === "win32" ? once(true) : r));
}

export async function installClaudeCode(entry: McpEntry): Promise<{ ok: boolean; message: string }> {
  // Đã khai báo từ trước thì gỡ bản cũ (đường dẫn app có thể đổi sau cập nhật), lỗi "chưa có" thì bỏ qua.
  await runClaude(["mcp", "remove", "--scope", "user", SERVER_NAME]);
  const r = await runClaude(claudeCodeArgs(entry));
  if (r.missing) return { ok: false, message: "Không chạy được lệnh claude (Claude Code) trên máy. Cài Claude Code, hoặc chạy lệnh trong mục \"Tự khai báo bằng tay\"." };
  return r.code === 0 ? { ok: true, message: "Đã khai báo vào Claude Code (mọi dự án). Mở phiên Claude Code mới để dùng." }
    : { ok: false, message: `Claude Code báo lỗi: ${r.out.trim().slice(0, 300)}` };
}
