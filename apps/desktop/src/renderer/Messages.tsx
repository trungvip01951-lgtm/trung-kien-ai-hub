import { useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatItem } from "../shared/contract";

// Trình bày khung chat giống app Claude: câu trả lời có định dạng (markdown), các bước công cụ gộp gọn,
// tệp agent tạo/sửa hiện thành thẻ bấm mở được, đường dẫn tệp trong câu trả lời bấm vào là mở.

const SERVER_NAME: Record<string, string> = {
  office: "Tài liệu", windows: "Windows", chrome: "Trình duyệt", memory: "Bộ nhớ",
  Google_Sheets: "Trang tính", Google_Drive: "Drive", Gmail: "Gmail", Windsor_ai: "Windsor",
};
// Đường dẫn tệp tài liệu (Windows hoặc tương đối, cho phép dấu cách khi có thư mục), để biến thành chỗ bấm mở.
// Chỉ nhận đuôi tài liệu, bảng, ảnh, chữ: "0.3.308" hay "v1.2" không thành chỗ bấm.
const DOC_EXT = "(?:xlsx|xlsm|xls|csv|tsv|docx|doc|pdf|pptx|ppt|odt|ods|rtf|txt|md|log|json|xml|ya?ml|html?|png|jpe?g|gif|webp|bmp|svg|mp4|mp3|wav|zip)";
const PATH_RE = new RegExp(`^(?:(?:[a-zA-Z]:[\\\\/]|\\\\\\\\|\\.{0,2}[\\\\/]|[^\\s\\\\/<>"|?*]+[\\\\/])[^<>"|?*\\n]*|[^\\s\\\\/<>"|?*]+)\\.${DOC_EXT}$`, "i");

function parse(text: string): Record<string, unknown> {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}
const base = (p: unknown) => String(p ?? "").split(/[\\/]/).pop() ?? "";
const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function toolLabel(toolName: string, input: Record<string, unknown>): { icon: string; label: string } {
  const name = toolName.replace(/ \(AI phụ\)$/, "");
  const sub = name !== toolName ? " (AI phụ)" : "";
  const i = input;
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  let r: { icon: string; label: string };
  if (m) r = { icon: "🔌", label: `${SERVER_NAME[m[1]] ?? m[1]}: ${m[2].replace(/_/g, " ")}${i.file ? ` ${base(i.file)}` : i.url ? ` ${short(String(i.url), 60)}` : ""}` };
  else if (name === "Bash" || name === "PowerShell") r = { icon: "⌨", label: `Chạy lệnh: ${short(String(i.command ?? i.description ?? ""))}` };
  else if (name === "Read") r = { icon: "📄", label: `Đọc ${base(i.file_path)}` };
  else if (name === "Write") r = { icon: "📝", label: `Tạo tệp ${base(i.file_path)}` };
  else if (name === "Edit" || name === "MultiEdit" || name === "NotebookEdit") r = { icon: "✏", label: `Sửa ${base(i.file_path ?? i.notebook_path)}` };
  else if (name === "Glob") r = { icon: "🔎", label: `Tìm tệp ${short(String(i.pattern ?? ""), 60)}` };
  else if (name === "Grep") r = { icon: "🔎", label: `Tìm chữ "${short(String(i.pattern ?? ""), 50)}"` };
  else if (name === "WebFetch") r = { icon: "🌐", label: `Đọc web ${short(String(i.url ?? ""), 60)}` };
  else if (name === "WebSearch") r = { icon: "🌐", label: `Tìm web: ${short(String(i.query ?? ""), 60)}` };
  else if (name === "TodoWrite") r = { icon: "☑", label: "Cập nhật danh sách việc" };
  else if (name === "Agent" || name === "Task") r = { icon: "👥", label: `Giao ${String(i.subagent_type ?? "AI phụ")}: ${short(String(i.description ?? ""), 60)}` };
  else if (name === "Skill") r = { icon: "🧩", label: `Dùng Skill ${String(i.skill ?? i.name ?? "")}` };
  else if (name === "ToolSearch") r = { icon: "🧰", label: "Nạp công cụ" };
  else r = { icon: "•", label: name };
  return { icon: r.icon, label: r.label + sub };
}

export { filesFromSteps } from "../shared/steps";

function open(p: string, projectId: number | null, folder = false, onError?: (m: string) => void) {
  window.hub.openFile(p, projectId, folder).then((r) => { if (!r.ok) onError?.(r.message); }, (e) => onError?.(String(e)));
}
// Giữ nguyên đường dẫn tệp trong liên kết (mặc định react-markdown xoá "D:/…", "file:///…"); chỉ bỏ javascript:.
const keepUrl = (u: string) => (/^\s*(javascript|vbscript|data):/i.test(u) ? "" : u);

