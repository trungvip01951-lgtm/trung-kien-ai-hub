import path from "node:path";
import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { PermissionLevel } from "../shared/contract";
import { excelRead, excelWrite, wordCreate, wordRead, wordReplace } from "./office";
import { isInside, type Decision } from "./policy";
import { runWindows, WIN_READ_ACTIONS, type WinAction } from "./windows";

// Công cụ chạy ngay trong app (máy chủ MCP trong tiến trình, Agent SDK `createSdkMcpServer`):
// - "windows": điều khiển ứng dụng Windows (Mốc 4).
// - "office": đọc/ghi Excel, Word, xuất PDF (Mốc 4). Tệp PDF agent đọc bằng công cụ Read có sẵn.

export const WIN_SERVER = "windows";
export const OFFICE_SERVER = "office";

type Text = { type: "text"; text: string };
const ok = (o: unknown): { content: Text[] } => ({ content: [{ type: "text", text: typeof o === "string" ? o : JSON.stringify(o, null, 1) }] });
const fail = (e: unknown) => ({ content: [{ type: "text" as const, text: `Lỗi: ${e instanceof Error ? e.message : String(e)}` }], isError: true });

const target = { window: z.string().optional().describe("Một phần tiêu đề cửa sổ"), handle: z.number().optional().describe("handle từ list_windows") };
const elem = {
  name: z.string().optional().describe("Tên phần tử (theo read_window)"),
  automationId: z.string().optional(), controlType: z.string().optional().describe("Ví dụ Button, Edit"),
  index: z.number().optional().describe("Số thứ tự [n] trong read_window"),
};

export function windowsServer(): McpSdkServerConfigWithInstance {
  const call = (a: WinAction) => async (args: Record<string, unknown>) => {
    try {
      const r = await runWindows(a, args) as Record<string, unknown>;
      if (a === "screenshot") {
        const { png, ...rest } = r;
        return { content: [{ type: "image" as const, data: String(png), mimeType: "image/png" }, { type: "text" as const, text: JSON.stringify(rest) }] };
      }
      return ok(r);
    } catch (e) { return fail(e); }
  };
  return createSdkMcpServer({
    name: WIN_SERVER, version: "1.0.0",
    tools: [
      tool("list_windows", "Liệt kê các cửa sổ đang mở (tiêu đề, handle, tiến trình).", {}, call("list_windows"), { annotations: { readOnlyHint: true } }),
      tool("read_window", "Đọc cây phần tử của một cửa sổ (nút, ô nhập, chữ) bằng UI Automation. Dùng trước khi bấm/nhập.",
        { ...target, maxNodes: z.number().optional() }, call("read_window"), { annotations: { readOnlyHint: true } }),
      tool("read_text", "Đọc chữ/giá trị của một phần tử.", { ...target, ...elem }, call("read_text"), { annotations: { readOnlyHint: true } }),
      tool("screenshot", "Chụp toàn màn hình (thu nhỏ còn tối đa maxWidth px). Chỉ dùng khi UI Automation không đọc được.",
        { maxWidth: z.number().optional() }, call("screenshot"), { annotations: { readOnlyHint: true } }),
      tool("focus_window", "Đưa cửa sổ lên trước.", target, call("focus_window")),
      tool("click_element", "Bấm một phần tử theo tên/automationId/số thứ tự (ưu tiên hơn bấm toạ độ).", { ...target, ...elem }, call("click_element")),
      tool("set_text", "Điền chữ vào ô nhập.", { ...target, ...elem, text: z.string() }, call("set_text")),
      tool("send_keys", "Gửi phím (cú pháp SendKeys, ví dụ ^s là Ctrl+S, {ENTER}).", { ...target, keys: z.string() }, call("send_keys")),
      tool("mouse_click", "Bấm chuột tại toạ độ màn hình (chỉ khi không bấm được theo phần tử).",
        { x: z.number(), y: z.number(), button: z.enum(["left", "right"]).optional(), double: z.boolean().optional() }, call("mouse_click")),
      tool("open_app", "Mở chương trình hoặc tệp (ví dụ notepad.exe, excel.exe, đường dẫn tệp).",
        { target: z.string(), args: z.array(z.string()).optional() }, call("open_app")),
    ],
  });
}

export interface OfficeDeps { backupDir: string; projectDir: string; makePdf(html: string, file: string): Promise<void> }

