import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import { parseFrontmatter, SkillStore } from "./skills";
import { readZip } from "./zip";

// Tạo tệp .zip nhỏ trong bộ nhớ (nén deflate) để thử.
function makeZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const cens: Buffer[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const comp = deflateRawSync(data);
    const n = Buffer.from(name);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x800, 6); loc.writeUInt16LE(8, 8);
    loc.writeUInt32LE(crc32(data), 14); loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(data.length, 22); loc.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc32(data), 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(n.length, 28);
    cen.writeUInt32LE(off, 42);
    locals.push(loc, n, comp);
    cens.push(cen, n);
    off += 30 + n.length + comp.length;
  }
  const cenBuf = Buffer.concat(cens);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(cens.length / 2, 8); end.writeUInt16LE(cens.length / 2, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cenBuf, end]);
}

const md = (name: string, desc = "Skill mẫu") => `---\nname: ${name}\ndescription: ${desc}\n---\nNội dung ${name}\n`;
const tmp = () => mkdtempSync(path.join(os.tmpdir(), "skills-"));

test("đọc phần đầu SKILL.md, cả khối nhiều dòng", () => {
  assert.deepEqual(parseFrontmatter(md("bao-gia")), { name: "bao-gia", description: "Skill mẫu" });
  assert.deepEqual(parseFrontmatter("---\nname: \"seo\"\ndescription: >\n  dòng một\n  dòng hai\n---\n"), { name: "seo", description: "dòng một dòng hai" });
  assert.equal(parseFrontmatter("không có phần đầu"), null);
});

test("zip: chặn đường dẫn thoát ra ngoài", () => {
  assert.throws(() => readZip(makeZip({ "../ngoai/SKILL.md": md("x") })), /không an toàn/);
  assert.throws(() => readZip(makeZip({ "C:/Windows/SKILL.md": md("x") })), /không an toàn/);
  assert.throws(() => readZip(Buffer.from("không phải zip")), /không phải .zip/);
  for (const bad of ["x/aux.txt", "x/a:b", "x/ten.", "x/CON"]) assert.throws(() => readZip(makeZip({ [bad]: "x" })), /không an toàn/, bad);
});

test("tải lên .zip nhiều Skill, bỏ rác, báo lỗi, nạp làm plugin", () => {
  const root = tmp();
  const store = new SkillStore(path.join(root, "skills"));
  assert.equal(store.pluginPath(), null);
  const zip = path.join(root, "a.zip");
  writeFileSync(zip, makeZip({
    "bo/bao-gia/SKILL.md": md("bao-gia"), "bo/bao-gia/scripts/tinh.py": "print(1)", "bo/bao-gia/references/gia.md": "bảng giá mẫu",
    "bo/seo/SKILL.md": md("seo"), "bo/seo/phu/SKILL.md": md("con-long"),
    "bo/sai/SKILL.md": md("Tên Sai"), "__MACOSX/bo/._x": "rác",
  }));
  const p = store.previewZip(zip);
  const by = Object.fromEntries(p.items.map((i) => [i.name, i]));
  assert.equal(p.items.length, 3);                 // Skill lồng "con-long" thuộc về "seo"
  assert.equal(by["bao-gia"].status, "new");
  assert.equal(by["bao-gia"].hasScripts, true);
  assert.equal(by["bao-gia"].files, 3);
  assert.equal(by["Tên Sai"].status, "error");
  const r = store.commit(p.id, p.items.map((i) => i.key));
  assert.deepEqual(r.imported.sort(), ["bao-gia", "seo"]);
  const plugin = store.pluginPath()!;
  assert.ok(existsSync(path.join(plugin, ".claude-plugin", "plugin.json")));
  assert.equal(readFileSync(path.join(plugin, "skills", "bao-gia", "references", "gia.md"), "utf8"), "bảng giá mẫu");
  assert.ok(existsSync(path.join(plugin, "skills", "seo", "phu", "SKILL.md")));
  assert.deepEqual(store.list().map((s) => s.invokeName), ["tkhub:bao-gia", "tkhub:seo"]);
  assert.equal(store.commit(p.id, ["0"]).imported.length, 0);   // phiên nhập dùng một lần
});

test("thay bản mới giữ bản cũ; tắt, xoá, khôi phục", () => {
  const root = tmp();
  let t = 0;
  const store = new SkillStore(path.join(root, "skills"), () => new Date(Date.UTC(2026, 9, 22, 14, 0, t++)));
  const src = path.join(root, "nguon", "bao-gia");
  mkdirSync(src, { recursive: true });
  writeFileSync(path.join(src, "SKILL.md"), md("bao-gia", "bản 1"));
  let p = store.previewFolder(path.join(root, "nguon"));
  store.commit(p.id, ["0"]);
  writeFileSync(path.join(src, "SKILL.md"), md("bao-gia", "bản 2"));
  p = store.previewFolder(src);
  assert.equal(p.items[0].status, "replace");
  store.commit(p.id, ["0"]);
  let s = store.list()[0];
  assert.equal(s.description, "bản 2");
  assert.equal(s.backups.length, 1);

  store.setEnabled("bao-gia", false);
  assert.equal(store.list()[0].enabled, false);
  assert.equal(store.pluginPath(), null);
  store.setEnabled("bao-gia", true);
  assert.equal(store.list()[0].enabled, true);

  const r = store.restore("bao-gia", s.backups[0]);
  assert.ok(r.ok);
  s = store.list()[0];
  assert.equal(s.description, "bản 1");
  assert.equal(s.backups.length, 1);              // bản 2 vào sao lưu, bản 1 ra dùng

  store.remove("bao-gia");
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].deleted, true);         // vẫn hiện để khôi phục
  assert.equal(store.pluginPath(), null);
  assert.equal(store.backups("bao-gia").length, 2);
  assert.equal(store.restore("bao-gia", "khong-co").ok, false);
  assert.equal(store.restore("../x", "y").ok, false);
});

test("đổi tên lỗi khi thay Skill: trả bản cũ về, không mất Skill", async () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const root = tmp();
  const store = new SkillStore(path.join(root, "skills"));
  const src = path.join(root, "bao-gia");
  mkdirSync(src, { recursive: true });
  writeFileSync(path.join(src, "SKILL.md"), md("bao-gia", "bản 1"));
  store.commit(store.previewFolder(src).id, ["0"]);
  writeFileSync(path.join(src, "SKILL.md"), md("bao-gia", "bản 2"));
  const p = store.previewFolder(src);
  const orig = fs.renameSync;
  let n = 0;
  // Lần đổi tên thứ 2 (thư mục tạm → chỗ dùng) giả lập Windows báo tệp đang bị giữ.
  (fs as { renameSync: typeof orig }).renameSync = ((a: string, b: string) => { if (++n === 2) throw Object.assign(new Error("EBUSY"), { code: "EBUSY" }); return orig(a, b); }) as typeof orig;
  let r;
  try { r = store.commit(p.id, ["0"]); } finally { (fs as { renameSync: typeof orig }).renameSync = orig; }
  assert.equal(r.imported.length, 0);
  assert.match(r.message, /EBUSY/);
  const s = store.list();
  assert.equal(s.length, 1);
  assert.equal(s[0].description, "bản 1");
  assert.equal(s[0].enabled, true);
});
