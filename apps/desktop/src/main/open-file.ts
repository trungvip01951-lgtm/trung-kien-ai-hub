import { existsSync, statSync } from "node:fs";
import path from "node:path";

// Mở tệp agent tạo/nhắc tới bằng chương trình mặc định của Windows (như bấm tệp trong app Claude).
// Không mở tệp chạy được (chương trình, kịch bản, lối tắt) để tránh vô tình chạy mã.
const BLOCKED = /\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|lnk|url|hta|cpl|jar|reg|pif|appref-ms|application|gadget|inf|sys|dll)$/i;

export function checkOpenable(p: string, baseDir: string | null): { ok: true; file: string } | { ok: false; message: string } {
  const raw = String(p ?? "").trim().replace(/^file:\/\/\/?/i, "");
  if (!raw) return { ok: false, message: "Thiếu đường dẫn tệp." };
  const file = path.resolve(baseDir ?? process.cwd(), decodeURIComponent(raw));
  if (!existsSync(file)) return { ok: false, message: `Không thấy tệp: ${file}` };
  if (!statSync(file).isDirectory() && BLOCKED.test(file)) return { ok: false, message: "Tệp chạy chương trình: app không mở thẳng để tránh chạy nhầm. Mở thư mục rồi tự xem." };
  return { ok: true, file };
}