export function officeServer(d: OfficeDeps): McpSdkServerConfigWithInstance {
  // Đường dẫn tương đối tính từ thư mục dự án (giống các công cụ tệp khác của agent).
  const wrap = <A extends { file: string }>(fn: (a: A) => Promise<unknown>) => async (a: A) => {
    try { return ok(await fn({ ...a, file: path.resolve(d.projectDir, a.file) })); } catch (e) { return fail(e); }
  };
  const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
  return createSdkMcpServer({
    name: OFFICE_SERVER, version: "1.0.0",
    tools: [
      tool("excel_read", "Đọc bảng tính .xlsx (tối đa maxRows dòng, mặc định 500).",
        { file: z.string(), sheet: z.string().optional(), range: z.string().optional(), maxRows: z.number().optional() },
        wrap((a) => excelRead(a.file, a)), { annotations: { readOnlyHint: true } }),
      tool("excel_write", "Ghi dữ liệu vào .xlsx từ ô start (ví dụ A1); chuỗi bắt đầu bằng = là công thức. Bản gốc được sao lưu trước.",
        { file: z.string(), sheet: z.string(), start: z.string(), rows: z.array(z.array(cell)) },
        wrap((a) => excelWrite(a.file, a, d.backupDir))),
      tool("word_read", "Đọc chữ trong tệp .docx.", { file: z.string() }, wrap((a) => wordRead(a.file)), { annotations: { readOnlyHint: true } }),
      tool("word_create", "Tạo tệp .docx mới từ các khối tiêu đề/đoạn/gạch đầu dòng (không ghi đè tệp có sẵn).",
        { file: z.string(), blocks: z.array(z.object({ type: z.enum(["heading", "paragraph", "bullet"]), text: z.string(), level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() })) },
        wrap((a) => wordCreate(a.file, a.blocks))),
      tool("word_replace", "Thay chữ trong .docx (giữ định dạng). Bản gốc được sao lưu trước.",
        { file: z.string(), find: z.string(), replace: z.string() }, wrap((a) => wordReplace(a.file, a.find, a.replace, d.backupDir))),
      tool("pdf_from_html", "Xuất PDF khổ A4 từ HTML (có thể kèm CSS trong thẻ style).",
        { file: z.string(), html: z.string() }, wrap(async (a) => { await d.makePdf(a.html, a.file); return { ok: true, file: a.file }; })),
    ],
  });
}

const OFFICE_READ = new Set(["excel_read", "word_read"]);

// Quyền: đọc tệp trong dự án tự cho; ghi trong dự án tự cho ở mức "được sửa"; ngoài dự án phải hỏi; Chỉ đọc không ghi.
export function decideOffice(tool: string, input: unknown, level: PermissionLevel, projectDir: string): Decision {
  const file = String((input as { file?: unknown })?.file ?? "");
  if (level === "full") return { decision: "allow", reason: "Đủ quyền" };
  const inside = !!file && isInside(projectDir, path.resolve(projectDir, file));
  if (OFFICE_READ.has(tool)) return inside ? { decision: "allow", reason: "Đọc tệp trong dự án" } : { decision: "ask", reason: `Đọc tệp ngoài dự án: ${file}` };
  if (level === "read") return { decision: "deny", reason: "Chế độ Chỉ đọc: không ghi tệp." };
  return inside ? { decision: "allow", reason: "Ghi tệp trong dự án (bản gốc được sao lưu)" } : { decision: "ask", reason: `Ghi tệp ngoài dự án: ${file}` };
}

// Đọc màn hình tự cho (trừ việc Chỉ đọc vẫn cho); bấm/gõ/mở chương trình phải hỏi, Chỉ đọc thì chặn, Đủ quyền thì cho.
export function decideWindows(tool: string, level: PermissionLevel): Decision {
  if (WIN_READ_ACTIONS.has(tool as WinAction)) return { decision: "allow", reason: "Xem cửa sổ/màn hình" };
  if (level === "full") return { decision: "allow", reason: "Đủ quyền" };
  if (level === "read") return { decision: "deny", reason: "Chế độ Chỉ đọc: không điều khiển ứng dụng Windows." };
  return { decision: "ask", reason: "Điều khiển ứng dụng Windows (bấm, gõ, mở chương trình)", noAlways: tool === "mouse_click" || tool === "send_keys" };
}
