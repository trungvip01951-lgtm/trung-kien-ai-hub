import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { StartTaskInput } from "../shared/contract";
import { Backups } from "./backup";
import { HubDb } from "./db";
import { Jobs } from "./jobs";
import { decideOffice, decideWindows } from "./local-tools";
import { nextRun, validateRule } from "./schedule";

const rule = (o: Partial<{ kind: "daily" | "weekly" | "hourly"; time: string; weekday: number; everyHours: number }>) =>
  ({ kind: "daily" as const, time: "08:00", weekday: 1, everyHours: 6, ...o });

test("lịch: tính lần chạy kế tiếp theo ngày, tuần, giờ", () => {
  const at = new Date(2026, 9, 22, 9, 0);                         // thứ năm 22/10/2026 9:00
  assert.equal(nextRun(rule({ time: "08:00" }), at).getTime(), new Date(2026, 9, 23, 8, 0).getTime());
  assert.equal(nextRun(rule({ time: "21:30" }), at).getTime(), new Date(2026, 9, 22, 21, 30).getTime());
  assert.equal(nextRun(rule({ kind: "weekly", weekday: 1, time: "08:00" }), at).getTime(), new Date(2026, 9, 26, 8, 0).getTime());
  assert.equal(nextRun(rule({ kind: "weekly", weekday: 4, time: "08:00" }), at).getTime(), new Date(2026, 9, 29, 8, 0).getTime());
  assert.equal(nextRun(rule({ kind: "hourly", everyHours: 6 }), at).getTime(), at.getTime() + 6 * 3600e3);
  assert.equal(validateRule(rule({ time: "8h" })), "Giờ chạy phải dạng HH:MM (ví dụ 08:30).");
  assert.equal(validateRule(rule({})), null);
});

test("hàng đợi: bận thì chờ, rảnh thì chạy theo thứ tự, lỗi khác thì báo; lịch lỡ nhiều lần chỉ chạy bù một lần", async () => {
  const db = new HubDb(":memory:");
  const p = db.addProject("Mẫu", "/tmp/mau");
  let busy = true;
  const started: string[] = [];
  const events: string[] = [];
  const runner = { start: async (i: StartTaskInput) => {
    if (i.prompt === "lỗi") return { ok: false, message: "Hết hạn mức ngày" };
    if (busy) return { ok: false, busy: true, message: "Đủ 3 việc" };
    started.push(i.prompt);
    return { ok: true, taskId: started.length, done: Promise.resolve() as never };
  } };
  let now = new Date(2026, 9, 22, 9, 0);
  const jobs = new Jobs(db, runner, (e) => events.push(e.type), () => now);
  const input = (prompt: string): StartTaskInput => ({ conversationId: null, projectId: p.id, prompt, model: "claude-haiku-5-5", effort: "low", permission: "read" });
  jobs.enqueue(input("việc 1"));
  jobs.enqueue(input("lỗi"));
  jobs.enqueue(input("việc 2"));
  await jobs.pump();
  assert.deepEqual(started, []);
  assert.equal(db.waitingQueue().length, 2);
  assert.deepEqual(events, ["queue-failed"]);
  busy = false;
  await jobs.pump();
  assert.deepEqual(started, ["việc 1", "việc 2"]);
  assert.equal(db.waitingQueue().length, 0);

  // Lịch hằng ngày 8:00, app tắt 3 ngày: mở lại chỉ chạy một lần, lần tới là 8:00 hôm sau.
  const s = jobs.saveSchedule({ name: "Báo cáo sáng", projectId: p.id, prompt: "báo cáo", model: "claude-haiku-5-5", effort: "low", permission: "read",
    enabled: true, kind: "daily", time: "08:00", weekday: 1, everyHours: 6 });
  now = new Date(2026, 9, 26, 10, 0);
  jobs.tick();
  jobs.tick();
  await jobs.pump();
  assert.deepEqual(started.filter((x) => x === "báo cáo"), ["báo cáo"]);
  assert.equal(db.getSchedule(s.id)!.nextRunAt, new Date(2026, 9, 27, 8, 0).toISOString());
});

test("sao lưu: tạo, liệt kê, khôi phục khi khởi động (cất bản hiện tại trước), xuất/nhập", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sao-luu-"));
  const dbFile = path.join(dir, "hub.db");
  let db = new HubDb(dbFile);
  db.addProject("Dự án A", "/tmp/a");
  mkdirSync(path.join(dir, "skills", "plugin"), { recursive: true });
  writeFileSync(path.join(dir, "skills", "plugin", "x.txt"), "bản 1");
  let t = 0;
  const b = new Backups(dir, (f) => db.snapshot(f), "0.5.0", () => new Date(Date.UTC(2026, 9, 22, 15, 0, t++)));
  const first = b.create("manual");
  assert.ok(first.bytes > 0);
  db.addProject("Dự án B", "/tmp/b");
  writeFileSync(path.join(dir, "skills", "plugin", "x.txt"), "bản 2");
  assert.equal(b.autoIfDue()?.reason, "auto");
  assert.equal(b.autoIfDue(), null);                                    // trong ngày không tự sao lưu lại
  assert.ok(b.requestRestore(first.id).ok);
  db.close();
  assert.equal(b.applyPendingRestore(), first.id);
  db = new HubDb(dbFile);
  assert.deepEqual(db.listProjects().map((p) => p.name), ["Dự án A"]);
  assert.equal(readFileSync(path.join(dir, "skills", "plugin", "x.txt"), "utf8"), "bản 1");
  assert.ok(b.list().some((x) => x.reason === "before-restore"));
  assert.equal(b.applyPendingRestore(), null);                           // chỉ khôi phục một lần
  const out = b.exportTo(first.id, mkdtempSync(path.join(os.tmpdir(), "xuat-")));
  assert.ok(existsSync(path.join(out, "manifest.json")));
  assert.equal(b.importFrom(out).reason, "import");
  assert.throws(() => b.importFrom(os.tmpdir()), /không phải bản sao lưu/);
  db.close();
});

test("quyền công cụ Windows và tài liệu", () => {
  assert.equal(decideWindows("read_window", "read").decision, "allow");
  assert.equal(decideWindows("click_element", "read").decision, "deny");
  assert.equal(decideWindows("click_element", "write").decision, "ask");
  assert.equal(decideWindows("open_app", "full").decision, "allow");
  const proj = path.join(os.tmpdir(), "du-an-tl");
  assert.equal(decideOffice("excel_read", { file: "bao-gia.xlsx" }, "read", proj).decision, "allow");
  assert.equal(decideOffice("excel_write", { file: "bao-gia.xlsx" }, "read", proj).decision, "deny");
  assert.equal(decideOffice("excel_write", { file: "bao-gia.xlsx" }, "write", proj).decision, "allow");
  assert.equal(decideOffice("word_create", { file: path.join(os.tmpdir(), "ngoai.docx") }, "write", proj).decision, "ask");
  assert.equal(decideOffice("word_read", { file: "../ngoai.docx" }, "write", proj).decision, "ask");
});
