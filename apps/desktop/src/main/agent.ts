import { existsSync } from "node:fs";
import path from "node:path";
import type { CanUseTool, HookCallback, Options, Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { HubEvent, ModelId, StartTaskInput, TaskRow, TaskStatus } from "../shared/contract";
import { allowance, crossedWarning, cycleStart, dayStart, SDK_HEADROOM } from "./budget";
import type { HubDb } from "./db";
import { decide, summarizeInput } from "./policy";
import { estimateCostUsd, type TokenUsage } from "./pricing";
import { checkSettings, settingsFiles } from "./settings-guard";

export type QueryFn = (args: { prompt: string; options?: Options }) => Query;

export interface AgentDeps {
  db: HubDb;
  query: QueryFn;
  getApiKey: () => string | null;
  emit: (e: HubEvent) => void;
  claudePath: string;
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

interface Running {
  taskId: number;
  query: Query;
  abort: AbortController;
  stopRequested: boolean;
  budgetHit: boolean;
}

export class AgentRunner {
  private running: Running | null = null;
  private testing = false;
  private pending = new Map<string, (allow: boolean) => void>();
  private seq = 0;

  constructor(private deps: AgentDeps) {}

  runningTaskId(): number | null { return this.running?.taskId ?? null; }
  private busy(): boolean { return this.running !== null || this.testing; }

  usageNow() {
    const now = (this.deps.now ?? (() => new Date()))();
    const limits = this.deps.db.getSettings().limits;
    const cs = cycleStart(now, limits.cycleStartDay);
    const today = this.deps.db.spentSince(dayStart(now));
    const cycle = this.deps.db.spentSince(cs);
    return { limits, today, cycle, cycleStart: cs, ...allowance(limits, today, cycle) };
  }

  answerPermission(requestId: string, allow: boolean) {
    this.pending.get(requestId)?.(allow);
    this.pending.delete(requestId);
  }

  async stop(taskId: number) {
    const r = this.running;
    if (!r || r.taskId !== taskId) return;
    r.stopRequested = true;
    this.denyAllPending();
    try { await r.query.interrupt(); } catch { /* đã kết thúc */ }
    // Không dừng được êm trong 5 giây thì cắt hẳn tiến trình.
    setTimeout(() => { if (this.running?.taskId === taskId) r.abort.abort(); }, 5000);
  }

  private denyAllPending() {
    for (const resolve of this.pending.values()) resolve(false);
    this.pending.clear();
  }

  private askUser(taskId: number, toolName: string, input: unknown, signal?: AbortSignal): Promise<boolean> {
    const requestId = `p${++this.seq}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.answerPermission(requestId, false), ASK_TIMEOUT_MS);
      this.pending.set(requestId, (allow) => { clearTimeout(timer); resolve(allow); });
      signal?.addEventListener("abort", () => this.answerPermission(requestId, false), { once: true });
      this.deps.emit({ type: "permission-request", requestId, taskId, toolName, summary: summarizeInput(toolName, input) });
    });
  }

  // Bắt đầu một việc. Trả về ngay sau khi tạo việc; tiến trình chạy tiếp ở nền.
  async start(input: StartTaskInput): Promise<{ ok: boolean; taskId?: number; conversationId?: number; message?: string; done?: Promise<TaskRow> }> {
    const { db } = this.deps;
    if (this.busy()) return { ok: false, message: "Đang có một việc chạy. Mốc 1 chỉ chạy một việc một lúc để không vượt hạn mức." };
    const apiKey = this.deps.getApiKey();
    if (!apiKey) return { ok: false, message: "Chưa có API key. Vào Cài đặt để nhập." };
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
    const abort = new AbortController();
    const level = input.permission;

    const preToolUse: HookCallback = async (hookInput, _id, { signal }) => {
      if (hookInput.hook_event_name !== "PreToolUse") return {};
      const d = decide(level, hookInput.tool_name, hookInput.tool_input, project.path);
      let decision = d.decision;
      if (decision === "ask") decision = (await this.askUser(taskId, hookInput.tool_name, hookInput.tool_input, signal)) ? "allow" : "deny";
      const reason = decision === "deny" && d.decision === "ask" ? "Anh Trung không cho phép thao tác này." : d.reason;
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason,
        ...(decision === "allow" && d.updatedInput ? { updatedInput: d.updatedInput } : {}) } };
    };
    // Lưới an toàn: nếu cấu hình khác vẫn khiến SDK hỏi quyền, cũng hỏi anh Trung.
    const canUseTool: CanUseTool = async (toolName, toolInput, { signal }) => {
      const d = decide(level, toolName, toolInput, project.path);
      if (d.decision === "deny") return { behavior: "deny", message: d.reason };
      if (d.decision === "allow" || (await this.askUser(taskId, toolName, toolInput, signal))) return { behavior: "allow", updatedInput: d.updatedInput ?? toolInput };
      return { behavior: "deny", message: "Anh Trung không cho phép thao tác này." };
    };

    const options: Options = {
      cwd: project.path,
      model: input.model,
      effort: input.effort,
      permissionMode: "default",
      settingSources: ["user", "project", "local"],
      includePartialMessages: true,
      maxBudgetUsd: Number((u.allowedUsd * SDK_HEADROOM).toFixed(4)),
      abortController: abort,
      env: agentEnv(apiKey, this.deps.appVersion),
      pathToClaudeCodeExecutable: this.deps.claudePath,
      hooks: { PreToolUse: [{ hooks: [preToolUse], timeout: HOOK_TIMEOUT_S }] },
      canUseTool,
      ...(conv.sessionId ? { resume: conv.sessionId } : {}),
    };

    db.addItem({ taskId, conversationId: conv.id, kind: "user", text: prompt });
    const q = this.deps.query({ prompt, options });
    this.running = { taskId, query: q, abort, stopRequested: false, budgetHit: false };
    this.deps.emit({ type: "task-started", taskId, conversationId: conv.id, allowanceUsd: u.allowedUsd });

    const done = this.consume(taskId, conv.id, conv.sessionTotalUsd, conv.sessionTotalOk, input.model, u.allowedUsd, project.path, q)
      .finally(() => { this.running = null; this.denyAllPending(); });
    return { ok: true, taskId, conversationId: conv.id, done };
  }

  private async consume(taskId: number, conversationId: number, prevSessionTotal: number, prevTotalOk: boolean, model: ModelId,
    allowedUsd: number, projectDir: string, q: AsyncIterable<SDKMessage>): Promise<TaskRow> {
    const { db, emit } = this.deps;
    const before = this.usageNow();
    const seen = new Map<string, { model: string; u: TokenUsage }>();
    const totals = (): TokenUsage & { cost: number } => {
      const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      for (const { model: m, u } of seen.values()) {
        t.input += u.input; t.output += u.output; t.cacheRead += u.cacheRead; t.cacheWrite += u.cacheWrite;
        t.cost += estimateCostUsd(m, u);
      }
      return t;
    };
    const item = (kind: Parameters<HubDb["addItem"]>[0]["kind"], text: string, extra: { toolName?: string; isError?: boolean } = {}) =>
      emit({ type: "item", item: db.addItem({ taskId, conversationId, kind, text, ...extra }) });

    let status: TaskStatus = "error";
    let message = "";
    let resultCost: number | null = null;
    let streamMsg: { id: string; model: string } | null = null;
    try {
      for await (const m of q) {
        if (m.type === "system" && m.subtype === "init") {
          if (m.apiKeySource !== "ANTHROPIC_API_KEY") {
            message = `Đã dừng: agent không chạy bằng API key (nguồn: ${m.apiKeySource}). Không dùng hạn mức gói Max.`;
            this.running!.abort.abort();
            break;
          }
          db.setSession(conversationId, m.session_id);
          const claudeMd = ["CLAUDE.md", path.join(".claude", "CLAUDE.md")].some((f) => existsSync(path.join(projectDir, f)));
          emit({ type: "session", taskId, sessionId: m.session_id, model: m.model, skills: m.skills ?? [], tools: m.tools, claudeMd });
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
            db.updateTask(taskId, { costUsd: t.cost, costIsEstimate: true, inputTokens: t.input, outputTokens: t.output,
              cacheReadTokens: t.cacheRead, cacheWriteTokens: t.cacheWrite });
            emit({ type: "usage", taskId, costUsd: t.cost, costIsEstimate: true, inputTokens: t.input, outputTokens: t.output });
            if (t.cost >= allowedUsd && !this.running!.budgetHit) {
              this.running!.budgetHit = true;
              item("system", `Chạm hạn mức việc này (${usd4(allowedUsd)}), đang dừng.`);
              void this.running!.query.interrupt().catch(() => undefined);
            }
          }
          const sub = m.parent_tool_use_id !== null;
          if (m.error) item("error", `Lỗi từ API: ${m.error}`);
          for (const b of msg.content) {
            if (b.type === "text" && b.text.trim() && !sub) item("assistant", b.text);
            else if (b.type === "tool_use") item("tool_use", clip(JSON.stringify(b.input), 2000), { toolName: sub ? `${b.name} (AI phụ)` : b.name });
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
          const delta = total >= prevSessionTotal ? total - prevSessionTotal : total;
          resultCost = Math.max(delta, totals().cost * (prevTotalOk ? 1 : ESTIMATE_SAFETY));
          db.setSessionTotal(conversationId, total, true);
          // Lỗi như sai API key vẫn trả subtype "success" nhưng is_error = true.
          const failed = m.subtype === "success" && m.is_error;
          status = m.subtype === "success" ? (failed ? "error" : "done") : m.subtype === "error_max_budget_usd" ? "budget" : "error";
          if (failed) message = `Lỗi: ${clip(m.result, 300)}`;
          else if (m.subtype === "success") message = `Xong. Chi phí ~${usd4(resultCost)}.`;
          else if (m.subtype === "error_max_budget_usd") message = `Dừng vì chạm hạn mức việc này. Chi phí ~${usd4(resultCost)}.`;
          else message = `Lỗi: ${m.subtype}. Chi phí ~${usd4(resultCost)}.`;
        }
      }
    } catch (err) {
      if (!message) message = `Lỗi khi chạy agent: ${clip(String(err), 500)}`;
    }

    const r = this.running;
    if (r?.budgetHit) { status = "budget"; message = message || "Dừng vì chạm hạn mức việc này."; }
    else if (r?.stopRequested) { status = "stopped"; message = "Đã dừng theo yêu cầu."; }
    const t = totals();
    const cost = resultCost ?? t.cost * ESTIMATE_SAFETY;
    if (resultCost === null) db.markSessionTotalUnsure(conversationId);
    db.updateTask(taskId, { status, costUsd: cost, costIsEstimate: resultCost === null, inputTokens: t.input, outputTokens: t.output,
      cacheReadTokens: t.cacheRead, cacheWriteTokens: t.cacheWrite, stopReason: message, finished: true });
    item(status === "done" ? "system" : "error", message || "Việc kết thúc không có kết quả.");
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
  async testKey(tmpDir: string): Promise<{ ok: boolean; message: string; costUsd: number }> {
    const apiKey = this.deps.getApiKey();
    if (!apiKey) return { ok: false, message: "Chưa có API key.", costUsd: 0 };
    if (this.busy()) return { ok: false, message: "Đang có việc chạy, thử lại sau.", costUsd: 0 };
    const u = this.usageNow();
    if (u.blockedReason) return { ok: false, message: u.blockedReason, costUsd: 0 };
    const db = this.deps.db;
    const taskId = db.createTask({ conversationId: null, prompt: "[Kiểm tra API key]", model: "claude-haiku-5-5", effort: "low", permission: "read", allowanceUsd: 0.05 });
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
    return ok
      ? { ok: true, message: `Key hoạt động, tính phí theo API key. Trả lời: "${clip(detail, 40)}". Chi phí ~${usd4(cost)}.`, costUsd: cost }
      : { ok: false, message: `Key không dùng được: ${detail || "không rõ lỗi"}`, costUsd: cost };
  }
}
