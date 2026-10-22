import path from "node:path";
import type { PermissionLevel } from "../shared/contract";

// Công cụ chỉ đọc hoặc chỉ điều phối, không thay đổi gì trên máy.
const READ_ONLY = new Set([
  "Read", "Glob", "Grep", "LS", "NotebookRead", "WebSearch", "WebFetch",
  "TodoWrite", "Task", "Agent", "Skill", "ToolSearch", "ListMcpResourcesTool", "ReadMcpResourceTool",
]);
const FILE_EDIT = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);

export type Decision = { decision: "allow" | "deny" | "ask"; reason: string };

export function isInside(dir: string, target: string): boolean {
  const norm = (p: string) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  const rel = path.relative(norm(dir), norm(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function editTarget(input: unknown): string | null {
  const i = input as Record<string, unknown> | null;
  const p = i?.file_path ?? i?.notebook_path ?? i?.path;
  return typeof p === "string" ? p : null;
}

// Ba mức quyền theo yêu cầu gốc (mục XIII). Mức 3 (hành động ra ngoài) luôn hỏi anh Trung.
export function decide(level: PermissionLevel, toolName: string, input: unknown, projectDir: string): Decision {
  if (READ_ONLY.has(toolName)) return { decision: "allow", reason: "Công cụ chỉ đọc" };
  if (FILE_EDIT.has(toolName)) {
    if (level === "read") return { decision: "deny", reason: "Đang ở chế độ Chỉ đọc: không được sửa file." };
    const target = editTarget(input);
    if (target && isInside(projectDir, path.resolve(projectDir, target))) return { decision: "allow", reason: "Sửa file trong dự án" };
    return { decision: "ask", reason: "Sửa file ngoài thư mục dự án" };
  }
  if (level === "read") return { decision: "deny", reason: `Đang ở chế độ Chỉ đọc: không được dùng ${toolName}.` };
  return { decision: "ask", reason: "Chạy lệnh hoặc công cụ ngoài cần anh xác nhận" };
}

// Tóm tắt đầu vào công cụ để hiện trong hộp xác nhận.
export function summarizeInput(toolName: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  if (typeof i.command === "string") return i.command;
  const target = editTarget(input);
  if (target) return target;
  const s = JSON.stringify(input, null, 2) ?? "";
  return s.length > 3000 ? `${s.slice(0, 3000)}…` : s;
}
