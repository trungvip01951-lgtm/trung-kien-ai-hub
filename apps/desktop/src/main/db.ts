import { DatabaseSync } from "node:sqlite";
import type { ChatItem, Conversation, InventoryRow, ItemKind, Project, SearchHit, Settings, TaskRow, TaskStatus } from "../shared/contract";
import { DEFAULT_LIMITS } from "./budget";

// Lưu trữ cục bộ bằng SQLite có sẵn trong Node (node:sqlite), tìm kiếm bằng FTS5.
// Tệp nằm trong thư mục dữ liệu người dùng, tách khỏi thư mục cài đặt.

export const DEFAULT_SETTINGS: Settings = {
  limits: DEFAULT_LIMITS, defaultModel: "claude-sonnet-5-5", defaultEffort: "medium",
  defaultPermission: "write", theme: "system", autoRouting: true,
  chrome: { enabled: true, browser: "chrome", sites: [] },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
  session_id TEXT, session_total_usd REAL NOT NULL DEFAULT 0, session_total_ok INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, conversation_id INTEGER REFERENCES conversations(id), prompt TEXT NOT NULL,
  model TEXT NOT NULL, effort TEXT NOT NULL, permission TEXT NOT NULL, status TEXT NOT NULL,
  allowance_usd REAL NOT NULL, cost_usd REAL NOT NULL DEFAULT 0, cost_is_estimate INTEGER NOT NULL DEFAULT 1,
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  stop_reason TEXT, created_at TEXT NOT NULL, finished_at TEXT);
CREATE INDEX IF NOT EXISTS tasks_created ON tasks(created_at);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id), conversation_id INTEGER,
  kind TEXT NOT NULL, text TEXT NOT NULL, tool_name TEXT, is_error INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS items_conv ON items(conversation_id, id);
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(text, content='items', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, text) VALUES (new.id, new.text); END;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const now = () => new Date().toISOString();
type Row = Record<string, unknown>;

export interface TaskUpdate {
  status?: TaskStatus; costUsd?: number; costIsEstimate?: boolean; inputTokens?: number; outputTokens?: number;
  cacheReadTokens?: number; cacheWriteTokens?: number; stopReason?: string | null; finished?: boolean;
}

