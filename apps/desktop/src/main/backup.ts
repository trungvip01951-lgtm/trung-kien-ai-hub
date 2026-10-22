import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BackupInfo } from "../shared/contract";

// Sao lưu và khôi phục dữ liệu app (Mốc 4): lịch sử (hub.db), Skills, kết nối, cài đặt key (đã mã hoá, chỉ giải được
// trên đúng máy và tài khoản Windows này). Không sao lưu hồ sơ trình duyệt (lớn, có phiên đăng nhập).
// Khôi phục: ghi lệnh chờ, app khởi động lại, sao lưu trạng thái hiện tại trước rồi mới chép đè.

const FILES = ["hub.db", "connections.json", "connections.bin", "api-keys.bin", "api-keys-state.json", "chrome-extension-token.bin"];
const DIRS = ["skills"];
const KEEP_AUTO = 14;
const PENDING = "pending-restore.json";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-");

export class Backups {
  constructor(private dataDir: string, private snapshotDb: (file: string) => void, private appVersion: string, private now = () => new Date()) {}

  private root() { return path.join(this.dataDir, "backups"); }

  list(): BackupInfo[] {
    if (!existsSync(this.root())) return [];
    return readdirSync(this.root()).filter((n) => existsSync(path.join(this.root(), n, "manifest.json"))).map((n) => {
      const m = JSON.parse(readFileSync(path.join(this.root(), n, "manifest.json"), "utf8"));
      return { id: n, createdAt: m.createdAt, reason: m.reason, appVersion: m.appVersion, bytes: m.bytes ?? 0 };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  create(reason: "auto" | "manual" | "before-restore"): BackupInfo {
    const id = `${stamp(this.now())}-${reason}`;
    const dir = path.join(this.root(), id);
    const tmp = `${dir}.tmp`;
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    // Cơ sở dữ liệu chép bằng chính SQLite (VACUUM INTO) để bản sao nhất quán khi app đang ghi.
    this.snapshotDb(path.join(tmp, "hub.db"));
    for (const f of FILES.slice(1)) if (existsSync(path.join(this.dataDir, f))) cpSync(path.join(this.dataDir, f), path.join(tmp, f));
    for (const d of DIRS) if (existsSync(path.join(this.dataDir, d))) cpSync(path.join(this.dataDir, d), path.join(tmp, d), { recursive: true });
    const bytes = sizeOf(tmp);
    const info = { createdAt: this.now().toISOString(), reason, appVersion: this.appVersion, bytes };
    writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify(info, null, 2));
    renameSync(tmp, dir);
    if (reason === "auto") this.prune();
    return { id, ...info };
  }

  // Tự sao lưu mỗi ngày một lần khi mở app; giữ 14 bản tự động gần nhất.
  autoIfDue(): BackupInfo | null {
    const last = this.list().find((b) => b.reason === "auto");
    if (last && this.now().getTime() - new Date(last.createdAt).getTime() < 20 * 3600 * 1000) return null;
    return this.create("auto");
  }

  private prune() {
    for (const b of this.list().filter((x) => x.reason === "auto").slice(KEEP_AUTO)) rmSync(path.join(this.root(), b.id), { recursive: true, force: true });
  }

  requestRestore(id: string): { ok: boolean; message: string } {
    if (!this.list().some((b) => b.id === id)) return { ok: false, message: "Không tìm thấy bản sao lưu." };
    writeFileSync(path.join(this.dataDir, PENDING), JSON.stringify({ id }));
    return { ok: true, message: "App sẽ khởi động lại để khôi phục." };
  }

  // Gọi lúc khởi động, TRƯỚC khi mở hub.db. Trả về mã bản đã khôi phục (hoặc null).
  applyPendingRestore(): string | null {
    const f = path.join(this.dataDir, PENDING);
    if (!existsSync(f)) return null;
    let id = "";
    try { id = JSON.parse(readFileSync(f, "utf8")).id; } finally { rmSync(f, { force: true }); }
    const src = path.join(this.root(), id);
    if (!id || !existsSync(path.join(src, "manifest.json"))) return null;
    // Cất trạng thái hiện tại để còn quay lại được (chép tệp thô vì DB chưa mở).
    const safety = path.join(this.root(), `${stamp(this.now())}-before-restore`);
    mkdirSync(safety, { recursive: true });
    for (const n of [...FILES, "hub.db-wal", "hub.db-shm"]) if (existsSync(path.join(this.dataDir, n))) cpSync(path.join(this.dataDir, n), path.join(safety, n));
    for (const d of DIRS) if (existsSync(path.join(this.dataDir, d))) cpSync(path.join(this.dataDir, d), path.join(safety, d), { recursive: true });
    writeFileSync(path.join(safety, "manifest.json"), JSON.stringify({ createdAt: this.now().toISOString(), reason: "before-restore", appVersion: this.appVersion, bytes: sizeOf(safety) }, null, 2));
    for (const n of ["hub.db-wal", "hub.db-shm"]) rmSync(path.join(this.dataDir, n), { force: true });
    for (const n of FILES) {
      if (existsSync(path.join(src, n))) cpSync(path.join(src, n), path.join(this.dataDir, n));
      else if (n !== "hub.db") rmSync(path.join(this.dataDir, n), { force: true });
    }
    for (const d of DIRS) {
      rmSync(path.join(this.dataDir, d), { recursive: true, force: true });
      if (existsSync(path.join(src, d))) cpSync(path.join(src, d), path.join(this.dataDir, d), { recursive: true });
    }
    return id;
  }

  exportTo(id: string, destDir: string): string {
    const src = path.join(this.root(), id);
    if (!existsSync(path.join(src, "manifest.json"))) throw new Error("Không tìm thấy bản sao lưu.");
    const out = path.join(destDir, `TrungKienAIHub-saoluu-${id}`);
    cpSync(src, out, { recursive: true });
    return out;
  }

  importFrom(dir: string): BackupInfo {
    if (!existsSync(path.join(dir, "manifest.json")) || !existsSync(path.join(dir, "hub.db"))) throw new Error("Thư mục này không phải bản sao lưu của app (thiếu manifest.json hoặc hub.db).");
    const m = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
    const id = `${stamp(this.now())}-import`;
    cpSync(dir, path.join(this.root(), id), { recursive: true });
    return { id, createdAt: m.createdAt ?? this.now().toISOString(), reason: "import", appVersion: m.appVersion ?? "?", bytes: sizeOf(path.join(this.root(), id)) };
  }
}

function sizeOf(p: string): number {
  const st = statSync(p);
  if (!st.isDirectory()) return st.size;
  return readdirSync(p).reduce((s, n) => s + sizeOf(path.join(p, n)), 0);
}
