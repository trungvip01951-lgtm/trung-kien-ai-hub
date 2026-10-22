import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
const MAX_ZIP_BYTES = 200 * 1024 * 1024;
import path from "node:path";
import type { SkillImportPreview, SkillInfo } from "../shared/contract";
import { readZip, ZIP_LIMITS, type ZipEntry } from "./zip";

// Kho Skills của app (giống "Tải Skill lên" trên claude.ai). Nằm trong thư mục dữ liệu app,
// không ghi vào ~/.claude của Claude Code. Agent nạp kho này như một plugin cục bộ tên "tkhub"
// (Agent SDK, tuỳ chọn `plugins`), nên Skill hiện với tên "tkhub:<tên>" (đo 22/10/2026).
//   <gốc>/plugin/.claude-plugin/plugin.json
//   <gốc>/plugin/skills/<tên>/SKILL.md    Skill đang bật
//   <gốc>/disabled/<tên>/                  Skill đang tắt
//   <gốc>/backup/<tên>/<thời điểm>/        bản cũ (khi thay, xoá, khôi phục) để khôi phục lại
// Khi nhập chỉ chép tệp, không chạy script nào.

export const PLUGIN_NAME = "tkhub";
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SCRIPT_RE = /\.(py|js|mjs|cjs|ts|sh|bash|ps1|bat|cmd|exe|dll|vbs)$/i;
const JUNK_RE = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i;

export interface Frontmatter { name?: string; description?: string }

// Đọc phần đầu YAML đơn giản của SKILL.md (key: value, chuỗi trong ngoặc, khối > hoặc |).
export function parseFrontmatter(text: string): Frontmatter | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end < 0) return null;
  const out: Record<string, string> = {};
  for (let i = 1; i < end; i++) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    let v = m[2].trim();
    if (/^[>|][-+]?$/.test(v)) {
      const block: string[] = [];
      while (i + 1 < end && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === "")) block.push(lines[++i].trim());
      v = block.join(v.startsWith(">") ? " " : "\n").trim();
    } else if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return { name: out.name, description: out.description };
}

export function validateSkill(fm: Frontmatter | null): string | null {
  if (!fm) return "SKILL.md thiếu phần đầu (--- name/description ---).";
  if (!fm.name) return "SKILL.md thiếu name.";
  if (fm.name.length > 64 || !NAME_RE.test(fm.name)) return `Tên "${fm.name}" không hợp lệ: chỉ chữ thường không dấu, số và dấu gạch ngang, tối đa 64 ký tự.`;
  if (!fm.description?.trim()) return "SKILL.md thiếu description.";
  if (fm.description.length > 1024) return "description dài quá 1024 ký tự.";
  return null;
}

interface Candidate { key: string; root: string; entries: ZipEntry[]; name: string; description: string; error: string | null }

// Tìm các Skill trong một bộ tệp: mỗi thư mục có SKILL.md là một Skill (bỏ Skill lồng trong Skill khác).
export function findSkills(entries: ZipEntry[]): Candidate[] {
  const files = entries.filter((e) => !JUNK_RE.test(e.path));
  const roots = files.filter((e) => path.posix.basename(e.path).toLowerCase() === "skill.md").map((e) => path.posix.dirname(e.path))
    .sort((a, b) => a.length - b.length);
  const top: string[] = [];
  for (const r of roots) if (!top.some((t) => t === "." || r === t || r.startsWith(`${t}/`))) top.push(r);
  return top.map((root, i) => {
    const prefix = root === "." ? "" : `${root}/`;
    const own = files.filter((e) => e.path.startsWith(prefix)).map((e) => ({ path: e.path.slice(prefix.length), data: e.data }));
    const md = own.find((e) => e.path.toLowerCase() === "skill.md")!;
    const fm = parseFrontmatter(md.data.toString("utf8"));
    const error = validateSkill(fm);
    // Đặt tên tệp chính đúng chuẩn SKILL.md.
    md.path = "SKILL.md";
    return { key: String(i), root: root === "." ? "(gốc)" : root, entries: own, name: fm?.name ?? "", description: fm?.description ?? "", error };
  });
}