export class HubDb {
  private db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
    this.migrate();
  }

  // Nâng cấp cấu trúc cho tệp dữ liệu tạo từ bản cũ (cập nhật app không được làm mất dữ liệu).
  // Mỗi bước chỉ thêm, không xoá; số bước lưu trong PRAGMA user_version.
  private migrate() {
    const cols = (t: string) => (this.db.prepare(`PRAGMA table_info(${t})`).all() as Row[]).map((r) => String(r.name));
    const steps: (() => void)[] = [
      () => {
        if (!cols("conversations").includes("session_total_ok")) {
          this.db.exec("ALTER TABLE conversations ADD COLUMN session_total_ok INTEGER NOT NULL DEFAULT 1");
        }
      },
      // 0.3.0: hướng dẫn dự án, bảng kiểm kê dự án (PROJECT_INVENTORY).
      () => {
        if (!cols("projects").includes("instructions")) this.db.exec("ALTER TABLE projects ADD COLUMN instructions TEXT NOT NULL DEFAULT ''");
        this.db.exec("CREATE TABLE IF NOT EXISTS inventory (path TEXT PRIMARY KEY, data TEXT NOT NULL, scanned_at TEXT NOT NULL)");
      },
    ];
    const v = Number((this.db.prepare("PRAGMA user_version").get() as Row).user_version);
    for (let i = v; i < steps.length; i++) {
      steps[i]();
      this.db.exec(`PRAGMA user_version = ${i + 1}`);
    }
  }

  close() { this.db.close(); }

  // Việc còn "đang chạy" khi mở app nghĩa là lần trước app bị tắt giữa chừng.
  markInterrupted(): number {
    this.db.exec(`UPDATE conversations SET session_total_ok=0 WHERE id IN (SELECT conversation_id FROM tasks WHERE status='running')`);
    const r = this.db.prepare("UPDATE tasks SET status='interrupted', finished_at=? WHERE status='running'").run(now());
    return Number(r.changes);
  }

  getSettings(): Settings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key='app'").get() as Row | undefined;
    if (!row) return structuredClone(DEFAULT_SETTINGS);
    const saved = JSON.parse(String(row.value)) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved, limits: { ...DEFAULT_SETTINGS.limits, ...saved.limits }, chrome: { ...DEFAULT_SETTINGS.chrome, ...saved.chrome } };
  }

  saveSettings(s: Settings) {
    this.db.prepare("INSERT INTO settings(key, value) VALUES('app', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(s));
  }

  addProject(name: string, path: string): Project {
    const existing = this.db.prepare("SELECT * FROM projects WHERE path=?").get(path) as Row | undefined;
    if (existing) return toProject(existing);
    const r = this.db.prepare("INSERT INTO projects(name, path, created_at) VALUES(?,?,?)").run(name, path, now());
    return this.getProject(Number(r.lastInsertRowid))!;
  }

  getProject(id: number): Project | null {
    const r = this.db.prepare("SELECT * FROM projects WHERE id=?").get(id) as Row | undefined;
    return r ? toProject(r) : null;
  }

  saveProjectInstructions(id: number, text: string): Project | null {
    this.db.prepare("UPDATE projects SET instructions=? WHERE id=?").run(text, id);
    return this.getProject(id);
  }

  // Lưu kết quả quét (thay dòng cũ cùng đường dẫn, giữ dòng của thư mục khác).
  saveInventory(rows: InventoryRow[]) {
    const t = now();
    const st = this.db.prepare("INSERT INTO inventory(path, data, scanned_at) VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET data=excluded.data, scanned_at=excluded.scanned_at");
    for (const r of rows) st.run(r.path, JSON.stringify(r), t);
  }

  listInventory(): { rows: InventoryRow[]; scannedAt: string | null } {
    const rs = this.db.prepare("SELECT data, scanned_at FROM inventory ORDER BY path").all() as Row[];
    return { rows: rs.map((r) => JSON.parse(String(r.data)) as InventoryRow),
      scannedAt: rs.reduce<string | null>((m, r) => (m && m > String(r.scanned_at) ? m : String(r.scanned_at)), null) };
  }

  // Tiếp tục một phiên Claude Code cũ: tạo hội thoại gắn session_id đó. Tổng chi phí cũ của phiên không biết
  // (session_total_usd = -1): lần chạy đầu tính theo ước tính token nhân hệ số an toàn.
  importSession(projectId: number, sessionId: string, title: string): Conversation {
    const found = this.db.prepare("SELECT id FROM conversations WHERE session_id=? AND project_id=?").get(sessionId, projectId) as Row | undefined;
    if (found) return this.getConversation(Number(found.id))!;
    const t = now();
    const r = this.db.prepare(`INSERT INTO conversations(project_id, title, session_id, session_total_usd, session_total_ok, created_at, updated_at)
      VALUES(?,?,?,-1,0,?,?)`).run(projectId, title, sessionId, t, t);
    return this.getConversation(Number(r.lastInsertRowid))!;
  }

  sessionIdsOfProject(projectId: number): Set<string> {
    const rs = this.db.prepare("SELECT session_id FROM conversations WHERE project_id=? AND session_id IS NOT NULL").all(projectId) as Row[];
    return new Set(rs.map((r) => String(r.session_id)));
  }

  listProjects(): Project[] {
    return (this.db.prepare("SELECT * FROM projects ORDER BY name").all() as Row[]).map(toProject);
  }

  createConversation(projectId: number, title: string): Conversation {
    const t = now();
    const r = this.db.prepare("INSERT INTO conversations(project_id, title, created_at, updated_at) VALUES(?,?,?,?)").run(projectId, title, t, t);
    return this.getConversation(Number(r.lastInsertRowid))!;
  }

  getConversation(id: number): (Conversation & { sessionTotalUsd: number; sessionTotalOk: boolean }) | null {
    const r = this.db.prepare(`SELECT c.*, (SELECT COALESCE(SUM(cost_usd),0) FROM tasks WHERE conversation_id=c.id) AS cost
      FROM conversations c WHERE id=?`).get(id) as Row | undefined;
    return r ? { ...toConversation(r), sessionTotalUsd: Number(r.session_total_usd), sessionTotalOk: Number(r.session_total_ok) === 1 } : null;
  }

  listConversations(projectId: number): Conversation[] {
    return (this.db.prepare(`SELECT c.*, (SELECT COALESCE(SUM(cost_usd),0) FROM tasks WHERE conversation_id=c.id) AS cost
      FROM conversations c WHERE project_id=? ORDER BY updated_at DESC`).all(projectId) as Row[]).map(toConversation);
  }

  setSession(conversationId: number, sessionId: string) {
    this.db.prepare("UPDATE conversations SET session_id=?, updated_at=? WHERE id=?").run(sessionId, now(), conversationId);
  }

  setSessionTotal(conversationId: number, totalUsd: number, ok: boolean) {
    this.db.prepare("UPDATE conversations SET session_total_usd=?, session_total_ok=?, updated_at=? WHERE id=?").run(totalUsd, ok ? 1 : 0, now(), conversationId);
  }

  // Việc kết thúc không có result: tổng chi phí phiên cũ không còn tin được.
  markSessionTotalUnsure(conversationId: number) {
    this.db.prepare("UPDATE conversations SET session_total_ok=0 WHERE id=?").run(conversationId);
  }

  createTask(t: { conversationId: number | null; prompt: string; model: string; effort: string; permission: string; allowanceUsd: number }): number {
    const r = this.db.prepare(`INSERT INTO tasks(conversation_id, prompt, model, effort, permission, status, allowance_usd, created_at)
      VALUES(?,?,?,?,?,'running',?,?)`).run(t.conversationId, t.prompt, t.model, t.effort, t.permission, t.allowanceUsd, now());
    return Number(r.lastInsertRowid);
  }

  updateTask(id: number, u: TaskUpdate) {
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    const add = (col: string, v: string | number | null) => { sets.push(`${col}=?`); vals.push(v); };
    if (u.status !== undefined) add("status", u.status);
    if (u.costUsd !== undefined) add("cost_usd", u.costUsd);
    if (u.costIsEstimate !== undefined) add("cost_is_estimate", u.costIsEstimate ? 1 : 0);
    if (u.inputTokens !== undefined) add("input_tokens", u.inputTokens);
    if (u.outputTokens !== undefined) add("output_tokens", u.outputTokens);
    if (u.cacheReadTokens !== undefined) add("cache_read_tokens", u.cacheReadTokens);
    if (u.cacheWriteTokens !== undefined) add("cache_write_tokens", u.cacheWriteTokens);
    if (u.stopReason !== undefined) add("stop_reason", u.stopReason);
    if (u.finished) add("finished_at", now());
    if (!sets.length) return;
    vals.push(id);
    this.db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id=?`).run(...vals);
  }

  getTask(id: number): TaskRow | null {
    const r = this.db.prepare("SELECT * FROM tasks WHERE id=?").get(id) as Row | undefined;
    return r ? toTask(r) : null;
  }

  listTasks(limit: number): TaskRow[] {
    return (this.db.prepare("SELECT * FROM tasks ORDER BY id DESC LIMIT ?").all(limit) as Row[]).map(toTask);
  }

  // Tổng chi phí (kể cả việc đang chạy) từ thời điểm `since`. Tính theo giờ bắt đầu việc:
  // việc bắt đầu trước 0h mà tiêu tiền sau 0h vẫn tính vào ngày cũ (mỗi việc tối đa bằng hạn mức một việc).
  spentSince(since: Date): number {
    const r = this.db.prepare("SELECT COALESCE(SUM(cost_usd),0) AS s FROM tasks WHERE created_at >= ?").get(since.toISOString()) as Row;
    return Number(r.s);
  }

  addItem(i: { taskId: number; conversationId: number | null; kind: ItemKind; text: string; toolName?: string; isError?: boolean }): ChatItem {
    const t = now();
    const r = this.db.prepare("INSERT INTO items(task_id, conversation_id, kind, text, tool_name, is_error, created_at) VALUES(?,?,?,?,?,?,?)")
      .run(i.taskId, i.conversationId, i.kind, i.text, i.toolName ?? null, i.isError ? 1 : 0, t);
    if (i.conversationId) this.db.prepare("UPDATE conversations SET updated_at=? WHERE id=?").run(t, i.conversationId);
    return { id: Number(r.lastInsertRowid), taskId: i.taskId, kind: i.kind, text: i.text, toolName: i.toolName, isError: !!i.isError, createdAt: t };
  }

  conversationItems(conversationId: number): ChatItem[] {
    return (this.db.prepare("SELECT * FROM items WHERE conversation_id=? ORDER BY id").all(conversationId) as Row[]).map(toItem);
  }

  search(query: string, limit = 50): SearchHit[] {
    // Mỗi từ thành một cụm trong ngoặc kép để ký tự đặc biệt của FTS5 không gây lỗi cú pháp.
    const terms = query.split(/\s+/).filter(Boolean).map((w) => `"${w.replace(/"/g, '""')}"`);
    if (!terms.length) return [];
    const rows = this.db.prepare(`SELECT i.conversation_id, i.task_id, i.created_at,
        snippet(items_fts, 0, '<b>', '</b>', '…', 12) AS snip
      FROM items_fts JOIN items i ON i.id = items_fts.rowid
      WHERE items_fts MATCH ? AND i.conversation_id IS NOT NULL ORDER BY rank LIMIT ?`).all(terms.join(" "), limit) as Row[];
    return rows.map((r) => ({ conversationId: Number(r.conversation_id), taskId: Number(r.task_id), snippet: String(r.snip), createdAt: String(r.created_at) }));
  }

  integrityOk(): boolean {
    const r = this.db.prepare("PRAGMA integrity_check").get() as Row;
    return Object.values(r)[0] === "ok";
  }
}

