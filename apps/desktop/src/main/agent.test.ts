import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Options, Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { HubEvent } from "../shared/contract";
import { agentEnv, AgentRunner } from "./agent";
import { HubDb } from "./db";

// Agent giả: phát lại các tin nhắn kịch bản, không gọi API thật.
type Script = (opts: Options, ctl: { interrupted: () => boolean }) => AsyncGenerator<SDKMessage>;

function setup(script: Script, apiKey: string | null = "sk-ant-api03-gia") {
  const dir = mkdtempSync(path.join(os.tmpdir(), "du-an-"));
  const db = new HubDb(":memory:");
  const project = db.addProject("Mẫu", dir);
  const events: HubEvent[] = [];
  const calls: Options[] = [];
  let interrupted = false;
  const runner = new AgentRunner({
    db, emit: (e) => events.push(e), getApiKey: () => apiKey, claudePath: "/khong/can", appVersion: "0.0.0-test",
    query: ({ options }) => {
      calls.push(options!);
      const gen = script(options!, { interrupted: () => interrupted });
      return Object.assign(gen, { interrupt: async () => { interrupted = true; return undefined; } }) as unknown as Query;
    },
  });
  return { db, project, events, calls, runner };
}

const init = (apiKeySource = "ANTHROPIC_API_KEY") =>
  ({ type: "system", subtype: "init", apiKeySource, session_id: "phien-1", model: "claude-haiku-5-5", tools: ["Read"], skills: ["seo"] }) as unknown as SDKMessage;
const assistant = (id: string, content: unknown[], usage = { input_tokens: 1000, output_tokens: 100 }) =>
  ({ type: "assistant", parent_tool_use_id: null, session_id: "phien-1", message: { id, model: "claude-haiku-5-5", content, usage } }) as unknown as SDKMessage;
const result = (total: number, subtype = "success") =>
  ({ type: "result", subtype, total_cost_usd: total, result: "OK", session_id: "phien-1" }) as unknown as SDKMessage;

const input = (projectId: number, conversationId: number | null = null) =>
  ({ conversationId, projectId, prompt: "Kiểm tra web mẫu", model: "claude-haiku-5-5" as const, effort: "low" as const, permission: "write" as const });

