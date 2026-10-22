import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { HubEvent } from "../shared/contract";

// Tự cập nhật từ GitHub Releases của repo. Chỉ chạy ở bản đã cài (không chạy khi lập trình).
// Dữ liệu (lịch sử, cài đặt, key) nằm trong thư mục người dùng nên cập nhật không làm mất.
let emitRef: ((e: HubEvent) => void) | null = null;

export function startUpdater(emit: (e: HubEvent) => void) {
  emitRef = emit;
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => emit({ type: "update", status: "checking" }));
  autoUpdater.on("update-available", (i) => emit({ type: "update", status: "available", version: i.version }));
  autoUpdater.on("update-not-available", () => emit({ type: "update", status: "none" }));
  autoUpdater.on("download-progress", (p) => emit({ type: "update", status: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (i) => emit({ type: "update", status: "ready", version: i.version }));
  autoUpdater.on("error", (e) => emit({ type: "update", status: "error", message: String(e?.message ?? e).slice(0, 300) }));
  const check = () => autoUpdater.checkForUpdates().catch(() => undefined);
  setTimeout(check, 5000);
  setInterval(check, 6 * 60 * 60 * 1000);
}

// Anh Trung bấm "Kiểm tra cập nhật".
export async function checkUpdateNow() {
  if (!app.isPackaged) {
    emitRef?.({ type: "update", status: "error", message: "Chỉ kiểm tra cập nhật được ở bản đã cài." });
    return;
  }
  await autoUpdater.checkForUpdates().catch(() => undefined);
}

// Cài im lặng rồi tự mở lại app.
export function installUpdate() { autoUpdater.quitAndInstall(true, true); }
