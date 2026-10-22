import { execFile } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { claudeExecutablePath } from "./sdk-path";

const run = promisify(execFile);

type Check = { name: string; pass: boolean; detail: string };

// Kiểm tra khói cho bản đóng gói: không gọi API, không cần API key.
// 1. Tìm thấy tệp chạy Claude Code đi kèm SDK.
// 2. Tệp đó chạy được (--version).
// 3. Nạp được thư viện Agent SDK và có hàm query.
export async function runSmokeTest(outFile?: string): Promise<boolean> {
  const checks: Check[] = [];

  const exe = claudeExecutablePath();
  checks.push({ name: "sdk-binary-exists", pass: existsSync(exe), detail: exe });

  try {
    const { stdout } = await run(exe, ["--version"], { timeout: 60_000 });
    checks.push({ name: "sdk-binary-runs", pass: stdout.includes("Claude Code"), detail: stdout.trim() });
  } catch (err) {
    checks.push({ name: "sdk-binary-runs", pass: false, detail: String(err) });
  }

  try {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    checks.push({ name: "sdk-module-loads", pass: typeof sdk.query === "function", detail: typeof sdk.query });
  } catch (err) {
    checks.push({ name: "sdk-module-loads", pass: false, detail: String(err) });
  }

  const pass = checks.every((c) => c.pass);
  const report = JSON.stringify({ pass, platform: `${process.platform}-${process.arch}`, checks }, null, 2);
  if (outFile) writeFileSync(outFile, report);
  console.log(report);
  return pass;
}