// Đọc một thư mục vào bộ nhớ (bỏ qua symlink), cùng giới hạn như tệp .zip.
export function readFolder(dir: string): ZipEntry[] {
  const out: ZipEntry[] = [];
  let total = 0;
  const walk = (abs: string, rel: string) => {
    for (const name of readdirSync(abs)) {
      const a = path.join(abs, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = lstatSync(a);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { if (name !== ".git" && name !== "node_modules") walk(a, r); continue; }
      if (!st.isFile()) continue;
      if (out.length >= ZIP_LIMITS.maxEntries) throw new Error(`Thư mục có hơn ${ZIP_LIMITS.maxEntries} tệp.`);
      if (st.size > ZIP_LIMITS.maxFileBytes) throw new Error(`Tệp ${r} quá lớn (${st.size} byte).`);
      total += st.size;
      if (total > ZIP_LIMITS.maxTotalBytes) throw new Error(`Thư mục lớn quá ${ZIP_LIMITS.maxTotalBytes} byte.`);
      out.push({ path: r, data: readFileSync(a) });
    }
  };
  walk(dir, "");
  return out;
}

function dirStats(dir: string): { files: number; bytes: number; hasScripts: boolean; mtime: number } {
  let files = 0, bytes = 0, hasScripts = false, mtime = 0;
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const a = path.join(d, n);
      const st = lstatSync(a);
      if (st.isDirectory()) walk(a);
      else if (st.isFile()) { files++; bytes += st.size; mtime = Math.max(mtime, st.mtimeMs); if (SCRIPT_RE.test(n)) hasScripts = true; }
    }
  };
  if (existsSync(dir)) walk(dir);
  return { files, bytes, hasScripts, mtime };
}

const stampOf = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "-");

export class SkillStore {
  private previews = new Map<string, Candidate[]>();
  private seq = 0;

  constructor(private root: string, private now: () => Date = () => new Date()) {
    mkdirSync(path.join(this.root, "plugin", ".claude-plugin"), { recursive: true });
    mkdirSync(this.skillsDir(), { recursive: true });
    const manifest = path.join(this.root, "plugin", ".claude-plugin", "plugin.json");
    if (!existsSync(manifest)) {
      writeFileSync(manifest, JSON.stringify({ name: PLUGIN_NAME, description: "Skills anh Trung tải lên Trung Kiên AI Hub" }, null, 2));
    }
  }

  private skillsDir() { return path.join(this.root, "plugin", "skills"); }
  private enabledDir(name: string) { return path.join(this.skillsDir(), name); }
  private disabledDir(name: string) { return path.join(this.root, "disabled", name); }
  private backupDir(name: string) { return path.join(this.root, "backup", name); }

  // Thư mục plugin truyền cho agent; null nếu chưa có Skill nào đang bật.
  pluginPath(): string | null {
    return this.list().some((s) => s.enabled) ? path.join(this.root, "plugin") : null;
  }

  // Agent được đọc tệp trong kho Skill mà không hỏi (tài liệu tham chiếu của Skill).
  readableRoot(): string { return path.join(this.root, "plugin"); }

  private names(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((n) => !n.startsWith(".") && NAME_RE.test(n) && statSync(path.join(dir, n)).isDirectory());
  }

