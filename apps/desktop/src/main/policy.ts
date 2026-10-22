import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import type { PermissionLevel } from "../shared/contract";

// Công cụ đọc file: tự cho khi đọc trong thư mục dự án, ngoài dự án phải hỏi
// (tránh bị nội dung độc hại xúi đọc khoá SSH, mã đăng nhập...).
const FILE_READ = new Set(["Read", "Glob", "Grep", "LS", "NotebookRead"]);
// Chỉ điều phối hoặc ghi chú, không chạm file hay mạng.
const SAFE = new Set(["TodoWrite", "Skill", "ToolSearch", "ListMcpResourcesTool", "ReadMcpResourceTool"]);
const SUBAGENT = new Set(["Task", "Agent"]);
// Lấy dữ liệu từ mạng: cũng là kênh gửi dữ liệu ra ngoài (qua địa chỉ URL), nên luôn hỏi.
const NETWORK = new Set(["WebFetch", "WebSearch"]);
const FILE_EDIT = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);

// Tệp trong dự án nhưng sửa vào là đổi cấu hình agent, hook hoặc git: luôn hỏi.
const PROTECTED = [/^\.claude([\\/]|$)/i, /^\.mcp\.json$/i, /^\.git([\\/]|$)/i, /^CLAUDE\.md$/i, /^\.env/i];

export type Decision = { decision: "allow" | "deny" | "ask"; reason: string; updatedInput?: Record<string, unknown> };

// Đường dẫn thật (giải symlink/junction); đích chưa tồn tại thì giải thư mục cha gần nhất.
function realish(p: string): string {
  let cur = path.resolve(p);
  const rest: string[] = [];
  while (!existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    rest.unshift(path.basename(cur));
    cur = parent;
  }
  let real = cur;
  try { real = realpathSync.native(cur); } catch { /* giữ nguyên */ }
  return path.join(real, ...rest);
}

function relInside(dir: string, target: string): string | null {
  const norm = (p: string) => (process.platform === "win32" ? realish(p).toLowerCase() : realish(p));
  const rel = path.relative(norm(dir), norm(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)) ? rel : null;
}

export function isInside(dir: string, target: string): boolean { return relInside(dir, target) !== null; }

function fileArg(input: unknown): string | null {
  const i = input as Record<string, unknown> | null;
  const p = i?.file_path ?? i?.notebook_path ?? i?.path;
  return typeof p === "string" ? p : null;
}

// Ba mức quyền theo yêu cầu gốc (mục XIII). Hành động ra ngoài luôn hỏi anh Trung.
export function decide(level: PermissionLevel, toolName: string, input: unknown, projectDir: string, extraReadDirs: string[] = []): Decision {
  const i = (input ?? {}) as Record<string, unknown>;
  if (SAFE.has(toolName)) return { decision: "allow", reason: "Công cụ điều phối" };

  if (FILE_READ.has(toolName)) {
    const p = fileArg(input);
    if (!p || isInside(projectDir, path.resolve(projectDir, p))) return { decision: "allow", reason: "Đọc trong dự án" };
    if (extraReadDirs.some((d) => isInside(d, path.resolve(projectDir, p)))) return { decision: "allow", reason: "Đọc tài liệu của Skill" };
    return { decision: "ask", reason: "Đọc file ngoài thư mục dự án" };
  }

  if (SUBAGENT.has(toolName)) {
    // AI phụ chạy nền có thể tiếp tục tiêu tiền sau khi việc kết thúc: ép chạy chờ.
    const updatedInput = i.run_in_background ? { ...i, run_in_background: false } : undefined;
    if (i.isolation) {
      return level === "read"
        ? { decision: "deny", reason: "Chế độ Chỉ đọc: không tạo AI phụ ở môi trường tách riêng." }
        : { decision: "ask", reason: `AI phụ chạy ở môi trường tách riêng (${String(i.isolation)})` };
    }
    return { decision: "allow", reason: "AI phụ (vẫn chịu cùng luật quyền)", updatedInput };
  }

  if (NETWORK.has(toolName)) return { decision: "ask", reason: "Truy cập mạng (có thể gửi dữ liệu ra ngoài)" };

  if (FILE_EDIT.has(toolName)) {
    if (level === "read") return { decision: "deny", reason: "Đang ở chế độ Chỉ đọc: không được sửa file." };
    const p = fileArg(input);
    const rel = p ? relInside(projectDir, path.resolve(projectDir, p)) : null;
    if (rel === null) return { decision: "ask", reason: "Sửa file ngoài thư mục dự án" };
    if (PROTECTED.some((re) => re.test(rel))) return { decision: "ask", reason: "Sửa tệp cấu hình agent/git của dự án" };
    return { decision: "allow", reason: "Sửa file trong dự án" };
  }

  if (level === "read") return { decision: "deny", reason: `Đang ở chế độ Chỉ đọc: không được dùng ${toolName}.` };
  return { decision: "ask", reason: "Chạy lệnh hoặc công cụ ngoài cần anh xác nhận" };
}

// Tóm tắt đầu vào công cụ để hiện trong hộp xác nhận.
export function summarizeInput(toolName: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  if (typeof i.command === "string") return i.command;
  if (typeof i.url === "string") return `${i.url}${typeof i.prompt === "string" ? `\n${i.prompt}` : ""}`;
  if (typeof i.query === "string") return i.query;
  const target = fileArg(input);
  if (target) return target;
  const s = JSON.stringify(input, null, 2) ?? "";
  return s.length > 3000 ? `${s.slice(0, 3000)}…` : s;
}
