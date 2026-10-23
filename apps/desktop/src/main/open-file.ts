import { existsSync, statSync } from "node:fs";
import path from "node:path";

// Mở tệp agent tạo/nhắc tới bằng chương trình mặc định của Windows (như bấm tệp trong app Claude).
// Không mở tệp chạy được (chương trình, kịch bản, lối tắt) để tránh vô tình chạy mã.
// Danh sách CHO PHÉP (tài liệu, bảng, ảnh, chữ): đuôi khác thì chỉ mở thư mục, an toàn hơn danh sách chặn.
const ALLOWED = /\.(xlsx|xlsm|xls|csv|tsv|docx|doc|pdf|pptx|ppt|odt|ods|rtf|txt|md|log|json|xml|yaml|yml|html?|png|jpe?g|gif|webp|bmp|svg|mp4|mp3|wav|zip)$/i;

// Chuẩn hoá đường dẫn từ câu trả lời/liên kết: bỏ file://, giải mã %xx (lỗi thì giữ nguyên), tính từ thư mục dự án.
export function resolvePath(p: string, baseDir: string | null): string | null {
  let raw = String(p ?? "").trim().replace(/^file:\/\//i, "");
  if (!raw) return null;
  try { raw = decodeURIComponent(raw); } catch { /* đường dẫn có dấu % thật */ }
  if (/^\/[a-zA-Z]:[\\/]/.test(raw)) raw = raw.slice(1);
  return path.resolve(baseDir ?? process.cwd(), raw);
}

export function checkOpenable(p: string, baseDir: string | null): { ok: true; file: string } | { ok: false; message: string } {
  const file = resolvePath(p, baseDir);
  if (!file) return { ok: false, message: "Thiếu đường dẫn tệp." };
  // Windows bỏ dấu chấm/cách cuối tên và hiểu "tệp:luồng" (a.exe. hoặc a.exe::$DATA): không nhận các dạng này.
  if (/[. ]$/.test(file) || /:[^\\/]*$/.test(file.slice(2))) return { ok: false, message: "Đường dẫn tệp không hợp lệ." };
  if (!existsSync(file)) return { ok: false, message: `Không thấy tệp: ${file}` };
  if (statSync(file).isDirectory()) return { ok: true, file };
  if (!ALLOWED.test(file)) return { ok: false, message: "Loại tệp này app không mở thẳng (có thể chạy chương trình). Bấm Thư mục rồi tự xem." };
  return { ok: true, file };
}
