import { existsSync } from "node:fs";
import path from "node:path";
import type { CanUseTool, HookCallback, Options, Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { HubEvent, ModelId, StartTaskInput, TaskRow, TaskStatus } from "../shared/contract";
import { allowance, crossedWarning, cycleStart, dayStart, SDK_HEADROOM } from "./budget";
import type { HubDb } from "./db";
import { alwaysKey, decide, summarizeInput } from "./policy";
import { estimateCostUsd, type TokenUsage } from "./pricing";
import { keyErrorReason, type KeyEntry } from "./keys";
import { checkSettings, settingsFiles } from "./settings-guard";
import { buildSystemPrompt, ROUTED_AGENTS } from "./routing";
import { CHROME_GUIDE, CHROME_SERVER, chromeServerConfig, decideBrowser, hostOf, isBrowserTool, newBrowserState, updateBrowserState, type ChromePaths } from "./chrome";
import type { AgentDefinition, McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { MEMORY_GUIDE, MEMORY_SERVER, memoryServer, type MemoryStore } from "./memory-tools";
import type { Decision } from "./policy";
import { decideOffice, decideWindows, OFFICE_SERVER, WIN_SERVER } from "./local-tools";

export type QueryFn = (args: { prompt: string; options?: Options }) => Query;

export interface AgentDeps {
  db: HubDb;
  query: QueryFn;
  // Danh sách API key theo thứ tự sẽ thử, và nơi ghi kết quả dùng key.
  keys: { forUse(): KeyEntry[]; get(id: string): KeyEntry | null; markError(id: string, reason: string): void; markOk(id: string): void };
  emit: (e: HubEvent) => void;
  claudePath: string;
  // Kho Skills của app (nạp cho agent như plugin cục bộ); agent được đọc tệp trong đó không cần hỏi.
  skills?: { pluginPath(): string | null; readableRoot(): string };
  // Điều khiển trình duyệt (Playwright MCP); không có thì không nạp công cụ trình duyệt.
  chrome?: ChromePaths;
  // AI chuyên môn đang bật (mục Agents) và bộ nhớ dài hạn.
  specialists?: () => Record<string, AgentDefinition>;
  memory?: MemoryStore;
  // Công cụ chạy trong app: điều khiển Windows, Excel/Word/PDF (tạo mới cho từng việc).
  local?: { windows(): McpServerConfig | null; office(projectDir: string): McpServerConfig };
  // Kết nối Windsor.ai, Google... (máy chủ MCP từ xa, đăng nhập OAuth trong app).
  connections?: {
    forTask(): Promise<{ servers: Record<string, McpServerConfig>; notes: string[] }>;
    owns(toolName: string): boolean;
    decide(toolName: string, level: StartTaskInput["permission"]): Decision;
  };
  appVersion: string;
  now?: () => Date;
}

// Biến môi trường có thể khiến tiến trình agent dùng đăng nhập gói Max, phiên Claude Code khác
// hoặc nhà cung cấp khác thay vì API key: bỏ mọi biến ANTHROPIC_*, CLAUDE*, CCR_* thừa hưởng,
// chỉ đặt lại đúng API key anh Trung nhập. (Sổ lỗi mục 1: phiên cloud từng lọt biến CLAUDE_CODE_*.)
const BLOCKED_PREFIXES = ["ANTHROPIC_", "CLAUDE", "CCR_"];

export function agentEnv(apiKey: string, appVersion: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!BLOCKED_PREFIXES.some((p) => k.toUpperCase().startsWith(p))) env[k] = v;
  }
  env.ANTHROPIC_API_KEY = apiKey;
  env.CLAUDE_AGENT_SDK_CLIENT_APP = `trung-kien-ai-hub/${appVersion}`;
  return env;
}

// Chờ anh Trung trả lời hộp xác nhận tối đa 30 phút, quá thì coi như từ chối
// (phải ngắn hơn timeout của hook để SDK không tự quyết theo luật khác).
const ASK_TIMEOUT_MS = 30 * 60 * 1000;
const HOOK_TIMEOUT_S = 3600;
// Hệ số an toàn khi không chắc tổng chi phí của phiên cũ (sổ lỗi/rà soát 22/10/2026).
const ESTIMATE_SAFETY = 1.2;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const usd4 = (n: number) => `${n.toFixed(4)} USD`;

