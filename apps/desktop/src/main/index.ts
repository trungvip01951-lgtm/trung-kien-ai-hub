import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { listSessions, query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { HubEvent, InventoryRow, OldSession, Settings, StartTaskInput } from "../shared/contract";
import { AgentRunner } from "./agent";
import { validateLimits } from "./budget";
import { HubDb } from "./db";
import { KeyRing } from "./keyring";
import { isThinhVuong, scanFolder } from "./inventory";
import { isInside } from "./policy";
import { SkillStore } from "./skills";
import { claudeExecutablePath } from "./sdk-path";
import { runSmokeTest } from "./smoke";
import { checkUpdateNow, installUpdate, startUpdater } from "./updater";

const smoke = process.argv.includes("--smoke-test");
const outArg = process.argv.find((a) => a.startsWith("--smoke-out="));

let win: BrowserWindow | null = null;
const emit = (e: HubEvent) => win?.webContents.send("hub-event", e);

// Phiên Claude Code cũ của một thư mục (đọc ~/.claude/projects bằng Agent SDK, chỉ đọc).
async function oldSessions(dir: string, limit = 50): Promise<OldSession[]> {
  // includeWorktrees: false: phiên của worktree ở thư mục khác không tiếp tục được bằng cwd của dự án này.
  const list = await listSessions({ dir, limit, includeProgrammatic: false, includeWorktrees: false });
  return list.map((s) => ({ sessionId: s.sessionId, title: s.customTitle || s.summary || s.firstPrompt || s.sessionId,
    lastModified: new Date(s.lastModified).toISOString(), sizeBytes: s.fileSize ?? null, gitBranch: s.gitBranch ?? null, imported: false }));
}

function registerIpc(db: HubDb, keys: KeyRing, runner: AgentRunner, skills: SkillStore) {
  const h = (ch: string, fn: (...a: any[]) => unknown) => ipcMain.handle(ch, (_e, ...a) => fn(...a));
  h("appVersion", () => app.getVersion());
  h("hasApiKey", () => keys.has());
  h("listApiKeys", () => keys.list());
  h("addApiKey", (k: string, label: string) => keys.add(String(k ?? ""), String(label ?? "")));
  h("removeApiKey", (id: string) => keys.remove(String(id)));
  h("moveApiKey", (id: string, d: number) => keys.move(String(id), d < 0 ? -1 : 1));
  h("testApiKey", (id: string) => runner.testKey(app.getPath("temp"), String(id)));
  h("getSettings", () => db.getSettings());
  h("saveSettings", (s: Settings) => {
    const err = validateLimits(s.limits);
    if (err) throw new Error(err);
    db.saveSettings(s);
    return db.getSettings();
  });
  h("usageSummary", () => {
    const u = runner.usageNow();
    return { todayUsd: u.today, cycleUsd: u.cycle, cycleStart: u.cycleStart.toISOString(), limits: u.limits,
      remainingForNextTaskUsd: u.allowedUsd, blockedReason: u.blockedReason };
  });
  h("listTasks", (n: number) => db.listTasks(Math.min(Number(n) || 20, 500)));
  h("listProjects", () => db.listProjects());
  h("addProject", async () => {
    const r = await dialog.showOpenDialog(win!, { title: "Chọn thư mục dự án", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    if (isThinhVuong(p)) throw new Error("Thư mục thuộc dự án Thịnh Vượng, không đưa vào hệ thống Trung Kiên.");
    return db.addProject(path.basename(p), p);
  });
  h("addProjectPath", (p: string) => {
    const dir = String(p ?? "");
    if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) return { ok: false, message: "Thư mục không còn tồn tại." };
    if (isThinhVuong(dir)) return { ok: false, message: "Thư mục thuộc dự án Thịnh Vượng, không đưa vào hệ thống Trung Kiên." };
    const project = db.addProject(path.basename(dir), dir);
    return { ok: true, message: `Đã thêm dự án ${project.name}.`, project };
  });
  h("saveProjectInstructions", (id: number, text: string) => db.saveProjectInstructions(Number(id), String(text ?? "").slice(0, 20000)));
  // Chỉ đọc tệp văn bản nằm trong thư mục dự án (CLAUDE.md, sổ bàn giao), tối đa 200 KB.
  h("readProjectFile", (id: number, rel: string) => {
    const p = db.getProject(Number(id));
    if (!p) return null;
    const f = path.resolve(p.path, String(rel ?? ""));
    if (!isInside(p.path, f) || !existsSync(f) || !statSync(f).isFile()) return null;
    return readFileSync(f).subarray(0, 200 * 1024).toString("utf8");
  });
  h("scanFolder", async () => {
    const r = await dialog.showOpenDialog(win!, { title: "Chọn thư mục để quét dự án (chỉ đọc)", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    const root = r.filePaths[0];
    const { rows, truncated } = scanFolder(root);
    const byPath = new Map(db.listProjects().map((p) => [p.path, p.id]));
    const full: InventoryRow[] = [];
    for (const row of rows) {
      let n: number | null = null;
      if (!row.excluded) { try { n = (await oldSessions(row.path, 500)).length; } catch { n = null; } }
      full.push({ ...row, projectId: byPath.get(row.path) ?? null, oldSessions: n });
    }
    db.saveInventory(full);
    return { rows: full, truncated, root };
  });
  h("lastInventory", () => {
    const inv = db.listInventory();
    const byPath = new Map(db.listProjects().map((p) => [p.path, p.id]));
    return { ...inv, rows: inv.rows.map((r) => ({ ...r, projectId: byPath.get(r.path) ?? null })) };
  });
  h("listOldSessions", async (id: number) => {
    const p = db.getProject(Number(id));
    if (!p) return [];
    const done = db.sessionIdsOfProject(p.id);
    return (await oldSessions(p.path)).map((s) => ({ ...s, imported: done.has(s.sessionId) }));
  });
  h("importOldSession", async (id: number, sessionId: string) => {
    const p = db.getProject(Number(id));
    if (!p) return { ok: false, message: "Không tìm thấy dự án." };
    const s = (await oldSessions(p.path, 500)).find((x) => x.sessionId === String(sessionId));
    if (!s) return { ok: false, message: "Không tìm thấy phiên này trong thư mục dự án." };
    const c = db.importSession(p.id, s.sessionId, `[Phiên cũ] ${s.title}`.slice(0, 80));
    return { ok: true, message: "Đã đưa phiên cũ vào Chat.", conversationId: c.id };
  });
  h("listSkills", () => skills.list());
  h("previewSkillUpload", async (kind: string) => {
    const zip = kind === "zip";
    const r = await dialog.showOpenDialog(win!, zip
      ? { title: "Chọn tệp Skill (.zip)", properties: ["openFile"], filters: [{ name: "Skill (.zip, .skill)", extensions: ["zip", "skill"] }] }
      : { title: "Chọn thư mục có SKILL.md", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    try {
      return zip ? skills.previewZip(r.filePaths[0]) : skills.previewFolder(r.filePaths[0]);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
  h("commitSkillUpload", (id: string, k: string[]) => skills.commit(String(id), Array.isArray(k) ? k.map(String) : []));
  h("cancelSkillUpload", (id: string) => skills.cancel(String(id)));
  h("setSkillEnabled", (name: string, on: boolean) => skills.setEnabled(String(name), on === true));
  h("removeSkill", (name: string) => skills.remove(String(name)));
  h("restoreSkill", (name: string, stamp: string) => skills.restore(String(name), String(stamp)));
  h("listConversations", (id: number) => db.listConversations(Number(id)));
  h("conversationItems", (id: number) => db.conversationItems(Number(id)));
  h("search", (q: string) => db.search(String(q ?? "")));
  h("startTask", async (input: StartTaskInput) => {
    const r = await runner.start(input);
    return { ok: r.ok, taskId: r.taskId, conversationId: r.conversationId, message: r.message };
  });
  h("stopTask", (id: number) => runner.stop(Number(id)));
  h("answerPermission", (id: string, allow: boolean) => runner.answerPermission(String(id), allow === true));
  h("runningTaskId", () => runner.runningTaskId());
  h("checkUpdate", () => checkUpdateNow());
  h("installUpdate", () => {
    if (runner.runningTaskId() !== null) {
      emit({ type: "update", status: "error", message: "Đang chạy một việc. Dừng hoặc chờ xong rồi bấm cập nhật." });
      return;
    }
    installUpdate();
  });
}

app.whenReady().then(async () => {
  if (smoke) {
    const pass = await runSmokeTest(outArg?.slice("--smoke-out=".length));
    app.exit(pass ? 0 : 1);
    return;
  }
  try {
    await startApp();
  } catch (err) {
    dialog.showErrorBox("Trung Kiên AI Hub không khởi động được", `${String(err)}\n\nDữ liệu: ${app.getPath("userData")}`);
    app.exit(1);
  }
});

async function startApp() {
  // Dữ liệu tách khỏi thư mục cài: %APPDATA%\trung-kien-ai-hub
  const dataDir = app.getPath("userData");
  mkdirSync(dataDir, { recursive: true });
  const db = new HubDb(path.join(dataDir, "hub.db"));
  db.markInterrupted();
  const keys = new KeyRing(path.join(dataDir, "api-keys.bin"), path.join(dataDir, "api-keys-state.json"), path.join(dataDir, "api-key.bin"));
  const skills = new SkillStore(path.join(dataDir, "skills"));
  const runner = new AgentRunner({
    db, query, emit, keys, skills, claudePath: claudeExecutablePath(), appVersion: app.getVersion(),
  });
  registerIpc(db, keys, runner, skills);

  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 600, title: "Trung Kiên AI Hub",
    webPreferences: { preload: path.join(__dirname, "..", "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  // Liên kết ngoài mở bằng trình duyệt mặc định, không mở trong cửa sổ app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  await win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  startUpdater(emit);
}

app.on("window-all-closed", () => app.quit());
