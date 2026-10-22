import path from "node:path";

// Đường dẫn tệp chạy Claude Code đi kèm Agent SDK, theo nền tảng đang chạy.
// Trong bản đóng gói, node_modules/@anthropic-ai được giải nén ra app.asar.unpacked
// (cấu hình asarUnpack) vì không thể chạy tệp .exe nằm trong app.asar.
export function claudeExecutablePath(): string {
  const pkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  const dir = path.dirname(require.resolve(`${pkg}/package.json`));
  return path.join(dir, exe).replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}
