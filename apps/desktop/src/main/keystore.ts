import { safeStorage } from "electron";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// Lưu API key mã hoá bằng safeStorage (trên Windows là DPAPI, gắn với tài khoản Windows đang đăng nhập).
// Key không bao giờ được gửi ngược lên giao diện, không ghi log, không ghi vào cơ sở dữ liệu.
export class KeyStore {
  constructor(private file: string) {}

  has(): boolean { return existsSync(this.file); }

  get(): string | null {
    if (!this.has()) return null;
    try { return safeStorage.decryptString(readFileSync(this.file)); } catch { return null; }
  }

  set(key: string): { ok: boolean; message: string } {
    const k = key.trim();
    if (!k.startsWith("sk-ant-")) return { ok: false, message: "Key phải bắt đầu bằng sk-ant- (lấy trong Claude Console → API Keys)." };
    if (k.startsWith("sk-ant-admin")) return { ok: false, message: "Đây là Admin key. Dùng API key thường của workspace nhận tín dụng." };
    if (k.startsWith("sk-ant-oat")) return { ok: false, message: "Đây là mã đăng nhập gói Claude, không phải API key." };
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, message: "Windows không cho mã hoá (DPAPI), chưa lưu key." };
    writeFileSync(this.file, safeStorage.encryptString(k), { mode: 0o600 });
    return { ok: true, message: "Đã lưu key (mã hoá bằng tài khoản Windows). Bấm Kiểm tra key để thử." };
  }

  clear() { rmSync(this.file, { force: true }); }
}
