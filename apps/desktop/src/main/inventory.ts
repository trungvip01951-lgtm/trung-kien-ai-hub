import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { InventoryRow } from "../shared/contract";
import { parseFrontmatter } from "./skills";
import { checkSettings } from "./settings-guard";

// Kiểm kê dự án cũ (yêu cầu gốc mục II, PROJECT_INVENTORY). CHỈ ĐỌC trong thư mục anh Trung chọn:
// không ghi, không chép dữ liệu dự án. Dữ liệu dự án Thịnh Vượng không đưa vào (đánh dấu, không cho thêm).

const MAX_DEPTH = 3;
const MAX_DIRS = 5000;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "release", "out", "vendor", "__pycache__", ".venv", "venv",
  "$recycle.bin", "system volume information", "appdata", "windows", "program files", "program files (x86)"]);
const HANDOFF_RE = /^(BAN[-_ ]?GIAO|NHAT[-_ ]?KY|TODO|HANDOFF|PROGRESS|CHANGELOG|KE[-_ ]?HOACH|TIEN[-_ ]?DO|NOTES?)[^/\\]*\.(md|txt)$/i;
const DEP_FILES = ["package.json", "requirements.txt", "pyproject.toml", "composer.json", "go.mod", "Cargo.toml", "pom.xml", "*.sln", "*.csproj"];
const READ_CAP = 256 * 1024;

const stripMarks = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
export const isThinhVuong = (p: string) => /thinh[^a-z0-9]*vuong/i.test(stripMarks(p));

function readCapped(f: string): string {
  try {
    const st = statSync(f);
    const buf = readFileSync(f);
    return buf.subarray(0, Math.min(st.size, READ_CAP)).toString("utf8");
  } catch { return ""; }
}

function isDir(p: string): boolean { try { return lstatSync(p).isDirectory(); } catch { return false; } }
function list(p: string): string[] { try { return readdirSync(p); } catch { return []; } }

function isProject(dir: string): boolean {
  return ["CLAUDE.md", "AGENTS.md", ".mcp.json"].some((f) => existsSync(path.join(dir, f))) || isDir(path.join(dir, ".claude")) || existsSync(path.join(dir, ".git"));
}

