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

test("việc đang chạy khi app tắt đột ngột được đánh dấu bị ngắt", () => {
  const db = new HubDb(":memory:");
  const p = db.addProject("a", "/a");
  const c = db.createConversation(p.id, "t");
  const t = db.createTask({ conversationId: c.id, prompt: "x", model: "claude-haiku-5-5", effort: "low", permission: "read", allowanceUsd: 1 });
  assert.equal(db.markInterrupted(), 1);
  assert.equal(db.getTask(t)!.status, "interrupted");
});