test("chạy trọn một việc: lưu phiên, lịch sử, chi phí, dùng đúng API key", async () => {
  const t = setup(async function* () {
    yield init();
    yield { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", delta: { type: "text_delta", text: "Xin" } } } as unknown as SDKMessage;
    yield assistant("m1", [{ type: "text", text: "Xin chào" }, { type: "tool_use", name: "Read", input: { file_path: "a" } }]);
    yield { type: "user", message: { content: [{ type: "tool_result", content: "nội dung a", is_error: false }] } } as unknown as SDKMessage;
    yield result(0.012);
  });
  const r = await t.runner.start(input(t.project.id));
  assert.ok(r.ok);
  const task = await r.done!;
  assert.equal(task.status, "done");
  assert.equal(task.costUsd, 0.012);
  assert.equal(task.costIsEstimate, false);
  assert.equal(t.db.getConversation(r.conversationId!)!.sessionId, "phien-1");
  assert.deepEqual(t.db.conversationItems(r.conversationId!).map((i) => i.kind), ["user", "assistant", "tool_use", "tool_result", "system"]);
  assert.equal(t.calls[0].env!.ANTHROPIC_API_KEY, "sk-ant-api03-gia");
  assert.equal(t.calls[0].maxBudgetUsd, 4.25); // 5 USD x 85%
  assert.ok(t.events.some((e) => e.type === "text-delta"));
  assert.equal(t.runner.runningTaskId(), null);
});

test("không chạy bằng API key thì dừng ngay", async () => {
  const t = setup(async function* () { yield init("none"); yield result(0.5); });
  const r = await t.runner.start(input(t.project.id));
  const task = await r.done!;
  assert.equal(task.status, "error");
  assert.ok(task.stopReason!.includes("không chạy bằng API key"));
});

test("chạm hạn mức việc: tự ngắt, ghi trạng thái hạn mức", async () => {
  const t = setup(async function* (_o, ctl) {
    yield init();
    // 10 triệu token vào Haiku = 1 USD > hạn mức việc đặt 0,5 USD
    yield assistant("m1", [{ type: "text", text: "đang làm" }], { input_tokens: 10_000_000, output_tokens: 0 });
    if (!ctl.interrupted()) yield assistant("m2", [{ type: "text", text: "lẽ ra không tới đây" }]);
  });
  const s = t.db.getSettings();
  t.db.saveSettings({ ...s, limits: { ...s.limits, perTaskUsd: 0.5 } });
  const r = await t.runner.start(input(t.project.id));
  const task = await r.done!;
  assert.equal(task.status, "budget");
  assert.ok(task.costUsd >= 0.5);
  assert.ok(!t.db.conversationItems(r.conversationId!).some((i) => i.text.includes("lẽ ra")));
});

test("hết hạn mức ngày thì không cho bắt đầu việc mới", async () => {
  const t = setup(async function* () { yield init(); yield result(9.99); });
  const first = await t.runner.start(input(t.project.id));
  await first.done;
  const second = await t.runner.start(input(t.project.id));
  assert.equal(second.ok, false);
  assert.ok(second.message!.includes("hạn mức ngày"));
});

test("tiếp tục hội thoại: truyền resume, chỉ tính phần chi phí mới", async () => {
  let total = 0.1;
  const t = setup(async function* () { yield init(); yield result(total); });
  const a = await t.runner.start(input(t.project.id));
  await a.done;
  total = 0.25;
  const b = await t.runner.start(input(t.project.id, a.conversationId!));
  const task = await b.done!;
  assert.equal(t.calls[1].resume, "phien-1");
  assert.ok(Math.abs(task.costUsd - 0.15) < 1e-9);
});

test("lệnh ngoài phải hỏi: anh Trung từ chối thì công cụ bị chặn", async () => {
  let decision: unknown;
  const t = setup(async function* (opts) {
    yield init();
    const hook = opts.hooks!.PreToolUse![0].hooks[0];
    decision = await hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "del *.*" }, tool_use_id: "x" } as never,
      "x", { signal: new AbortController().signal });
    yield result(0.01);
  });
  const r = await t.runner.start(input(t.project.id));
  await new Promise((res) => setImmediate(res));
  const req = t.events.find((e) => e.type === "permission-request");
  assert.ok(req && req.type === "permission-request" && req.summary === "del *.*");
  t.runner.answerPermission(req.requestId, false);
  await r.done;
  assert.equal((decision as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
});

test("môi trường agent bỏ đăng nhập gói Max và nhà cung cấp khác", () => {
  process.env.CLAUDE_CODE_OAUTH_TOKEN = "gia";
  process.env.ANTHROPIC_BASE_URL = "https://gia.example";
  process.env.CLAUDE_CODE_REMOTE = "true";
  process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE = "/gia";
  const env = agentEnv("sk-ant-api03-gia", "1");
  assert.equal(env.CLAUDE_CODE_REMOTE, undefined);
  assert.equal(env.CLAUDE_SESSION_INGRESS_TOKEN_FILE, undefined);
  assert.ok(env.PATH);
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  assert.equal(env.ANTHROPIC_BASE_URL, undefined);
  assert.equal(env.ANTHROPIC_API_KEY, "sk-ant-api03-gia");
});

test("key sai: SDK trả success kèm is_error thì ghi là lỗi", async () => {
  const t = setup(async function* () {
    yield init();
    yield { type: "result", subtype: "success", is_error: true, result: "Invalid API key", total_cost_usd: 0 } as unknown as SDKMessage;
  });
  const r = await t.runner.start(input(t.project.id));
  const task = await r.done!;
  assert.equal(task.status, "error");
  assert.ok(task.stopReason!.includes("Invalid API key"));
});

test("chưa có API key thì báo, không tạo việc", async () => {
  const t = setup(async function* () { yield result(0); }, null);
  const r = await t.runner.start(input(t.project.id));
  assert.equal(r.ok, false);
  assert.equal(t.db.listTasks(10).length, 0);
});