// Kết quả một lần chạy với một API key.
interface Attempt {
  status: TaskStatus; message: string; resultCost: number | null;
  keyError: string | null;   // lỗi do key (hết tiền, sai key...) → có thể chuyển key
  sideEffects: boolean;      // agent đã gọi công cụ → không tự chạy lại để tránh làm trùng
  estimate: number;          // ước tính riêng của lần chạy này (dùng khi không có result)
}

interface Running {
  taskId: number;
  conversationId: number;
  allowanceUsd: number;
  usesBrowser: boolean;
  query: Query;
  abort: AbortController;
  stopRequested: boolean;
  budgetHit: boolean;
}

// Số việc chạy cùng lúc tối đa (mỗi việc giữ trước phần hạn mức của mình).
export const MAX_PARALLEL = 3;

export class AgentRunner {
  private runs = new Map<number, Running>();
  private testing = false;
  private pending = new Map<string, { taskId: number; key: string; resolve: (allow: boolean) => void }>();
  // "Đồng ý luôn": loại thao tác anh Trung đã cho phép hẳn trong từng hội thoại (chỉ trong lúc app đang mở).
  private alwaysAllow = new Map<number, Set<string>>();
  private seq = 0;

  constructor(private deps: AgentDeps) {}

  runningTaskId(): number | null { return this.runs.keys().next().value ?? null; }
  runningTasks(): { taskId: number; conversationId: number }[] {
    return [...this.runs.values()].map((r) => ({ taskId: r.taskId, conversationId: r.conversationId }));
  }

  usageNow() {
    const now = (this.deps.now ?? (() => new Date()))();
    const limits = this.deps.db.getSettings().limits;
    const cs = cycleStart(now, limits.cycleStartDay);
    const today = this.deps.db.spentSince(dayStart(now));
    const cycle = this.deps.db.spentSince(cs);
    // Việc đang chạy giữ trước phần hạn mức chưa tiêu của nó, để nhiều việc cùng lúc không vượt hạn mức ngày/kỳ.
    let reserved = 0;
    for (const r of this.runs.values()) reserved += Math.max(0, r.allowanceUsd - (this.deps.db.getTask(r.taskId)?.costUsd ?? 0));
    return { limits, today, cycle, cycleStart: cs, reservedUsd: reserved, ...allowance(limits, today + reserved, cycle + reserved) };
  }

  answerPermission(requestId: string, allow: boolean, always = false) {
    const p = this.pending.get(requestId);
    if (!p) return;
    this.pending.delete(requestId);
    if (allow && always && p.key) {
      const auto: string[] = [];
      const conv = this.runs.get(p.taskId)?.conversationId;
      if (conv != null) {
        const set = this.alwaysAllow.get(conv) ?? new Set<string>();
        set.add(p.key);
        this.alwaysAllow.set(conv, set);
        // Các yêu cầu cùng loại đang chờ trong hội thoại này cũng được cho luôn.
        for (const [id, q] of this.pending) {
          if (q.key === p.key && this.runs.get(q.taskId)?.conversationId === conv) { this.pending.delete(id); q.resolve(true); auto.push(id); }
        }
        if (auto.length) this.deps.emit({ type: "permission-resolved", requestIds: auto });
      }
    }
    p.resolve(allow);
  }

  private isAlwaysAllowed(taskId: number, key: string): boolean {
    const conv = this.runs.get(taskId)?.conversationId;
    return conv != null && (this.alwaysAllow.get(conv)?.has(key) ?? false);
  }

  async stop(taskId: number) {
    const r = this.runs.get(taskId);
    if (!r) return;
    r.stopRequested = true;
    this.denyPending(taskId);
    try { await r.query.interrupt(); } catch { /* đã kết thúc */ }
    // Không dừng được êm trong 5 giây thì cắt hẳn tiến trình.
    setTimeout(() => { if (this.runs.has(taskId)) r.abort.abort(); }, 5000);
  }

  private denyPending(taskId: number) {
    const ids: string[] = [];
    for (const [id, p] of this.pending) if (p.taskId === taskId) { this.pending.delete(id); p.resolve(false); ids.push(id); }
    if (ids.length) this.deps.emit({ type: "permission-resolved", requestIds: ids });
  }