  list(): SkillInfo[] {
    const rows: SkillInfo[] = [];
    const add = (name: string, dir: string, enabled: boolean, deleted = false) => {
      const md = path.join(dir, "SKILL.md");
      const fm = existsSync(md) ? parseFrontmatter(readFileSync(md, "utf8")) : null;
      const s = dirStats(dir);
      rows.push({ name, invokeName: `${PLUGIN_NAME}:${name}`, description: fm?.description ?? "", enabled, deleted, files: s.files, bytes: s.bytes,
        hasScripts: s.hasScripts, updatedAt: new Date(s.mtime || Date.now()).toISOString(), backups: this.backups(name) });
    };
    for (const n of this.names(this.skillsDir())) add(n, this.enabledDir(n), true);
    for (const n of this.names(path.join(this.root, "disabled"))) if (!existsSync(this.enabledDir(n))) add(n, this.disabledDir(n), false);
    // Skill đã xoá: hiện bản cũ mới nhất để khôi phục được.
    for (const n of this.names(path.join(this.root, "backup"))) {
      const b = this.backups(n);
      if (!this.exists(n) && b.length) add(n, path.join(this.backupDir(n), b[0]), false, true);
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  backups(name: string): string[] {
    const d = this.backupDir(name);
    return existsSync(d) ? readdirSync(d).filter((n) => !n.startsWith(".")).sort().reverse() : [];
  }

  private exists(name: string) { return existsSync(this.enabledDir(name)) || existsSync(this.disabledDir(name)); }

  preview(entries: ZipEntry[], sourceLabel: string): SkillImportPreview {
    const found = findSkills(entries);
    const id = `i${++this.seq}`;
    this.previews.set(id, found);
    const seenNames = new Set<string>();
    return {
      id, source: sourceLabel,
      items: found.map((c) => {
        let error = c.error;
        if (!error && seenNames.has(c.name)) error = `Trùng tên "${c.name}" với Skill khác trong cùng tệp.`;
        seenNames.add(c.name);
        if (error) c.error = error;
        const bytes = c.entries.reduce((s, e) => s + e.data.length, 0);
        return { key: c.key, folder: c.root, name: c.name, description: c.description, files: c.entries.length, bytes,
          hasScripts: c.entries.some((e) => SCRIPT_RE.test(e.path)), status: error ? "error" : this.exists(c.name) ? "replace" : "new", error };
      }),
    };
  }

  cancel(id: string) { this.previews.delete(id); }

  // Chuyển thư mục hiện có của Skill vào sao lưu (không xoá hẳn).
  private moveToBackup(name: string): string | null {
    const src = existsSync(this.enabledDir(name)) ? this.enabledDir(name) : existsSync(this.disabledDir(name)) ? this.disabledDir(name) : null;
    if (!src) return null;
    let stamp = stampOf(this.now());
    while (existsSync(path.join(this.backupDir(name), stamp))) stamp += "_";
    mkdirSync(this.backupDir(name), { recursive: true });
    renameSync(src, path.join(this.backupDir(name), stamp));
    return stamp;
  }

  commit(id: string, keys: string[]): { imported: string[]; message: string } {
    const found = this.previews.get(id);
    if (!found) return { imported: [], message: "Phiên nhập đã hết hạn, tải lại tệp." };
    this.previews.delete(id);
    const imported: string[] = [];
    const failed: string[] = [];
    for (const c of found) {
      if (!keys.includes(c.key) || c.error) continue;
      // Ghi vào thư mục tạm rồi đổi tên, để agent không thấy Skill ghi dở.
      const tmp = path.join(this.skillsDir(), `.tmp-${c.name}`);
      let backedUp: string | null = null;
      try {
        rmSync(tmp, { recursive: true, force: true });
        for (const e of c.entries) {
          const target = path.join(tmp, ...e.path.split("/"));
          if (!target.startsWith(tmp + path.sep)) throw new Error(`Đường dẫn không an toàn: ${e.path}`);
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, e.data);
        }
        const wasEnabled = !existsSync(this.disabledDir(c.name));
        backedUp = this.moveToBackup(c.name);
        try {
          renameSync(tmp, this.enabledDir(c.name));
        } catch (err) {
          // Đổi tên lỗi (Windows: tệp đang bị giữ): trả bản cũ về chỗ cũ, không để mất Skill.
          if (backedUp) renameSync(path.join(this.backupDir(c.name), backedUp), wasEnabled ? this.enabledDir(c.name) : this.disabledDir(c.name));
          backedUp = null;
          throw err;
        }
        imported.push(c.name);
      } catch (err) {
        failed.push(`${c.name} (${err instanceof Error ? err.message : String(err)})`);
        rmSync(tmp, { recursive: true, force: true });
      }
    }
    const parts = [imported.length ? `Đã nhập ${imported.length} Skill: ${imported.join(", ")}.` : "Không có Skill nào được nhập."];
    if (failed.length) parts.push(`Lỗi, giữ nguyên bản cũ: ${failed.join("; ")}.`);
    return { imported, message: parts.join(" ") };
  }

  setEnabled(name: string, enabled: boolean) {
    if (!NAME_RE.test(name)) return;
    const [from, to] = enabled ? [this.disabledDir(name), this.enabledDir(name)] : [this.enabledDir(name), this.disabledDir(name)];
    if (!existsSync(from) || existsSync(to)) return;
    mkdirSync(path.dirname(to), { recursive: true });
    renameSync(from, to);
  }

  // Xoá = chuyển vào sao lưu, khôi phục được.
  remove(name: string) { if (NAME_RE.test(name)) this.moveToBackup(name); }

  // Khôi phục một bản cũ; bản hiện tại (nếu có) được sao lưu trước. Bản khôi phục ở trạng thái bật.
  restore(name: string, stamp: string): { ok: boolean; message: string } {
    if (!NAME_RE.test(name) || !this.backups(name).includes(stamp)) return { ok: false, message: "Không tìm thấy bản cũ này." };
    const src = path.join(this.backupDir(name), stamp);
    this.moveToBackup(name);
    renameSync(src, this.enabledDir(name));
    return { ok: true, message: `Đã khôi phục ${name} về bản ${stamp}.` };
  }

  previewZip(file: string): SkillImportPreview {
    if (statSync(file).size > MAX_ZIP_BYTES) throw new Error("Tệp .zip lớn quá 200 MB, không phải một Skill.");
    return this.preview(readZip(readFileSync(file)), path.basename(file));
  }
  previewFolder(dir: string): SkillImportPreview { return this.preview(readFolder(dir), dir); }
}