function toProject(r: Row): Project {
  return { id: Number(r.id), name: String(r.name), path: String(r.path), createdAt: String(r.created_at), instructions: String(r.instructions ?? "") };
}
function toConversation(r: Row): Conversation {
  return { id: Number(r.id), projectId: Number(r.project_id), title: String(r.title), sessionId: (r.session_id as string) ?? null,
    createdAt: String(r.created_at), updatedAt: String(r.updated_at), costUsd: Number(r.cost ?? 0) };
}
function toTask(r: Row): TaskRow {
  return { id: Number(r.id), conversationId: Number(r.conversation_id ?? 0), prompt: String(r.prompt), model: r.model as TaskRow["model"],
    status: r.status as TaskStatus, costUsd: Number(r.cost_usd), costIsEstimate: Number(r.cost_is_estimate) === 1,
    inputTokens: Number(r.input_tokens), outputTokens: Number(r.output_tokens), cacheReadTokens: Number(r.cache_read_tokens),
    cacheWriteTokens: Number(r.cache_write_tokens), stopReason: (r.stop_reason as string) ?? null,
    createdAt: String(r.created_at), finishedAt: (r.finished_at as string) ?? null };
}
function toItem(r: Row): ChatItem {
  return { id: Number(r.id), taskId: Number(r.task_id), kind: r.kind as ItemKind, text: String(r.text),
    toolName: (r.tool_name as string) ?? undefined, isError: Number(r.is_error) === 1, createdAt: String(r.created_at) };
}
