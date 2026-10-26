import type { ChatItem } from "./contract";

// Tệp agent tạo/sửa trong các bước công cụ (thẻ mở tệp trong chat, kết quả trả cho app Claude).
const FILE_WRITE = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const OFFICE_WRITE = new Set(["excel_write", "word_create", "word_replace", "pdf_from_html"]);

function parse(text: string): Record<string, unknown> {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}

export function filesFromSteps(items: ChatItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (it.kind !== "tool_use" || !it.toolName) continue;
    const name = it.toolName.replace(/ \(AI phụ\)$/, "");
    const i = parse(it.text);
    const m = /^mcp__office__(.+)$/.exec(name);
    const f = FILE_WRITE.has(name) ? (i.file_path ?? i.notebook_path) : m && OFFICE_WRITE.has(m[1]) ? i.file : null;
    if (typeof f === "string" && f && !out.includes(f)) out.push(f);
  }
  return out;
}
