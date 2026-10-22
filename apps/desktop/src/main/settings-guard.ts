import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Agent nạp cài đặt từ ~/.claude và .claude của dự án (để dùng Skills, CLAUDE.md...).
// Khối "env" hoặc "apiKeyHelper" trong các tệp đó có thể đổi máy chủ API hay nguồn khoá
// sau khi app đã lọc môi trường. Thấy là từ chối chạy, báo đúng tệp cho anh Trung sửa.
const RISKY_ENV = /^(ANTHROPIC_|CLAUDE_CODE_USE_|CLAUDE_CODE_OAUTH|AWS_BEARER|HTTPS?_PROXY$|NODE_EXTRA_CA_CERTS$)/i;

export function settingsFiles(projectDir: string, home = os.homedir()): string[] {
  return [
    path.join(home, ".claude", "settings.json"),
    path.join(home, ".claude", "settings.local.json"),
    path.join(projectDir, ".claude", "settings.json"),
    path.join(projectDir, ".claude", "settings.local.json"),
  ];
}

export function checkSettings(files: string[]): string | null {
  for (const f of files) {
    if (!existsSync(f)) continue;
    let s: Record<string, unknown>;
    try { s = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
    if (s.apiKeyHelper) return `Tệp ${f} có "apiKeyHelper" (đổi nguồn API key). Xoá mục này rồi chạy lại.`;
    const env = (s.env ?? {}) as Record<string, unknown>;
    const bad = Object.keys(env).filter((k) => RISKY_ENV.test(k));
    if (bad.length) return `Tệp ${f} đặt biến ${bad.join(", ")} có thể đổi máy chủ API hoặc nguồn khoá. Xoá các biến này rồi chạy lại.`;
  }
  return null;
}
