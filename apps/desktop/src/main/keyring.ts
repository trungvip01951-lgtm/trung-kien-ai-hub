import { safeStorage } from "electron";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { ApiKeyInfo } from "../shared/contract";
import { orderForUse, validateKey, type KeyEntry, type KeyState } from "./keys";

// Nhiều API key theo thứ tự ưu tiên, mã hoá bằng safeStorage (Windows: DPAPI) trong một tệp.
// Trạng thái (lỗi gần nhất, lần dùng gần nhất) không bí mật, lưu riêng ở tệp JSON.
// Key không bao giờ được gửi lên giao diện, ghi log hay ghi vào cơ sở dữ liệu.
export class KeyRing {
  private state: Record<string, KeyState> = {};

  constructor(private file: string, private stateFile: string, legacyFile?: string) {
    if (existsSync(stateFile)) { try { this.state = JSON.parse(readFileSync(stateFile, "utf8")); } catch { this.state = {}; } }
    // Bản 0.1.x lưu một key ở api-key.bin: chuyển sang danh sách, key cũ đứng đầu.
    if (legacyFile && existsSync(legacyFile) && !existsSync(file)) {
      try {
        const k = safeStorage.decryptString(readFileSync(legacyFile));
        this.save([{ id: randomUUID(), label: "Key 1", key: k, addedAt: new Date().toISOString() }]);
        rmSync(legacyFile, { force: true });
      } catch { /* key cũ không giải mã được: bỏ qua, anh nhập lại */ }
    }
  }

  private load(): KeyEntry[] {
    if (!existsSync(this.file)) return [];
    try { return JSON.parse(safeStorage.decryptString(readFileSync(this.file))) as KeyEntry[]; } catch { return []; }
  }

  private save(list: KeyEntry[]) {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, safeStorage.encryptString(JSON.stringify(list)), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  private saveState() { writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2)); }

  has(): boolean { return this.load().length > 0; }

  list(): ApiKeyInfo[] {
    return this.load().map((e, i) => ({
      id: e.id, label: e.label, last4: e.key.slice(-4), priority: i + 1, addedAt: e.addedAt,
      lastError: this.state[e.id]?.lastError ?? null, lastErrorAt: this.state[e.id]?.lastErrorAt ?? null,
      lastUsedAt: this.state[e.id]?.lastUsedAt ?? null,
    }));
  }

  add(key: string, label: string): { ok: boolean; message: string } {
    const k = key.trim();
    const err = validateKey(k);
    if (err) return { ok: false, message: err };
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, message: "Windows không cho mã hoá (DPAPI), chưa lưu key." };
    const list = this.load();
    if (list.some((e) => e.key === k)) return { ok: false, message: "Key này đã có trong danh sách." };
    list.push({ id: randomUUID(), label: label.trim() || `Key ${list.length + 1}`, key: k, addedAt: new Date().toISOString() });
    this.save(list);
    return { ok: true, message: `Đã lưu key, thứ tự ưu tiên ${list.length}. Bấm Kiểm tra để thử.` };
  }

  remove(id: string) {
    this.save(this.load().filter((e) => e.id !== id));
    delete this.state[id];
    this.saveState();
  }

  move(id: string, delta: -1 | 1) {
    const list = this.load();
    const i = list.findIndex((e) => e.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.save(list);
  }

  // Danh sách key theo thứ tự sẽ thử cho việc kế tiếp.
  forUse(now = new Date()): KeyEntry[] { return orderForUse(this.load(), this.state, now); }

  get(id: string): KeyEntry | null { return this.load().find((e) => e.id === id) ?? null; }

  markError(id: string, reason: string) {
    this.state[id] = { ...this.state[id], lastError: reason, lastErrorAt: new Date().toISOString() };
    this.saveState();
  }

  markOk(id: string) {
    this.state[id] = { ...this.state[id], lastError: null, lastErrorAt: null, lastUsedAt: new Date().toISOString() };
    this.saveState();
  }
}
