import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { handoffSummary, isThinhVuong, scanFolder } from "./inventory";
import { buildSystemPrompt } from "./routing";

function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = path.join(d, n); const st = statSync(p); out.push(`${p}:${st.mtimeMs}:${st.size}`); if (st.isDirectory()) walk(p); } };
  walk(dir);
  return out.sort();
}

test("quét dự án: đọc đủ thông tin, không ghi gì, bỏ qua Thịnh Vượng", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "quet-"));
  const a = path.join(root, "Web Mau A");
  const w = (rel: string, text: string) => { const f = path.join(a, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, text); };
  w("CLAUDE.md", "# Quy tắc mẫu");
  w(".claude/skills/seo-mau/SKILL.md", "---\nname: seo-mau\ndescription: x\n---\n");
  w(".claude/agents/kiem-tra.md", "---\nname: kiem-tra\n---\n");
  w(".claude/settings.json", JSON.stringify({ hooks: { PreToolUse: [] } }));
  w(".mcp.json", JSON.stringify({ mcpServers: { "search-console": {} } }));
  w("ho-so/BAN-GIAO.md", "# Bàn giao\n\n## Lần 1\n- Làm tới đâu: cũ\n\n## Lần 2\n- Làm tới đâu: xong trang chủ mẫu\n- Còn lại: viết 3 bài mẫu\n");
  w("package.json", "{}");
  w(".git/HEAD", "ref: refs/heads/main\n");
  const tv = path.join(root, "Thịnh Vượng", "web");
  mkdirSync(tv, { recursive: true });
  writeFileSync(path.join(tv, "CLAUDE.md"), "bí mật");
  mkdirSync(path.join(root, "node_modules", "x"), { recursive: true });
  writeFileSync(path.join(root, "node_modules", "x", "CLAUDE.md"), "");

  const before = snapshot(root);
  const { rows } = scanFolder(root);
  assert.deepEqual(snapshot(root), before);

  assert.equal(rows.length, 2);
  const r = rows.find((x) => x.name === "Web Mau A")!;
  assert.deepEqual(r.instructions, ["CLAUDE.md"]);
  assert.deepEqual(r.skills, ["seo-mau"]);
  assert.deepEqual(r.agents, ["kiem-tra"]);
  assert.equal(r.hooks, true);
  assert.deepEqual(r.mcp, ["search-console"]);
  assert.deepEqual(r.docs, ["ho-so/BAN-GIAO.md"]);
  assert.deepEqual(r.deps, ["package.json"]);
  assert.equal(r.git, "main");
  assert.equal(r.current, "Làm tới đâu: xong trang chủ mẫu");
  assert.equal(r.next, "Còn lại: viết 3 bài mẫu");
  const t = rows.find((x) => x.excluded)!;
  assert.equal(t.name, "Thịnh Vượng");
  assert.deepEqual(t.instructions, []);
});

test("nhận diện Thịnh Vượng có dấu, không dấu", () => {
  for (const p of ["D:/Thịnh Vượng", "C:/thinh-vuong/web", "/x/THINH_VUONG", "/x/Thinh.Vuong", "/x/Thịnh–Vượng", "/x/thinhvuong"]) assert.ok(isThinhVuong(p), p);
  assert.ok(!isThinhVuong("C:/Trung Kien/web"));
  assert.deepEqual(handoffSummary("không có mục"), { current: "", next: "" });
});

test("lời dặn hệ thống: chia việc và hướng dẫn dự án", () => {
  assert.equal(buildSystemPrompt("", false), undefined);
  const s = buildSystemPrompt("  Trả lời tiếng Việt  ", true) as { type: string; prompt: string; snapshot: boolean };
  assert.equal(s.type, "custom");
  assert.equal(s.snapshot, false);
  assert.match(s.prompt, /tro-ly-co-hoc/);
  assert.match(s.prompt, /Hướng dẫn dự án[^\n]*\nTrả lời tiếng Việt$/);
});
