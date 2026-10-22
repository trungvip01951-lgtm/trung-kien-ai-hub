import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import { listSessions, query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { HubEvent, InventoryRow, OldSession, Schedule, Settings, StartTaskInput } from "../shared/contract";
import { AgentRunner } from "./agent";
import { validateLimits } from "./budget";
import { HubDb } from "./db";
import { KeyRing } from "./keyring";
import { isThinhVuong, scanFolder } from "./inventory";
import { isInside } from "./policy";
import { SkillStore } from "./skills";
import { Connections } from "./connections";
import { Backups } from "./backup";
import { Jobs } from "./jobs";
import { officeServer, windowsServer } from "./local-tools";
import { nextRun, validateRule } from "./schedule";
import { setSelfPids } from "./windows";
import { makePdf } from "./pdf";
import { mergeSpecialists, toAgentDefinitions } from "./specialists";
import type { SpecialistInfo } from "../shared/contract";
import { claudeExecutablePath, playwrightMcpCliPath } from "./sdk-path";
import { profilePaths } from "./chrome";
import { createRequire } from "node:module";
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

// Mã ghép nối tiện ích Playwright Extension, mã hoá trên máy.
class ExtensionToken {
  constructor(private file: string, private cipher: { encrypt(s: string): Buffer; decrypt(b: Buffer): string }) {}
  get(): string | null {
    try { return existsSync(this.file) ? this.cipher.decrypt(readFileSync(this.file)) || null : null; } catch { return null; }
  }
  set(t: string) {
    const v = t.trim();
    if (!v) { rmSync(this.file, { force: true }); return; }
    writeFileSync(this.file, this.cipher.encrypt(v), { mode: 0o600 });
  }
}

// Cửa sổ trình duyệt mở bằng hồ sơ riêng của app để anh Trung tự đăng nhập. Hồ sơ chỉ một trình duyệt dùng được
// một lúc, nên khi cửa sổ này mở thì không chạy việc, và ngược lại.
let browserWindowOpen = false;
async function openBrowserProfile(db: HubDb, runner: AgentRunner, dataDir: string): Promise<{ ok: boolean; message: string }> {
  if (browserWindowOpen) return { ok: false, message: "Trình duyệt của app đang mở." };
  if (runner.runningTaskId() !== null) return { ok: false, message: "Đang chạy một việc. Chờ xong rồi mở trình duyệt để đăng nhập." };
  const s = db.getSettings().chrome;
  // Dùng đúng thư viện Playwright đi kèm Playwright MCP để cùng phiên bản.
  const req = createRequire(require.resolve("@playwright/mcp/package.json"));
  const { chromium } = req("playwright-core") as typeof import("playwright-core");
  const { profileDir } = profilePaths(dataDir);
  // Đặt cờ trước khi mở (mất vài giây) để không có việc nào chen vào dùng cùng hồ sơ.
  browserWindowOpen = true;
  try {
    const ctx = await chromium.launchPersistentContext(profileDir, { channel: s.browser, headless: false, viewport: null });
    ctx.on("close", () => { browserWindowOpen = false; });
    const page = ctx.pages()[0] ?? await ctx.newPage();
    await page.goto("about:blank");
    return { ok: true, message: "Đã mở trình duyệt của app. Đăng nhập các website cần dùng, xong thì đóng cửa sổ đó rồi mới giao việc." };
  } catch (err) {
    browserWindowOpen = false;
    const name = s.browser === "chrome" ? "Google Chrome" : "Microsoft Edge";
    return { ok: false, message: `Không mở được ${name}: ${String(err).slice(0, 300)}. Kiểm tra máy đã cài ${name}, hoặc đổi trình duyệt trong mục Chrome.` };
  }
}

function registerIpc(db: HubDb, keys: KeyRing, runner: AgentRunner, skills: SkillStore, conns: Connections, ext: ExtensionToken, jobs: Jobs, backups: Backups) {
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
    // Danh sách website: chỉ giữ tên miền hợp lệ và quyền đã biết.
    const c = s.chrome ?? db.getSettings().chrome;
    s.chrome = { enabled: c.enabled !== false, mode: c.mode === "main" ? "main" : "app", browser: c.browser === "msedge" ? "msedge" : "chrome",
      sites: (Array.isArray(c.sites) ? c.sites : []).filter((x) => /^[a-z0-9.-]+$/.test(String(x?.host ?? "")) && ["read", "ask", "auto"].includes(x.mode))
        .map((x) => ({ host: String(x.host), mode: x.mode })) };
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
  h("listConnections", () => conns.info());
  h("addConnection", (k: string, n?: string, u?: string) => {
    const kind = ["windsor", "gmail", "drive", "sheets", "custom"].includes(k) ? (k as Parameters<Connections["add"]>[0]) : "custom";
    return conns.add(kind, n == null ? undefined : String(n), u == null ? undefined : String(u));
  });
  h("removeConnection", (id: string) => conns.remove(String(id)));
  h("setConnectionEnabled", (id: string, on: boolean) => conns.setEnabled(String(id), on === true));
  h("setConnectionClient", (id: string, cid: string, sec: string) => conns.setClient(String(id), String(cid ?? ""), String(sec ?? "")));
  h("loginConnection", (id: string) => conns.login(String(id)));
  h("logoutConnection", (id: string) => conns.logout(String(id)));
  h("setExtensionToken", (t: string) => ext.set(String(t ?? "")));
  h("hasExtensionToken", () => ext.get() !== null);
  h("runningTasks", () => runner.runningTasks());
  h("enqueueTask", (input: StartTaskInput) => jobs.enqueue(input, "Chat"));
  h("listQueue", () => db.listQueue());
  h("cancelQueue", (id: number) => jobs.cancel(Number(id)));
  h("listSchedules", () => db.listSchedules());
  h("saveSchedule", (s: Schedule) => {
    const err = validateRule(s);
    if (err) throw new Error(err);
    if (!s.prompt?.trim() || !db.getProject(Number(s.projectId))) throw new Error("Lịch cần dự án và nội dung việc.");
    return jobs.saveSchedule({ ...s, projectId: Number(s.projectId), name: String(s.name || s.prompt).slice(0, 80) });
  });
  h("deleteSchedule", (id: number) => db.deleteSchedule(Number(id)));
  h("runScheduleNow", (id: number) => {
    const s = db.getSchedule(Number(id));
    if (!s) return null;
    return jobs.enqueue({ conversationId: null, projectId: s.projectId, prompt: s.prompt, model: s.model, effort: s.effort, permission: s.permission }, `Lịch #${s.id} ${s.name}`);
  });
  h("listSpecialists", () => mergeSpecialists(db.getJson<SpecialistInfo[]>("specialists")));
  h("saveSpecialists", (list: SpecialistInfo[]) => {
    const clean = (Array.isArray(list) ? list : []).filter((s) => /^[a-z0-9-]{2,40}$/.test(String(s?.id)) && String(s.name ?? "").trim())
      .map((s) => ({ id: s.id, name: String(s.name).slice(0, 80), description: String(s.description ?? "").slice(0, 2000), prompt: String(s.prompt ?? "").slice(0, 8000),
        model: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"].includes(s.model) ? s.model : "claude-sonnet-5-5",
        effort: ["low", "medium", "high", "xhigh"].includes(s.effort) ? s.effort : "medium", enabled: s.enabled !== false, builtin: false }));
    db.setJson("specialists", clean);
    return mergeSpecialists(clean);
  });
  h("listMemory", (pid: number | null, q: string) => db.listMemory(pid == null ? null : Number(pid), 200, String(q ?? "")));
  h("saveMemory", (n: { id?: number; projectId: number | null; kind: string; title: string; content: string }) => {
    const kind = ["rule", "fact", "error", "progress", "note"].includes(n.kind) ? n.kind as "rule" : "note";
    if (!String(n.title ?? "").trim() || !String(n.content ?? "").trim()) throw new Error("Cần tiêu đề và nội dung.");
    return db.upsertMemory({ id: n.id ? Number(n.id) : undefined, projectId: n.projectId == null ? null : Number(n.projectId), kind,
      title: String(n.title).trim().slice(0, 200), content: String(n.content).trim().slice(0, 8000) }).note;
  });
  h("deleteMemory", (id: number) => db.deleteMemory(Number(id)));
  h("checkIntegrity", () => db.integrityOk());
  h("listBackups", () => backups.list());
  h("createBackup", () => backups.create("manual"));
  h("restoreBackup", (id: string) => {
    if (runner.runningTaskId() !== null) return { ok: false, message: "Đang chạy việc. Chờ xong rồi khôi phục." };
    const r = backups.requestRestore(String(id));
    // app.exit bỏ qua sự kiện thoát thường: tự dừng lịch và đóng cơ sở dữ liệu trước.
    if (r.ok) setTimeout(() => { jobs.stop(); try { db.close(); } catch { /* đã đóng */ } app.relaunch(); app.exit(0); }, 500);
    return r;
  });
  h("exportBackup", async (id: string) => {
    const r = await dialog.showOpenDialog(win!, { title: "Chọn thư mục để lưu bản sao lưu", properties: ["openDirectory", "createDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    return backups.exportTo(String(id), r.filePaths[0]);
  });
  h("importBackup", async () => {
    const r = await dialog.showOpenDialog(win!, { title: "Chọn thư mục bản sao lưu (có manifest.json)", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    return backups.importFrom(r.filePaths[0]);
  });
  h("openBrowserProfile", () => openBrowserProfile(db, runner, app.getPath("userData")));
  h("startTask", async (input: StartTaskInput) => {
    if (browserWindowOpen) return { ok: false, message: "Trình duyệt của app đang mở để đăng nhập. Đóng cửa sổ đó rồi giao việc." };
    const r = await runner.start(input);
    return { ok: r.ok, busy: r.busy, taskId: r.taskId, conversationId: r.conversationId, message: r.message };
  });
  h("stopTask", (id: number) => runner.stop(Number(id)));
  h("answerPermission", (id: string, allow: boolean, always?: boolean) => runner.answerPermission(String(id), allow === true, always === true));
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

// Chỉ một bản app chạy một lúc (hai bản cùng mở một hub.db sẽ chạy trùng hàng đợi, lịch).
if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
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
  let dbRef: HubDb | null = null;
  const backups = new Backups(dataDir, (f) => dbRef!.snapshot(f), app.getVersion());
  // Khôi phục đã yêu cầu ở lần chạy trước: làm trước khi mở cơ sở dữ liệu.
  let restored: string | null = null;
  let restoreError = "";
  try { restored = backups.applyPendingRestore(); } catch (err) { restoreError = String(err); }
  const db = new HubDb(path.join(dataDir, "hub.db"));
  dbRef = db;
  db.markInterrupted();
  if (restored) {
    // Việc "đang chờ" và giờ lịch trong bản cũ có thể đã chạy rồi: huỷ việc chờ, tính lại giờ lịch từ bây giờ (không chạy bù).
    db.cancelWaitingQueue("Huỷ sau khi khôi phục bản sao lưu (tránh chạy lặp).");
    for (const s of db.listSchedules()) db.markScheduleRun(s.id, s.lastRunAt ?? new Date().toISOString(), s.enabled ? nextRun(s, new Date()).toISOString() : null);
  }
  // Đóng cơ sở dữ liệu êm khi thoát để gộp nhật ký ghi (WAL) vào hub.db.
  app.on("will-quit", () => { try { db.close(); } catch { /* đã đóng */ } });
  try { backups.autoIfDue(); } catch (err) { console.error("Tự sao lưu lỗi:", err); }
  const keys = new KeyRing(path.join(dataDir, "api-keys.bin"), path.join(dataDir, "api-keys-state.json"), path.join(dataDir, "api-key.bin"));
  const skills = new SkillStore(path.join(dataDir, "skills"));
  const cipher = { encrypt: (s: string) => safeStorage.encryptString(s), decrypt: (b: Buffer) => safeStorage.decryptString(b) };
  const conns = new Connections(path.join(dataDir, "connections.json"), path.join(dataDir, "connections.bin"), cipher,
    (url) => shell.openExternal(url));
  const ext = new ExtensionToken(path.join(dataDir, "chrome-extension-token.bin"), cipher);
  const runner = new AgentRunner({
    db, query, emit, keys, skills, claudePath: claudeExecutablePath(), appVersion: app.getVersion(),
    chrome: { nodeBinary: process.execPath, cliPath: playwrightMcpCliPath(), ...profilePaths(dataDir), extensionToken: () => ext.get() },
    connections: conns,
    specialists: () => toAgentDefinitions(mergeSpecialists(db.getJson<SpecialistInfo[]>("specialists"))),
    memory: db,
    local: {
      windows: () => (process.platform === "win32" ? windowsServer() : null),
      office: (projectDir) => officeServer({ backupDir: path.join(dataDir, "office-backup"), projectDir, makePdf }),
    },
  });
  const jobs = new Jobs(db, runner, emit, () => new Date(),
    () => (browserWindowOpen ? "Trình duyệt của app đang mở để đăng nhập" : null));
  setSelfPids(() => (win && !win.isDestroyed() ? [win.webContents.getOSProcessId()] : []));
  registerIpc(db, keys, runner, skills, conns, ext, jobs, backups);

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
  jobs.start();
  if (restoreError) dialog.showErrorBox("Khôi phục không thành công", restoreError);
  if (restored) dialog.showMessageBox(win, { message: `Đã khôi phục bản sao lưu ${restored}. Trạng thái trước khi khôi phục được cất trong mục Sao lưu.` }).catch(() => {});
}

app.on("window-all-closed", () => app.quit());
