import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { StartTaskInput } from "../shared/contract";
import { Bridge } from "./bridge";
import { bridgeEntry, claudeCodeArgs, installDesktop, mergeConfig } from "./claude-config";
import { HubDb } from "./db";

function post(port: number, p: string, body: unknown, headers: Record<string, string>): Promise<{ status: number; json: unknown }> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, method: "POST", path: p, headers: { "content-type": "application/json", ...headers } }, (res) => {
      let raw = ""; res.on("data", (c) => (raw += c)); res.on("end", () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(raw) }));
    });
    r.on("error", reject); r.end(data);
  });
}

function setup() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cau-noi-"));
  const db = new HubDb(":memory:");
  const proj = db.addProject("Báo cáo mẫu", dir);
  const started: StartTaskInput[] = [];
  const bridge = new Bridge(path.join(dir, "bridge.json"), {
    db, enqueue: () => ({ id: 1 }), stop: () => undefined, running: () => [], pendingAsk: () => false,
    start: async (i) => {
      started.push(i);
      const conv = db.createConversation(i.projectId, "từ Claude");
      const taskId = db.createTask({ conversationId: conv.id, prompt: i.prompt, model: i.model, effort: i.effort, permission: i.permission, allowanceUsd: 1 });
      db.addItem({ taskId, conversationId: conv.id, kind: "tool_use", toolName: "Write", text: JSON.stringify({ file_path: "D:/Bao cao/ket-qua.xlsx" }) });
      db.addItem({ taskId, conversationId: conv.id, kind: "assistant", text: "Đã làm xong báo cáo mẫu." });
      db.updateTask(taskId, { status: "done", costUsd: 0.0123, finished: true });
      return { ok: true, taskId, conversationId: conv.id };
    },
  });
  return { dir, db, proj, bridge, started };
}

test("cổng nối app Claude: chỉ nhận đúng mã, không nhận trang web; giao việc và lấy kết quả", async () => {
  const t = setup();
  const info = await t.bridge.setEnabled(true);
  const auth = { authorization: `Bearer ${info.token}`, host: `127.0.0.1:${info.port}` };
  assert.equal((await post(info.port, "/api/projects", {}, { host: `127.0.0.1:${info.port}` })).status, 403);              // thiếu mã
  assert.equal((await post(info.port, "/api/projects", {}, { ...auth, origin: "https://trang-la.vn" })).status, 403);   // trang web
  assert.equal((await post(info.port, "/api/projects", {}, { ...auth, host: `trang-la.vn:${info.port}` })).status, 403); // đổi tên miền
  const ps = await post(info.port, "/api/projects", {}, auth);
  assert.deepEqual((ps.json as { name: string }[]).map((p) => p.name), ["Báo cáo mẫu"]);
  const s = (await post(info.port, "/api/start", { project: "báo cáo", prompt: "Làm báo cáo ngày" }, auth)).json as { taskId: number };
  assert.equal(t.started[0].permission, t.db.getSettings().defaultPermission);     // theo mức quyền mặc định trong Cài đặt
  const r = (await post(info.port, "/api/result", { taskId: s.taskId, wait: 1 }, auth)).json as { finished: boolean; answer: string; files: string[]; costUsd: number };
  assert.equal(r.finished, true);
  assert.equal(r.answer, "Đã làm xong báo cáo mẫu.");
  assert.deepEqual(r.files, ["D:/Bao cao/ket-qua.xlsx"]);
  const none = (await post(info.port, "/api/start", { project: "không có", prompt: "x" }, auth)).json as { error: string };
  assert.match(none.error, /Không thấy dự án/);
  // Tắt rồi bật lại: giữ cổng và mã (cấu hình bên app Claude không phải sửa).
  await t.bridge.setEnabled(false);
  const again = await t.bridge.setEnabled(true);
  assert.equal(again.port, info.port);
  assert.equal(again.token, info.token);
  t.bridge.close();
});

test("công cụ MCP trung-kien-hub (tiến trình riêng) nói chuyện với app Claude và gọi về Hub", async () => {
  const t = setup();
  await t.bridge.setEnabled(true);
  const p = spawn(process.execPath, [path.join(__dirname, "bridge-mcp.js"), "--data", t.dir], { stdio: ["pipe", "pipe", "inherit"] });
  const lines: Record<string, unknown>[] = [];
  let buf = "";
  p.stdout.on("data", (c: Buffer) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const ask = async (id: number, method: string, params: unknown) => {
    p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    for (let k = 0; k < 100 && !lines.some((l) => l.id === id); k++) await new Promise((r) => setTimeout(r, 50));
    return lines.find((l) => l.id === id) as { result: { tools?: { name: string }[]; content?: { text: string }[]; isError?: boolean } };
  };
  const init = await ask(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "thu", version: "1" } });
  assert.ok(init.result);
  const tools = await ask(2, "tools/list", {});
  assert.deepEqual(tools.result.tools!.map((x) => x.name), ["hub_du_an", "hub_giao_viec", "hub_ket_qua", "hub_viec_dang_chay", "hub_dung"]);
  const call = await ask(3, "tools/call", { name: "hub_du_an", arguments: {} });
  assert.match(call.result.content![0].text, /Báo cáo mẫu/);
  // Hub tắt kết nối: báo rõ cách bật.
  await t.bridge.setEnabled(false);
  const off = await ask(4, "tools/call", { name: "hub_du_an", arguments: {} });
  assert.equal(off.result.isError, true);
  assert.match(off.result.content![0].text, /đang tắt/);
  p.kill();
  t.bridge.close();
});

test("khai báo vào app Claude: gộp, giữ máy chủ khác, sao lưu; tệp hỏng thì không ghi", () => {
  const e = bridgeEntry("C:/App/Hub.exe", "C:/App/resources/app.asar.unpacked/dist/main/bridge-mcp.js", "C:/Users/a/AppData/Roaming/hub");
  const merged = JSON.parse(mergeConfig(JSON.stringify({ mcpServers: { khac: { command: "x" } }, globalShortcut: "Ctrl+Space" }), e));
  assert.deepEqual(Object.keys(merged.mcpServers), ["khac", "trung-kien-hub"]);
  assert.equal(merged.globalShortcut, "Ctrl+Space");
  assert.throws(() => mergeConfig("{ hỏng", e));
  const dir = mkdtempSync(path.join(os.tmpdir(), "claude-cfg-"));
  mkdirSync(path.join(dir, "Claude"));
  const f = path.join(dir, "Claude", "claude_desktop_config.json");
  writeFileSync(f, "{ hỏng");
  assert.equal(installDesktop(e, [f]).ok, false);
  assert.equal(readFileSync(f, "utf8"), "{ hỏng");
  writeFileSync(f, JSON.stringify({ mcpServers: {} }));
  assert.equal(installDesktop(e, [f]).ok, true);
  assert.equal(JSON.parse(readFileSync(f, "utf8")).mcpServers["trung-kien-hub"].env.ELECTRON_RUN_AS_NODE, "1");
  assert.deepEqual(claudeCodeArgs(e).slice(0, 5), ["mcp", "add-json", "--scope", "user", "trung-kien-hub"]);
});
