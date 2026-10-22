import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { HubEvent, Settings, StartTaskInput } from "../shared/contract";
import { AgentRunner } from "./agent";
import { validateLimits } from "./budget";
import { HubDb } from "./db";
import { KeyStore } from "./keystore";
import { claudeExecutablePath } from "./sdk-path";
import { runSmokeTest } from "./smoke";
import { installUpdate, startUpdater } from "./updater";

const smoke = process.argv.includes("--smoke-test");
const outArg = process.argv.find((a) => a.startsWith("--smoke-out="));

let win: BrowserWindow | null = null;
const emit = (e: HubEvent) => win?.webContents.send("hub-event", e);

function registerIpc(db: HubDb, keys: KeyStore, runner: AgentRunner) {
  const h = (ch: string, fn: (...a: any[]) => unknown) => ipcMain.handle(ch, (_e, ...a) => fn(...a));
  h("appVersion", () => app.getVersion());
  h("hasApiKey", () => keys.has());
  h("setApiKey", (k: string) => keys.set(String(k ?? "")));
  h("clearApiKey", () => keys.clear());
  h("testApiKey", () => runner.testKey(app.getPath("temp")));
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
    return db.addProject(path.basename(p), p);
  });
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
  h("installUpdate", () => installUpdate());
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
  const keys = new KeyStore(path.join(dataDir, "api-key.bin"));
  const runner = new AgentRunner({
    db, query, emit, getApiKey: () => keys.get(), claudePath: claudeExecutablePath(), appVersion: app.getVersion(),
  });
  registerIpc(db, keys, runner);

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
