import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { ChromeSettings } from "../shared/contract";
import { chromeServerConfig, type ChromePaths } from "./chrome";

// Trình duyệt riêng của app chạy MỘT máy chủ Playwright MCP dùng chung cho mọi việc (qua HTTP trên 127.0.0.1),
// thay vì mỗi việc một máy chủ: trước đây việc xong là máy chủ tắt và trình duyệt đóng theo ("mới bật lên lại tự tắt").
// Trình duyệt tự đóng sau 5 phút không có thao tác (--idle-timeout), thao tác kế tiếp tự mở lại, giữ đăng nhập (hồ sơ trên đĩa).

export const BROWSER_IDLE_MS = 5 * 60_000;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      s.close(() => (a && typeof a === "object" ? resolve(a.port) : reject(new Error("Không lấy được cổng trống."))));
    });
  });
}

export class BrowserServer {
  private proc: ChildProcess | null = null;
  private url: string | null = null;
  private sig = "";
  private starting: Promise<string> | null = null;

  constructor(private paths: ChromePaths, private fetchFn: typeof fetch = fetch) {}

  // Cấu hình máy chủ MCP cho một việc. Chế độ Chrome chính (tiện ích) vẫn chạy riêng mỗi việc: trình duyệt là Chrome của anh, không bị đóng.
  async config(s: ChromeSettings): Promise<McpServerConfig> {
    const base = chromeServerConfig(s, this.paths);
    if (s.mode === "main") return base;
    const url = await this.ensure(base.args ?? [], base.env ?? {});
    return { type: "http", url };
  }

  private async ensure(args: string[], env: Record<string, string>): Promise<string> {
    const sig = JSON.stringify(args);
    if (this.proc && this.url && this.sig === sig && this.proc.exitCode === null) return this.url;
    if (this.starting) return this.starting;
    this.stop();
    this.starting = this.launch(args, env, sig).finally(() => { this.starting = null; });
    return this.starting;
  }

  private async launch(args: string[], env: Record<string, string>, sig: string): Promise<string> {
    const port = await freePort();
    const p = spawn(this.paths.nodeBinary, [...args, "--port", String(port), "--host", "localhost", "--shared-browser-context",
      "--idle-timeout", String(BROWSER_IDLE_MS)], { env: { ...process.env, ...env }, stdio: "ignore", windowsHide: true });
    this.proc = p;
    p.once("exit", () => { if (this.proc === p) { this.proc = null; this.url = null; } });
    const url = `http://localhost:${port}/mcp`;
    // Chờ máy chủ nghe cổng (tối đa 20 giây).
    for (let i = 0; i < 80; i++) {
      if (p.exitCode !== null) throw new Error("Máy chủ trình duyệt thoát ngay khi khởi động.");
      try { await this.fetchFn(url, { method: "GET" }); this.url = url; this.sig = sig; return url; } catch { /* chưa sẵn sàng */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    this.stop();
    throw new Error("Máy chủ trình duyệt không khởi động được trong 20 giây.");
  }

  // Tắt máy chủ (và trình duyệt): trước khi mở cửa sổ đăng nhập dùng cùng hồ sơ, khi thoát app.
  stop() {
    const p = this.proc;
    this.proc = null; this.url = null;
    if (p && p.exitCode === null) p.kill();
  }
}
