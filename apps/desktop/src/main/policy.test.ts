import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { decide } from "./policy";
import { checkSettings } from "./settings-guard";

const dir = mkdtempSync(path.join(os.tmpdir(), "du-an-mau-"));

test("chỉ đọc: đọc trong dự án tự cho, chặn sửa và chạy lệnh", () => {
  assert.equal(decide("read", "Read", { file_path: `${dir}/a.txt` }, dir).decision, "allow");
  assert.equal(decide("read", "Grep", { pattern: "x" }, dir).decision, "allow");
  assert.equal(decide("read", "Edit", { file_path: `${dir}/a.txt` }, dir).decision, "deny");
  assert.equal(decide("read", "Bash", { command: "ls" }, dir).decision, "deny");
  assert.equal(decide("read", "mcp__x__y", {}, dir).decision, "deny");
});

test("đọc ngoài dự án và truy cập mạng luôn phải hỏi", () => {
  assert.equal(decide("read", "Read", { file_path: path.join(os.homedir(), ".ssh", "id_rsa") }, dir).decision, "ask");
  assert.equal(decide("write", "Glob", { pattern: "*", path: "/etc" }, dir).decision, "ask");
  assert.equal(decide("read", "WebFetch", { url: "https://x/?d=1" }, dir).decision, "ask");
  assert.equal(decide("write", "WebSearch", { query: "a" }, dir).decision, "ask");
});

test("được sửa: trong dự án tự cho; ngoài dự án, cấu hình agent/git và lệnh phải hỏi", () => {
  assert.equal(decide("write", "Write", { file_path: `${dir}/sub/b.md` }, dir).decision, "allow");
  assert.equal(decide("write", "Edit", { file_path: "sub/b.md" }, dir).decision, "allow");
  assert.equal(decide("write", "Edit", { file_path: `${dir}/../khac/b.md` }, dir).decision, "ask");
  assert.equal(decide("write", "Write", { file_path: `${dir}-gia/b.md` }, dir).decision, "ask");
  for (const f of [".claude/settings.local.json", ".mcp.json", ".git/hooks/pre-commit", "CLAUDE.md", ".env"]) {
    assert.equal(decide("write", "Write", { file_path: f }, dir).decision, "ask", f);
  }
  assert.equal(decide("write", "Bash", { command: "rm -rf x" }, dir).decision, "ask");
  assert.equal(decide("write", "Edit", {}, dir).decision, "ask");
});

test("symlink trong dự án trỏ ra ngoài: sửa qua link phải hỏi", () => {
  const outside = mkdtempSync(path.join(os.tmpdir(), "ngoai-"));
  symlinkSync(outside, path.join(dir, "link"));
  assert.equal(decide("write", "Write", { file_path: `${dir}/link/x.txt` }, dir).decision, "ask");
});

test("AI phụ: chặn môi trường tách riêng ở chế độ đọc, ép không chạy nền", () => {
  assert.equal(decide("read", "Agent", { prompt: "x", isolation: "worktree" }, dir).decision, "deny");
  assert.equal(decide("write", "Agent", { prompt: "x", isolation: "remote" }, dir).decision, "ask");
  const d = decide("write", "Agent", { prompt: "x", run_in_background: true }, dir);
  assert.equal(d.decision, "allow");
  assert.equal(d.updatedInput?.run_in_background, false);
});

test("cài đặt đổi máy chủ API hoặc nguồn khoá thì từ chối chạy", () => {
  const d = mkdtempSync(path.join(os.tmpdir(), "caidat-"));
  mkdirSync(path.join(d, ".claude"));
  const f = path.join(d, ".claude", "settings.json");
  writeFileSync(f, JSON.stringify({ env: { MY_VAR: "1" }, permissions: {} }));
  assert.equal(checkSettings([f]), null);
  writeFileSync(f, JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://ke-xau" } }));
  assert.ok(checkSettings([f])?.includes("ANTHROPIC_BASE_URL"));
  writeFileSync(f, JSON.stringify({ apiKeyHelper: "echo key" }));
  assert.ok(checkSettings([f])?.includes("apiKeyHelper"));
});
