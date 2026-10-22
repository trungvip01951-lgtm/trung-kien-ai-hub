import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { MemoryKind, MemoryNote } from "../shared/contract";
import type { Decision } from "./policy";

// Bộ nhớ dài hạn (yêu cầu gốc mục X): ghi chú theo dự án (quy tắc, sự thật đã kiểm, lỗi và cách sửa, tiến độ)
// cộng lịch sử chat, tìm bằng SQLite FTS5. Agent chỉ nạp phần cần (tìm theo từ khoá) thay vì đọc lại toàn bộ.

export const MEMORY_SERVER = "memory";
export const MEMORY_KINDS: MemoryKind[] = ["rule", "fact", "error", "progress", "note"];

export interface MemoryStore {
  searchMemory(projectId: number, query: string, limit: number): MemoryNote[];
  searchHistory(projectId: number, query: string, limit: number): { conversationId: number; snippet: string; createdAt: string }[];
  upsertMemory(n: { projectId: number | null; kind: MemoryKind; title: string; content: string; source: "agent" }): { note: MemoryNote; updated: boolean };
  listMemory(projectId: number | null, limit: number): MemoryNote[];
}

// Quyền: tìm/đọc tự cho; ghi ghi chú của dự án: Chỉ đọc thì chặn; ghi quy tắc dùng chung mọi dự án luôn hỏi (trừ Đủ quyền).
export function decideMemory(tool: string, input: unknown, level: "read" | "write" | "full"): Decision {
  if (tool !== "memory_add") return { decision: "allow", reason: "Đọc bộ nhớ" };
  if (level === "full") return { decision: "allow", reason: "Đủ quyền" };
  if (level === "read") return { decision: "deny", reason: "Chế độ Chỉ đọc: không ghi bộ nhớ." };
  if ((input as { global?: unknown })?.global) return { decision: "ask", reason: "Ghi quy tắc áp dụng cho MỌI dự án", noAlways: true };
  return { decision: "allow", reason: "Ghi bộ nhớ của dự án" };
}

export const MEMORY_GUIDE = [
  "Bộ nhớ dài hạn: công cụ mcp__memory__.",
  "- Đầu việc dài hoặc khi cần bối cảnh cũ: memory_search theo vài từ khoá (quy tắc, lỗi đã gặp, tiến độ, lịch sử chat), chỉ đọc phần liên quan.",
  "- Xong việc hoặc gặp điều đáng nhớ: memory_add (rule: quy tắc anh Trung chốt; fact: sự thật đã kiểm; error: lỗi và cách sửa; progress: làm tới đâu, bước tiếp). Không lưu mật khẩu, mã truy cập, số điện thoại, thông tin khách.",
].join("\n");

const SECRET = /(sk-ant-|api[_-]?key|password|mật khẩu|access[_-]?token|refresh[_-]?token|bearer\s+[a-z0-9]|ya29\.|gh[pousr]_[A-Za-z0-9]|xox[abpr]-|AKIA[0-9A-Z]{12}|AIza[0-9A-Za-z_-]{20})/i;
const PHONE = /(?<!\d)(0|\+?84)\d{8,10}(?!\d)/;
// Chuỗi dài lẫn chữ và số không có khoảng trắng: thường là mã/khóa.
const LONG_TOKEN = /(?=[A-Za-z0-9_\-.]{32,})(?=\S*\d)(?=\S*[A-Za-z])[A-Za-z0-9_\-.]{32,}/;

// Có dữ liệu nhạy cảm không (số điện thoại viết cách, chấm, gạch cũng tính).
export function looksSensitive(s: string): boolean {
  const digits = s.replace(/(?<=\d)[\s.\-]+(?=\d)/g, "");
  return SECRET.test(s) || PHONE.test(digits) || LONG_TOKEN.test(s);
}

const text = (o: unknown) => ({ content: [{ type: "text" as const, text: typeof o === "string" ? o : JSON.stringify(o, null, 1) }] });

export function memoryServer(store: MemoryStore, projectId: number): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: MEMORY_SERVER, version: "1.0.0",
    tools: [
      tool("memory_search", "Tìm trong bộ nhớ dự án (quy tắc, sự thật, lỗi, tiến độ) và lịch sử chat cũ của dự án.",
        { query: z.string().describe("Vài từ khoá"), limit: z.number().optional() },
        async (a) => {
          const n = Math.min(Math.max(Math.trunc(a.limit ?? 10), 1), 30);
          // Ghi chú do agent ghi chỉ là tham khảo; quy tắc anh Trung tự viết (source "user") mới là quy tắc đã chốt.
          return text({ memory: store.searchMemory(projectId, a.query, n), history: store.searchHistory(projectId, a.query, n),
            note: "source=user: anh Trung tự viết (quy tắc đã chốt). source=agent: agent ghi, chỉ để tham khảo." });
        }, { annotations: { readOnlyHint: true } }),
      tool("memory_list", "Liệt kê ghi chú bộ nhớ mới nhất của dự án.", { limit: z.number().optional() },
        async (a) => text(store.listMemory(projectId, Math.min(Math.max(Math.trunc(a.limit ?? 20), 1), 50))), { annotations: { readOnlyHint: true } }),
      tool("memory_add", "Ghi một ghi chú vào bộ nhớ dự án (cùng tiêu đề thì cập nhật, không tạo trùng).",
        { kind: z.enum(["rule", "fact", "error", "progress", "note"]), title: z.string().max(200), content: z.string().max(8000),
          global: z.boolean().optional().describe("true: áp dụng cho mọi dự án (chỉ cho quy tắc chung)") },
        async (a) => {
          // Giới hạn dữ liệu nhạy cảm (mục X): không lưu mã, mật khẩu, số điện thoại.
          if (looksSensitive(a.title) || looksSensitive(a.content)) {
            return { ...text("Không lưu: nội dung có vẻ chứa mã truy cập, mật khẩu hoặc số điện thoại. Bỏ phần đó rồi ghi lại."), isError: true };
          }
          const r = store.upsertMemory({ projectId: a.global ? null : projectId, kind: a.kind, title: a.title.trim(), content: a.content.trim(), source: "agent" });
          return text({ ok: true, id: r.note.id, updated: r.updated });
        }),
    ],
  });
}