export function FileCards({ files, projectId, onError }: { files: string[]; projectId: number | null; onError: (m: string) => void }) {
  if (!files.length) return null;
  return (
    <div className="file-cards">
      {files.map((f) => (
        <div key={f} className="file-card">
          <span className="file-icon">{/\.(xlsx?|csv)$/i.test(f) ? "📊" : /\.pdf$/i.test(f) ? "📕" : /\.docx?$/i.test(f) ? "📘" : /\.(png|jpe?g|gif|webp)$/i.test(f) ? "🖼" : "📄"}</span>
          <div className="grow">
            <div className="file-name">{base(f)}</div>
            <div className="file-path mono">{f}</div>
          </div>
          <button onClick={() => open(f, projectId, false, onError)}>Mở</button>
          <button onClick={() => open(f, projectId, true, onError)}>Thư mục</button>
        </div>
      ))}
    </div>
  );
}

export function MarkdownText({ text, projectId, onError }: { text: string; projectId: number | null; onError: (m: string) => void }) {
  return (
    <div className="md">
      <Markdown remarkPlugins={[remarkGfm]} urlTransform={keepUrl} components={{
        a: ({ href, children }) => (
          <a href={href} onClick={(e) => {
            if (href && !/^https?:/i.test(href)) { e.preventDefault(); open(href, projectId, false, onError); }
          }} target="_blank" rel="noreferrer">{children}</a>
        ),
        code: ({ className, children }) => {
          const s = String(children ?? "");
          if (!className && !s.includes("\n") && PATH_RE.test(s.trim())) {
            return <code className="path-link" title="Bấm để mở tệp" onClick={() => open(s.trim(), projectId, false, onError)}>{s}</code>;
          }
          return <code className={className}>{children}</code>;
        },
        table: ({ children }) => <div className="md-table"><table>{children}</table></div>,
      }}>{text}</Markdown>
    </div>
  );
}

// Một nhóm bước công cụ liên tiếp: gộp gọn như app Claude, bấm để mở từng bước.
export function StepGroup({ items }: { items: ChatItem[] }) {
  const [open, setOpen] = useState(false);
  const steps: { use: ChatItem; result?: ChatItem }[] = [];
  for (const it of items) {
    if (it.kind === "tool_use") steps.push({ use: it });
    else if (it.kind === "tool_result") {
      // Ghép theo mã bước gọi (nhiều công cụ chạy cùng lúc); dữ liệu cũ chưa có mã thì ghép bước đầu tiên còn chờ.
      const s = it.toolUseId ? steps.find((x) => x.use.toolUseId === it.toolUseId && !x.result) : steps.find((x) => !x.result && !x.use.toolUseId);
      if (s) s.result = it; else steps.push({ use: it });
    }
  }
  const errors = steps.filter((s) => s.result?.isError).length;
  const last = steps[steps.length - 1];
  const lastLabel = last ? toolLabel(last.use.toolName ?? "", parse(last.use.text)).label : "";
  return (
    <div className="steps">
      <button className="steps-head" onClick={() => setOpen(!open)}>
        <span className="chev">{open ? "▾" : "▸"}</span>
        {steps.length === 1 ? lastLabel : `${steps.length} bước · ${lastLabel}`}
        {errors > 0 && <span className="step-warn"> · {errors} bước lỗi (AI tự xử lý tiếp)</span>}
      </button>
      {open && steps.map((s, k) => <Step key={k} use={s.use} result={s.result} />)}
    </div>
  );
}

function Step({ use, result }: { use: ChatItem; result?: ChatItem }) {
  const [open, setOpen] = useState(false);
  const input = parse(use.text);
  const { icon, label } = use.kind === "tool_use" ? toolLabel(use.toolName ?? "", input) : { icon: "•", label: "Kết quả" };
  const err = result?.isError;
  const code = /Exit code (\d+)/.exec(result?.text ?? "")?.[1];
  return (
    <div className={`step-row${err ? " err" : ""}`}>
      <button className="step-line" onClick={() => setOpen(!open)}>
        <span className="step-icon">{icon}</span><span className="grow">{label}</span>
        {err && <span className="step-warn">{code ? `lỗi (mã ${code})` : "lỗi"}</span>}
      </button>
      {open && (
        <div className="step-detail">
          {use.kind === "tool_use" && <pre>{typeof input.command === "string" ? input.command : use.text}</pre>}
          {result && <pre className={err ? "err" : ""}>{result.text || "(trống)"}</pre>}
        </div>
      )}
    </div>
  );
}

// Gom các dòng liên tiếp cùng loại bước công cụ để hiện thành một nhóm.
export function groupItems<T>(list: T[], isStep: (x: T) => boolean): ({ steps: T[] } | { one: T })[] {
  const out: ({ steps: T[] } | { one: T })[] = [];
  for (const x of list) {
    const lastG = out[out.length - 1];
    if (isStep(x)) {
      if (lastG && "steps" in lastG) lastG.steps.push(x); else out.push({ steps: [x] });
    } else out.push({ one: x });
  }
  return out;
}

export type { ReactNode };