// Đoạn "đang làm / bước tiếp theo" trích nguyên văn từ mục cuối của sổ bàn giao (không tự suy ra).
export function handoffSummary(text: string): { current: string; next: string } {
  const sections = text.split(/\n(?=##\s)/);
  const last = sections[sections.length - 1] ?? "";
  const line = (re: RegExp) => last.split(/\r?\n/).find((l) => re.test(l))?.replace(/^\s*[-*]\s*/, "").trim() ?? "";
  const clip = (s: string) => (s.length > 300 ? `${s.slice(0, 300)}…` : s);
  return {
    current: clip(line(/(Làm tới đâu|Việc đã làm|Current|Status)\s*:/i)),
    next: clip(line(/(Còn lại|Bước tiếp|Việc cần|Next)\s*:/i)),
  };
}

function gitInfo(dir: string): string {
  const head = readCapped(path.join(dir, ".git", "HEAD")).trim();
  if (!head) return existsSync(path.join(dir, ".git")) ? "có git" : "";
  const branch = head.startsWith("ref:") ? head.replace(/^ref:\s*refs\/heads\//, "") : head.slice(0, 8);
  const log = readCapped(path.join(dir, ".git", "logs", "HEAD")).trim().split("\n").pop() ?? "";
  const m = /> (\d{9,}) [+-]\d{4}\t(.*)$/.exec(log);
  return m ? `${branch} · lần cuối ${new Date(Number(m[1]) * 1000).toISOString().slice(0, 10)}: ${m[2].slice(0, 80)}` : branch;
}

export function inspectProject(dir: string): Omit<InventoryRow, "projectId" | "oldSessions"> {
  const claude = path.join(dir, ".claude");
  const instructions = ["CLAUDE.md", "CLAUDE.local.md", path.join(".claude", "CLAUDE.md"), "AGENTS.md"].filter((f) => existsSync(path.join(dir, f)));
  const skills = list(path.join(claude, "skills")).filter((n) => existsSync(path.join(claude, "skills", n, "SKILL.md")))
    .map((n) => parseFrontmatter(readCapped(path.join(claude, "skills", n, "SKILL.md")))?.name ?? n);
  const agents = list(path.join(claude, "agents")).filter((n) => n.endsWith(".md")).map((n) => n.replace(/\.md$/, ""));
  const commands = list(path.join(claude, "commands")).filter((n) => n.endsWith(".md")).length;
  let mcp: string[] = [];
  try { mcp = Object.keys(JSON.parse(readCapped(path.join(dir, ".mcp.json"))).mcpServers ?? {}); } catch { /* không có hoặc hỏng */ }
  let hooks = false;
  for (const f of ["settings.json", "settings.local.json"]) {
    try { if (JSON.parse(readCapped(path.join(claude, f))).hooks) hooks = true; } catch { /* bỏ qua */ }
  }
  const settingsWarning = checkSettings([path.join(claude, "settings.json"), path.join(claude, "settings.local.json")]);

  const docs: string[] = [];
  for (const sub of ["", "ho-so", "docs", "notes"]) {
    for (const n of list(path.join(dir, sub))) if (HANDOFF_RE.test(n)) docs.push(sub ? `${sub}/${n}` : n);
  }
  const handoff = docs.find((d) => /BAN[-_ ]?GIAO|HANDOFF/i.test(d));
  const summary = handoff ? handoffSummary(readCapped(path.join(dir, handoff))) : { current: "", next: "" };
  const names = list(dir);
  const deps = DEP_FILES.filter((f) => (f.startsWith("*") ? names.some((n) => n.endsWith(f.slice(1))) : names.includes(f)));
  let updated = 0;
  for (const f of [...instructions, ...docs]) { try { updated = Math.max(updated, statSync(path.join(dir, f)).mtimeMs); } catch { /* bỏ qua */ } }
  if (!updated) { try { updated = statSync(dir).mtimeMs; } catch { /* bỏ qua */ } }

  return {
    path: dir, name: path.basename(dir), excluded: null,
    instructions, skills, agents, commands, hooks, mcp, docs, deps, git: gitInfo(dir),
    current: summary.current, next: summary.next, handoffFile: handoff ?? null, settingsWarning,
    updatedAt: new Date(updated || Date.now()).toISOString(),
  };
}

function excludedRow(dir: string): Omit<InventoryRow, "projectId" | "oldSessions"> {
  return { path: dir, name: path.basename(dir), excluded: "Dự án Thịnh Vượng: không đưa vào hệ thống Trung Kiên", instructions: [], skills: [],
    agents: [], commands: 0, hooks: false, mcp: [], docs: [], deps: [], git: "", current: "", next: "", handoffFile: null,
    settingsWarning: null, updatedAt: new Date().toISOString() };
}

// Quét thư mục đã chọn, tối đa 3 tầng, tìm thư mục có dấu hiệu dự án.
export function scanFolder(root: string): { rows: Omit<InventoryRow, "projectId" | "oldSessions">[]; truncated: boolean } {
  const rows: Omit<InventoryRow, "projectId" | "oldSessions">[] = [];
  let visited = 0;
  let truncated = false;
  const walk = (dir: string, depth: number) => {
    if (visited++ >= MAX_DIRS) { truncated = true; return; }
    // Thư mục Thịnh Vượng: chỉ ghi tên để anh biết đã bỏ qua, không đọc gì bên trong.
    if (isThinhVuong(dir)) { rows.push(excludedRow(dir)); return; }
    if (isProject(dir)) rows.push(inspectProject(dir));
    if (depth >= MAX_DEPTH) return;
    for (const n of list(dir)) {
      if (n.startsWith(".") || SKIP_DIRS.has(n.toLowerCase())) continue;
      const p = path.join(dir, n);
      if (isDir(p)) walk(p, depth + 1);
    }
  };
  walk(root, 0);
  return { rows, truncated };
}