  private askUser(taskId: number, toolName: string, input: unknown, signal?: AbortSignal, reason?: string, key: string | null = null): Promise<boolean> {
    if (key && this.isAlwaysAllowed(taskId, key)) return Promise.resolve(true);
    const requestId = `p${++this.seq}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.answerPermission(requestId, false), ASK_TIMEOUT_MS);
      this.pending.set(requestId, { taskId, key: key ?? "", resolve: (allow) => { clearTimeout(timer); resolve(allow); } });
      signal?.addEventListener("abort", () => this.answerPermission(requestId, false), { once: true });
      this.deps.emit({ type: "permission-request", requestId, taskId, toolName, summary: `${reason ? `${reason}\n` : ""}${summarizeInput(toolName, input)}`, canAlways: !!key });
    });
  }

  // Bắt đầu một việc. Trả về ngay sau khi tạo việc; tiến trình chạy tiếp ở nền.
  // busy: không chạy được lúc này vì đang bận (đủ số việc, hội thoại đang chạy, đang kiểm key) — xếp hàng được.
  async start(input: StartTaskInput): Promise<{ ok: boolean; busy?: boolean; taskId?: number; conversationId?: number; message?: string; done?: Promise<TaskRow> }> {
    const { db } = this.deps;
    // Lấy mã truy cập các kết nối trước mọi kiểm tra (có thể cần gọi mạng để làm mới), để phần kiểm tra phía sau
    // và việc ghi nhận việc đang chạy không bị chen giữa.
    const connections = this.deps.connections ? await this.deps.connections.forTask() : { servers: {}, notes: [] as string[] };
    if (this.testing) return { ok: false, busy: true, message: "Đang kiểm tra API key, thử lại sau vài giây." };
    if (input.conversationId != null && [...this.runs.values()].some((r) => r.conversationId === input.conversationId)) {
      return { ok: false, busy: true, message: "Hội thoại này đang chạy. Chờ xong, bấm Dừng, hoặc mở hội thoại mới." };
    }
    if (this.runs.size >= MAX_PARALLEL) return { ok: false, busy: true, message: `Đang chạy ${MAX_PARALLEL} việc cùng lúc (tối đa). Chờ một việc xong rồi giao tiếp.` };
    const keys = this.deps.keys.forUse();
    if (!keys.length) return { ok: false, message: "Chưa có API key. Vào Cài đặt để nhập." };
    const project = db.getProject(input.projectId);
    if (!project) return { ok: false, message: "Không tìm thấy dự án." };
    if (!existsSync(project.path)) return { ok: false, message: `Thư mục dự án không còn tồn tại: ${project.path}` };
    const settingsProblem = checkSettings(settingsFiles(project.path));
    if (settingsProblem) return { ok: false, message: settingsProblem };
    const prompt = input.prompt.trim();
    if (!prompt) return { ok: false, message: "Chưa nhập yêu cầu." };

    const u = this.usageNow();
    if (u.blockedReason) return { ok: false, message: u.blockedReason };

    let conv = input.conversationId ? db.getConversation(input.conversationId) : null;
    if (input.conversationId && !conv) return { ok: false, message: "Không tìm thấy hội thoại." };
    if (!conv) conv = db.getConversation(db.createConversation(project.id, clip(prompt.replace(/\s+/g, " "), 60)).id)!;

    const taskId = db.createTask({ conversationId: conv.id, prompt, model: input.model, effort: input.effort, permission: input.permission, allowanceUsd: u.allowedUsd });
    const level = input.permission;
    const extraRead = [...(this.deps.skills ? [this.deps.skills.readableRoot()] : []), ...(this.deps.chrome ? [this.deps.chrome.outputDir] : [])];
    const pluginPath = this.deps.skills?.pluginPath() ?? null;
    const settings = db.getSettings();
    const autoRouting = settings.autoRouting;
    // Trình duyệt chỉ một việc dùng một lúc (một hồ sơ/một kết nối); việc khác chạy song song thì không có trình duyệt.
    const browserBusy = [...this.runs.values()].find((r) => r.usesBrowser);
    const chrome = settings.chrome.enabled && this.deps.chrome && !browserBusy ? settings.chrome : null;
    const noBrowser = !settings.chrome.enabled || !this.deps.chrome ? "Điều khiển trình duyệt đang tắt (mục Chrome)."
      : `Trình duyệt đang được việc #${browserBusy?.taskId} dùng. Chờ việc đó xong rồi giao lại phần cần trình duyệt.`;
    const guides = [chrome ? CHROME_GUIDE : "", this.deps.memory ? MEMORY_GUIDE : ""].filter(Boolean).join("\n\n");
    const systemPrompt = buildSystemPrompt(project.instructions, autoRouting, guides);
    const agents = { ...(autoRouting ? ROUTED_AGENTS : {}), ...(this.deps.specialists?.() ?? {}) };
    // Trang đang mở trong trình duyệt của app (lấy từ kết quả công cụ) để áp quyền theo website.
    const browser = newBrowserState();
    const decideTool = (toolName: string, toolInput: unknown) => (isBrowserTool(toolName)
      ? (chrome ? decideBrowser(chrome, toolName, toolInput, browser, level === "read", level === "full") : { decision: "deny" as const, reason: noBrowser })
      : toolName.startsWith(`mcp__${MEMORY_SERVER}__`) ? { decision: "allow" as const, reason: "Bộ nhớ của app" }
      : toolName.startsWith(`mcp__${WIN_SERVER}__`) ? decideWindows(toolName.slice(WIN_SERVER.length + 7), level)
      : toolName.startsWith(`mcp__${OFFICE_SERVER}__`) ? decideOffice(toolName.slice(OFFICE_SERVER.length + 7), toolInput, level, project.path)
      : this.deps.connections?.owns(toolName) ? this.deps.connections.decide(toolName, level)
      : decide(level, toolName, toolInput, project.path, extraRead));
    // Khoá cho nút "Đồng ý luôn" (null = không cho). Trình duyệt: mở trang theo tên miền đích, thao tác theo tên miền trang đang mở.
    const askKey = (toolName: string, toolInput: unknown, d: Decision): string | null => {
      if (d.noAlways) return null;
      if (isBrowserTool(toolName)) {
        const url = (toolInput as { url?: unknown })?.url;
        const host = typeof url === "string" ? hostOf(url) : browser.url ? hostOf(browser.url) : null;
        return host ? `${toolName}@${host}` : null;
      }
      return alwaysKey(toolName, toolInput, project.path);
    };

    const preToolUse: HookCallback = async (hookInput, _id, { signal }) => {
      if (hookInput.hook_event_name !== "PreToolUse") return {};
      const d = decideTool(hookInput.tool_name, hookInput.tool_input);
      let decision = d.decision;
      if (decision === "ask") decision = (await this.askUser(taskId, hookInput.tool_name, hookInput.tool_input, signal, d.reason, askKey(hookInput.tool_name, hookInput.tool_input, d))) ? "allow" : "deny";
      const reason = decision === "deny" && d.decision === "ask" ? "Anh Trung không cho phép thao tác này." : d.reason;
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason,
        ...(decision === "allow" && d.updatedInput ? { updatedInput: d.updatedInput } : {}) } };
    };
    // Lưới an toàn: nếu cấu hình khác vẫn khiến SDK hỏi quyền, cũng hỏi anh Trung.
    const canUseTool: CanUseTool = async (toolName, toolInput, { signal }) => {
      const d = decideTool(toolName, toolInput);
      if (d.decision === "deny") return { behavior: "deny", message: d.reason };
      if (d.decision === "allow" || (await this.askUser(taskId, toolName, toolInput, signal, d.reason, askKey(toolName, toolInput, d)))) return { behavior: "allow", updatedInput: d.updatedInput ?? toolInput };
      return { behavior: "deny", message: "Anh Trung không cho phép thao tác này." };
    };

    const postToolUse: HookCallback = async (hookInput) => {
      if (hookInput.hook_event_name === "PostToolUse") updateBrowserState(browser, hookInput.tool_name, hookInput.tool_response);
      return {};
    };

    // Máy chủ trong tiến trình không dùng chung giữa các lần chạy: tạo mới mỗi lần.
    const localServers = (): Record<string, McpServerConfig> => {
      if (!this.deps.local) return {};
      const win = settings.windowsEnabled ? this.deps.local.windows() : null;
      return { [OFFICE_SERVER]: this.deps.local.office(project.path), ...(win ? { [WIN_SERVER]: win } : {}),
        ...(this.deps.memory ? { [MEMORY_SERVER]: memoryServer(this.deps.memory, project.id) } : {}) };
    };
    const resume = conv.sessionId;
    const makeOptions = (apiKey: string, abort: AbortController, budgetUsd: number): Options => ({
      cwd: project.path,
      model: input.model,
      effort: input.effort,
      permissionMode: "default",
      settingSources: ["user", "project", "local"],
      includePartialMessages: true,
      maxBudgetUsd: Number((budgetUsd * SDK_HEADROOM).toFixed(4)),
      abortController: abort,
      env: agentEnv(apiKey, this.deps.appVersion),
      pathToClaudeCodeExecutable: this.deps.claudePath,
      hooks: { PreToolUse: [{ hooks: [preToolUse], timeout: HOOK_TIMEOUT_S }], PostToolUse: [{ hooks: [postToolUse] }] },
      ...(chrome || Object.keys(connections.servers).length || this.deps.local
        ? { mcpServers: { ...connections.servers, ...localServers(), ...(chrome ? { [CHROME_SERVER]: chromeServerConfig(chrome, this.deps.chrome!) } : {}) } } : {}),
      canUseTool,
      ...(pluginPath ? { plugins: [{ type: "local" as const, path: pluginPath, skipMcpDiscovery: true }] } : {}),
      ...(Object.keys(agents).length ? { agents } : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(resume ? { resume } : {}),
    });

    db.addItem({ taskId, conversationId: conv.id, kind: "user", text: prompt });
    for (const note of connections.notes) db.addItem({ taskId, conversationId: conv.id, kind: "system", text: note });
    const run: Running = { taskId, conversationId: conv.id, allowanceUsd: u.allowedUsd, usesBrowser: !!chrome,
      query: null as unknown as Query, abort: new AbortController(), stopRequested: false, budgetHit: false };
    this.runs.set(taskId, run);
    this.deps.emit({ type: "task-started", taskId, conversationId: conv.id, allowanceUsd: u.allowedUsd });

    const prevTotal = conv.sessionTotalUsd;
    const prevOk = conv.sessionTotalOk;
    const convId = conv.id;
    const done = this.runWithKeys(taskId, convId, keys, u.allowedUsd, (key, spent) => {
      const abort = new AbortController();
      const q = this.deps.query({ prompt, options: makeOptions(key.key, abort, u.allowedUsd - spent) });
      run.query = q;
      run.abort = abort;
      return { q, prevTotal, prevOk };
    }, project.path, run).finally(() => { this.runs.delete(taskId); this.denyPending(taskId); });
    return { ok: true, taskId, conversationId: conv.id, done };
  }

  // Chạy lần lượt theo thứ tự key. Key bị từ chối ngay từ đầu (chưa gọi công cụ nào) thì tự chạy lại bằng key kế tiếp;
  // lỗi key giữa chừng thì dừng, việc sau tự dùng key kế tiếp (tránh làm trùng thao tác đã chạy).
  private async runWithKeys(taskId: number, conversationId: number, keys: KeyEntry[], allowedUsd: number,
    launch: (key: KeyEntry, spent: number) => { q: Query; prevTotal: number; prevOk: boolean }, projectDir: string, run: Running): Promise<TaskRow> {
    const { db, emit } = this.deps;
    const before = this.usageNow();
    const seen = new Map<string, { model: string; u: TokenUsage }>();
    let spent = 0;
    let last: Attempt = { status: "error", message: "", resultCost: null, keyError: null, sideEffects: false, estimate: 0 };
    let anyResultMissing = false;
    const item = (kind: Parameters<HubDb["addItem"]>[0]["kind"], text: string) =>
      emit({ type: "item", item: db.addItem({ taskId, conversationId, kind, text }) });
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const { q, prevTotal, prevOk } = launch(key, spent);
      last = await this.attempt(taskId, conversationId, prevTotal, prevOk, allowedUsd, spent, projectDir, q, seen, key.label, run);
      // Lần chạy không có result (dừng, lỗi, tắt app): tính theo ước tính nhân hệ số an toàn.
      spent += last.resultCost ?? last.estimate * ESTIMATE_SAFETY;
      if (last.resultCost === null) anyResultMissing = true;
      if (!last.keyError) { if (last.status === "done") this.deps.keys.markOk(key.id); break; }
      this.deps.keys.markError(key.id, last.keyError);
      const next = keys[i + 1];
      if (run.stopRequested || run.budgetHit) break;
      if (last.sideEffects) {
        last.message = `${key.label}: ${last.keyError} giữa chừng. Đã dừng để không làm trùng thao tác.${next ? ` Gõ "tiếp tục" để làm tiếp bằng ${next.label}.` : " Không còn key nào khác."}`;
        break;
      }
      if (!next) { last.message = `${key.label}: ${last.keyError}. Đã thử hết ${keys.length} key, không key nào dùng được.`; break; }
      item("system", `${key.label}: ${last.keyError}. Tự chuyển sang ${next.label}.`);
    }
    return this.finish(taskId, conversationId, last, spent, anyResultMissing, seen, before, run);
  }

  private totals(seen: Map<string, { model: string; u: TokenUsage }>): TokenUsage & { cost: number } {
    const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    for (const { model: m, u } of seen.values()) {
      t.input += u.input; t.output += u.output; t.cacheRead += u.cacheRead; t.cacheWrite += u.cacheWrite;
      t.cost += estimateCostUsd(m, u);
    }
    return t;
  }

  private async attempt(taskId: number, conversationId: number, prevSessionTotal: number, prevTotalOk: boolean,
    allowedUsd: number, spentBefore: number, projectDir: string, q: AsyncIterable<SDKMessage>,
    seen: Map<string, { model: string; u: TokenUsage }>, keyLabel: string, run: Running): Promise<Attempt> {
    const { db, emit } = this.deps;
    const estBefore = this.totals(seen).cost;
    const totals = () => this.totals(seen);
    const attemptEstimate = () => totals().cost - estBefore;
    const item = (kind: Parameters<HubDb["addItem"]>[0]["kind"], text: string, extra: { toolName?: string; isError?: boolean } = {}) =>
      emit({ type: "item", item: db.addItem({ taskId, conversationId, kind, text, ...extra }) });

    let status: TaskStatus = "error";
    let message = "";
    let resultCost: number | null = null;
    let keyError: string | null = null;
    let sideEffects = false;
    let streamMsg: { id: string; model: string } | null = null;
    try {
      for await (const m of q) {
        if (m.type === "system" && m.subtype === "init") {
          if (m.apiKeySource !== "ANTHROPIC_API_KEY") {
            message = `Đã dừng: agent không chạy bằng API key (nguồn: ${m.apiKeySource}). Không dùng hạn mức gói Max.`;
            run.abort.abort();
            break;
          }
          db.setSession(conversationId, m.session_id);
          const claudeMd = ["CLAUDE.md", path.join(".claude", "CLAUDE.md")].some((f) => existsSync(path.join(projectDir, f)));
          emit({ type: "session", taskId, sessionId: m.session_id, model: m.model, skills: m.skills ?? [], tools: m.tools, claudeMd, keyLabel });
        } else if (m.type === "stream_event") {
          const ev = m.event;
          // Số token cuối của mỗi lượt gọi nằm ở message_delta; tin nhắn assistant có thể mang số tạm.
          if (ev.type === "message_start") streamMsg = { id: ev.message.id, model: ev.message.model };
          else if (ev.type === "message_delta" && streamMsg) {
            const cur = seen.get(streamMsg.id);
            const out = ev.usage?.output_tokens ?? 0;
            if (cur && out > cur.u.output) cur.u.output = out;
          }
          if (m.parent_tool_use_id === null && ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            emit({ type: "text-delta", taskId, text: ev.delta.text });
          }
        } else if (m.type === "assistant") {
          const msg = m.message;
          const u = msg.usage;
          if (u) {
            const prev = seen.get(msg.id);
            seen.set(msg.id, { model: msg.model, u: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0,
              cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 } });
            const now = seen.get(msg.id)!.u;
            if (prev && prev.u.output > now.output) now.output = prev.u.output;
            const t = totals();
            db.updateTask(taskId, { costUsd: spentBefore + attemptEstimate(), costIsEstimate: true, inputTokens: t.input, outputTokens: t.output,
              cacheReadTokens: t.cacheRead, cacheWriteTokens: t.cacheWrite });
            emit({ type: "usage", taskId, costUsd: spentBefore + attemptEstimate(), costIsEstimate: true, inputTokens: t.input, outputTokens: t.output });
            if (spentBefore + attemptEstimate() >= allowedUsd && !run.budgetHit) {
              run.budgetHit = true;
              item("system", `Chạm hạn mức việc này (${usd4(allowedUsd)}), đang dừng.`);
              void run.query.interrupt().catch(() => undefined);
            }
          }
          const sub = m.parent_tool_use_id !== null;
          if (m.error) {
            const errText = msg.content.map((c) => (c.type === "text" ? c.text : "")).join(" ");
            keyError = keyError ?? keyErrorReason(m.error, errText);
            if (!keyError) item("error", `Lỗi từ API: ${m.error}`);
          }
          for (const b of msg.content) {
            if (b.type === "text" && b.text.trim() && !sub && !keyError) item("assistant", b.text);
            else if (b.type === "tool_use") sideEffects = true, item("tool_use", clip(JSON.stringify(b.input), 2000), { toolName: sub ? `${b.name} (AI phụ)` : b.name });
          }
        } else if (m.type === "user" && Array.isArray(m.message.content)) {
          for (const b of m.message.content) {
            if (b.type !== "tool_result") continue;
            const c = b.content;
            const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x.type === "text" ? x.text : `[${x.type}]`)).join("\n") : "";
            item("tool_result", clip(text, 4000), { isError: !!b.is_error });
          }
        } else if (m.type === "result") {
          // total_cost_usd cộng dồn theo cả phiên khi tiếp tục hội thoại cũ: lấy phần chênh.
          // Nếu việc trước trong hội thoại không kết thúc bằng result (bị dừng, lỗi, tắt app) thì không chắc
          // tổng cũ, nên lấy số lớn hơn giữa phần chênh và ước tính riêng nhân hệ số an toàn (đếm dư, không đếm thiếu).
          const total = m.total_cost_usd;
          // Phiên Claude Code cũ nhập vào (tổng cũ < 0 = không biết): total có thể gồm chi phí lịch sử ngoài app,
          // nên lần đầu tính theo ước tính token nhân hệ số an toàn; các lần sau trừ theo tổng đã lưu.
          const delta = prevSessionTotal < 0 ? 0 : total >= prevSessionTotal ? total - prevSessionTotal : total;
          resultCost = Math.max(delta, attemptEstimate() * (prevTotalOk ? 1 : ESTIMATE_SAFETY));
          db.setSessionTotal(conversationId, total, true);
          // Lỗi như sai API key vẫn trả subtype "success" nhưng is_error = true.
          const failed = m.subtype === "success" && m.is_error;
          status = m.subtype === "success" ? (failed ? "error" : "done") : m.subtype === "error_max_budget_usd" ? "budget" : "error";
          if (failed) { keyError = keyError ?? keyErrorReason(null, m.result); message = `Lỗi: ${clip(m.result, 300)}`; }
          else if (m.subtype === "success") message = `Xong. Chi phí ~${usd4(resultCost)}.`;
          else if (m.subtype === "error_max_budget_usd") message = `Dừng vì chạm hạn mức việc này. Chi phí ~${usd4(resultCost)}.`;
          else message = `Lỗi: ${m.subtype}. Chi phí ~${usd4(resultCost)}.`;
        }
      }
    } catch (err) {
      keyError = keyError ?? keyErrorReason(null, String(err));
      if (!message) message = `Lỗi khi chạy agent: ${clip(String(err), 500)}`;
    }

    return { status, message, resultCost, keyError, sideEffects, estimate: attemptEstimate() };
  }

  private finish(taskId: number, conversationId: number, a: Attempt, spent: number, resultMissing: boolean,
    seen: Map<string, { model: string; u: TokenUsage }>, before: ReturnType<AgentRunner["usageNow"]>, r: Running): TaskRow {
    const { db, emit } = this.deps;
    let { status, message } = a;
    if (r?.budgetHit) { status = "budget"; message = message || "Dừng vì chạm hạn mức việc này."; }
    else if (r?.stopRequested) { status = "stopped"; message = "Đã dừng theo yêu cầu."; }
    const t = this.totals(seen);
    const cost = spent;
    if (resultMissing) db.markSessionTotalUnsure(conversationId);
    db.updateTask(taskId, { status, costUsd: cost, costIsEstimate: a.resultCost === null, inputTokens: t.input, outputTokens: t.output,
      cacheReadTokens: t.cacheRead, cacheWriteTokens: t.cacheWrite, stopReason: message, finished: true });
    emit({ type: "item", item: db.addItem({ taskId, conversationId, kind: status === "done" ? "system" : "error", text: message || "Việc kết thúc không có kết quả." }) });
    const task = db.getTask(taskId)!;
    emit({ type: "task-finished", task, message });

    const after = this.usageNow();
    const dayHit = crossedWarning(before.today, after.today, after.limits.dailyUsd, after.limits.warnPercents);
    const cycleHit = crossedWarning(before.cycle, after.cycle, after.limits.monthlyUsd, after.limits.warnPercents);
    if (dayHit !== null) emit({ type: "budget-warning", scope: "day", percent: dayHit, message: `Đã dùng ${dayHit}% hạn mức ngày (${after.today.toFixed(2)} / ${after.limits.dailyUsd} USD).` });
    if (cycleHit !== null) emit({ type: "budget-warning", scope: "cycle", percent: cycleHit, message: `Đã dùng ${cycleHit}% hạn mức kỳ (${after.cycle.toFixed(2)} / ${after.limits.monthlyUsd} USD).` });
    return task;
  }

  // Gọi thử thật nhỏ bằng Haiku để kiểm tra API key và cách tính phí. Chi phí được ghi như một việc.
  async testKey(tmpDir: string, keyId: string): Promise<{ ok: boolean; message: string; costUsd: number }> {
    const entry = this.deps.keys.get(keyId);
    if (!entry) return { ok: false, message: "Không tìm thấy key.", costUsd: 0 };
    const apiKey = entry.key;
    if (this.runs.size > 0 || this.testing) return { ok: false, message: "Đang có việc chạy, thử lại sau.", costUsd: 0 };
    const u = this.usageNow();
    if (u.blockedReason) return { ok: false, message: u.blockedReason, costUsd: 0 };
    const db = this.deps.db;
    const taskId = db.createTask({ conversationId: null, prompt: `[Kiểm tra API key: ${entry.label}]`, model: "claude-haiku-5-5", effort: "low", permission: "read", allowanceUsd: 0.05 });
    const abort = new AbortController();
    this.testing = true;
    let source = "";
    let cost = 0;
    let ok = false;
    let detail = "";
    try {
      const q = this.deps.query({ prompt: "Chỉ trả lời đúng một chữ: OK", options: {
        cwd: tmpDir, model: "claude-haiku-5-5", effort: "low", settingSources: [], maxTurns: 1, maxBudgetUsd: 0.05,
        persistSession: false, abortController: abort, env: agentEnv(apiKey, this.deps.appVersion),
        pathToClaudeCodeExecutable: this.deps.claudePath, disallowedTools: ["Bash", "Edit", "Write", "WebFetch", "WebSearch"],
      } });
      for await (const m of q) {
        if (m.type === "system" && m.subtype === "init") {
          source = m.apiKeySource;
          if (source !== "ANTHROPIC_API_KEY") { abort.abort(); break; }
        } else if (m.type === "result") {
          cost = m.total_cost_usd;
          ok = m.subtype === "success" && !m.is_error;
          detail = m.subtype === "success" ? m.result : m.subtype;
        }
      }
    } catch (err) {
      detail = clip(String(err), 300);
    } finally {
      this.testing = false;
    }
    db.updateTask(taskId, { status: ok ? "done" : "error", costUsd: cost, costIsEstimate: false, stopReason: detail, finished: true });
    if (source && source !== "ANTHROPIC_API_KEY") return { ok: false, message: `Agent không dùng API key (nguồn: ${source}).`, costUsd: cost };
    if (ok) this.deps.keys.markOk(keyId);
    else this.deps.keys.markError(keyId, keyErrorReason(null, detail) ?? clip(detail || "Lỗi không rõ", 200));
    return ok
      ? { ok: true, message: `Key hoạt động, tính phí theo API key. Trả lời: "${clip(detail, 40)}". Chi phí ~${usd4(cost)}.`, costUsd: cost }
      : { ok: false, message: `Key không dùng được: ${keyErrorReason(null, detail) ?? (detail || "không rõ lỗi")}`, costUsd: cost };
  }
}
