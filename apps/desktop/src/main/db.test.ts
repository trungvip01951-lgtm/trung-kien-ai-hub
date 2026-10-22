import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { HubDb } from "./db";

test("lưu, mở lại không mất dữ liệu, tìm kiếm tiếng Việt", () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "hubdb-")), "hub.db");
  let db = new HubDb(file);
  const p = db.addProject("Dự án mẫu", "/tmp/du-an-mau");
  assert.equal(db.addProject("trùng", "/tmp/du-an-mau").id, p.id);
  const c = db.createConversation(p.id, "Hỏi về máy bơm");
  const t = db.createTask({ conversationId: c.id, prompt: "x", model: "claude-haiku-5-5", effort: "low", permission: "read", allowanceUsd: 1 });
  db.addItem({ taskId: t, conversationId: c.id, kind: "assistant", text: "Máy bơm chìm nước thải Khách Mẫu A" });
  db.updateTask(t, { costUsd: 0.25, status: "done", finished: true });
  db.close();

  db = new HubDb(file);
  assert.equal(db.listProjects().length, 1);
  assert.equal(db.conversationItems(c.id).length, 1);
  assert.equal(db.search("bơm chìm").length, 1);
  assert.equal(db.search('"lỗi cú pháp (').length, 0);
  assert.equal(db.spentSince(new Date(Date.now() - 60_000)), 0.25);
  assert.equal(db.listConversations(p.id)[0].costUsd, 0.25);
  assert.ok(db.integrityOk());
});

test("mở tệp dữ liệu của bản cũ: tự thêm cột mới, không mất dữ liệu", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "hubdb-cu-")), "hub.db");
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
    CREATE TABLE conversations (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, title TEXT NOT NULL, session_id TEXT,
      session_total_usd REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO projects VALUES (1, 'cu', '/cu', '2026-10-22');
    INSERT INTO conversations VALUES (1, 1, 'hội thoại cũ', 's1', 0.5, '2026-10-22', '2026-10-22');`);
  old.close();
  const db = new HubDb(file);
  const c = db.getConversation(1)!;
  assert.equal(c.title, "hội thoại cũ");
  assert.equal(c.sessionTotalOk, true);
  assert.equal(db.markInterrupted(), 0);
  db.close();
  new HubDb(file).close(); // mở lần hai không chạy lại bước nâng cấp
});

test("việc đang chạy khi app tắt đột ngột được đánh dấu bị ngắt", () => {
  const db = new HubDb(":memory:");
  const p = db.addProject("a", "/a");
  const c = db.createConversation(p.id, "t");
  const t = db.createTask({ conversationId: c.id, prompt: "x", model: "claude-haiku-5-5", effort: "low", permission: "read", allowanceUsd: 1 });
  assert.equal(db.markInterrupted(), 1);
  assert.equal(db.getTask(t)!.status, "interrupted");
});

test("nâng cấp tệp dữ liệu bản 0.2.x: thêm hướng dẫn dự án, kiểm kê, nhập phiên cũ", () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "hubdb-")), "hub.db");
  let db = new HubDb(file);
  const p = db.addProject("Mẫu", "/tmp/mau-nang-cap");
  assert.equal(db.getProject(p.id)!.instructions, "");
  db.saveProjectInstructions(p.id, "Quy tắc mẫu");
  const c = db.importSession(p.id, "phien-cu-1", "[Phiên cũ] mẫu");
  assert.equal(db.importSession(p.id, "phien-cu-1", "x").id, c.id);
  const conv = db.getConversation(c.id)!;
  assert.equal(conv.sessionId, "phien-cu-1");
  assert.equal(conv.sessionTotalOk, false);
  assert.equal(conv.sessionTotalUsd, -1);
  db.close();
  db = new HubDb(file);
  assert.equal(db.getProject(p.id)!.instructions, "Quy tắc mẫu");
  assert.ok(db.sessionIdsOfProject(p.id).has("phien-cu-1"));
  db.close();
});
