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

// noAlways: hỏi mà không cho nút "Đồng ý luôn" (thao tác quá rộng hoặc quá nhạy cảm để cho hẳn).
// key: khoá "Đồng ý luôn" riêng (bỏ qua cách tính mặc định).
export type Decision = { decision: "allow" | "deny" | "ask"; reason: string; updatedInput?: Record<string, unknown>; noAlways?: boolean; key?: string };

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

// Khoá cho nút "Đồng ý luôn": hẹp đúng phạm vi được cho. null = không cho đồng ý luôn.
// - Lệnh: lệnh đơn giản tính theo 2 từ đầu ("npm test"), lệnh có nối/chuyển hướng tính đúng nguyên lệnh.
// - Tệp: theo thư mục chứa tệp. Web: theo tên miền. Còn lại: theo tên công cụ.
export function alwaysKey(toolName: string, input: unknown, projectDir: string): string | null {
  const i = (input ?? {}) as Record<string, unknown>;
  if (typeof i.command === "string") {
    const cmd = i.command.trim();
    if (/[;&|\`$<>(){}\n\r]/.test(cmd)) return `${toolName}=${cmd}`;
    const words = cmd.split(/\s+/);
    // Trình chạy chương trình (python, node, powershell…): tính theo đúng tệp chương trình, không theo 2 từ đầu
    // ("python3 -B" sẽ cho mọi chương trình python).
    const exe = path.basename(words[0].replace(/\\/g, "/")).toLowerCase().replace(/\.exe$/, "");
    // Trình chạy lệnh tuỳ ý (cmd /c, bash -c, powershell -Command, -m pip…): chỉ "Đồng ý luôn" đúng nguyên lệnh.
    if (/^(cmd|bash|sh|zsh|wsl)$/.test(exe)) return `${toolName}=${cmd}`;
    if (/^(python[\d.]*|py|node|pwsh|powershell)$/.test(exe)) {
      for (let k = 1; k < words.length; k++) {
        const w = words[k];
        if (/^-[XW]$/.test(w) || /^-(ExecutionPolicy|ep)$/i.test(w)) { k++; continue; }
        if (/^-(File|f)$/i.test(w) && /^(pwsh|powershell)$/.test(exe)) continue;
        if (w.startsWith("-")) {
          // Chỉ bỏ qua các cờ đã biết là vô hại; cờ khác (-c, -m, -Command, -e…) thì tính theo nguyên lệnh.
          if (/^-(B|u|I|E|s|q|NoProfile|NonInteractive|NoLogo)$/i.test(w) || /^-X\w/.test(w)) continue;
          return `${toolName}=${cmd}`;
        }
        // Tệp chương trình: khoá theo đúng tệp; các tham số sau vẫn cho đổi (cùng một chương trình).
        if (!/\.(py|pyw|js|mjs|cjs|ts|ps1)$/i.test(w)) return `${toolName}=${cmd}`;
        return `${toolName}~${exe} ${w.replace(/\\/g, "/").toLowerCase()}`;
      }
      return `${toolName}=${cmd}`;
    }
    return `${toolName}~${words.slice(0, 2).join(" ")}`;
  }
  if (typeof i.url === "string") {
    try { return `${toolName}@${new URL(i.url).hostname.toLowerCase()}`; } catch { return null; }
  }
  const f = fileArg(input) ?? (typeof i.file === "string" ? i.file : null);
  if (f) return `${toolName}@dir:${path.dirname(path.resolve(projectDir, f)).toLowerCase()}`;
  return toolName;
}

function fileArg(input: unknown): string | null {
  const i = input as Record<string, unknown> | null;
  const p = i?.file_path ?? i?.notebook_path ?? i?.path;
  return typeof p === "string" ? p : null;
}

// Ba mức quyền theo yêu cầu gốc (mục XIII). Hành động ra ngoài luôn hỏi anh Trung.
export function decide(level: PermissionLevel, toolName: string, input: unknown, projectDir: string, extraReadDirs: string[] = []): Decision {
  const i = (input ?? {}) as Record<string, unknown>;
  if (SAFE.has(toolName)) return { decision: "allow", reason: "Công cụ điều phối" };
  if (level === "full") {
    // Đủ quyền: không hỏi. AI phụ được chạy nền: app giữ việc mở tới khi AI phụ xong (vẫn tính vào hạn mức của việc).
    return { decision: "allow", reason: "Đủ quyền" };
  }

  if (FILE_READ.has(toolName)) {
    const p = fileArg(input);
    if (!p || isInside(projectDir, path.resolve(projectDir, p))) return { decision: "allow", reason: "Đọc trong dự án" };
    if (extraReadDirs.some((d) => isInside(d, path.resolve(projectDir, p)))) return { decision: "allow", reason: "Đọc tài liệu của Skill" };
    return { decision: "ask", reason: "Đọc file ngoài thư mục dự án" };
  }

  if (SUBAGENT.has(toolName)) {
    // AI phụ được chạy nền (song song, AI chính vẫn trả lời anh): app giữ việc mở tới khi AI phụ xong,
    // nên chi phí vẫn tính vào việc và chịu hạn mức của việc.
    if (i.isolation) {
      return level === "read"
        ? { decision: "deny", reason: "Chế độ Chỉ đọc: không tạo AI phụ ở môi trường tách riêng." }
        : { decision: "ask", reason: `AI phụ chạy ở môi trường tách riêng (${String(i.isolation)})` };
    }
    return { decision: "allow", reason: "AI phụ (vẫn chịu cùng luật quyền)" };
  }

  if (NETWORK.has(toolName)) return { decision: "ask", reason: "Truy cập mạng (có thể gửi dữ liệu ra ngoài)" };

  if (FILE_EDIT.has(toolName)) {
    if (level === "read") return { decision: "deny", reason: "Đang ở chế độ Chỉ đọc: không được sửa file." };
    const p = fileArg(input);
    const rel = p ? relInside(projectDir, path.resolve(projectDir, p)) : null;
    if (rel === null) return { decision: "ask", reason: "Sửa file ngoài thư mục dự án" };
    if (PROTECTED.some((re) => re.test(rel))) return { decision: "ask", reason: "Sửa tệp cấu hình agent/git của dự án", noAlways: true };
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
  // Công cụ trình duyệt: mô tả phần tử sẽ bấm/gõ, kèm chữ sẽ gõ.
  if (typeof i.element === "string") return `${i.element}${typeof i.text === "string" ? `\nGõ: ${i.text}` : ""}${i.submit ? "\n(và gửi đi)" : ""}`;
  const target = fileArg(input);
  if (target) return target;
  const s = JSON.stringify(input, null, 2) ?? "";
  return s.length > 3000 ? `${s.slice(0, 3000)}…` : s;
}
