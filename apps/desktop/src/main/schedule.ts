import type { ScheduleRule } from "../shared/contract";

// Lần chạy kế tiếp của một lịch, tính theo giờ máy (máy anh Trung đặt giờ Việt Nam), sau thời điểm `from`.
// Lịch chỉ chạy khi app đang mở; lỡ giờ khi app tắt thì lúc mở app chạy bù đúng một lần.
export function nextRun(r: ScheduleRule, from: Date): Date {
  if (r.kind === "hourly") {
    const h = Math.max(1, Math.min(24 * 7, Math.trunc(r.everyHours || 1)));
    return new Date(from.getTime() + h * 3600 * 1000);
  }
  const [hh, mm] = (r.time || "08:00").split(":").map((x) => Number(x) || 0);
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hh, mm, 0, 0);
  if (r.kind === "daily") {
    if (d <= from) d.setDate(d.getDate() + 1);
    return d;
  }
  // weekly: weekday 0 = Chủ nhật … 6 = Thứ bảy
  const wd = Math.max(0, Math.min(6, Math.trunc(r.weekday ?? 1)));
  let add = (wd - d.getDay() + 7) % 7;
  if (add === 0 && d <= from) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

export function validateRule(r: ScheduleRule): string | null {
  if (!["daily", "weekly", "hourly"].includes(r.kind)) return "Kiểu lịch không hợp lệ.";
  if (r.kind !== "hourly" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time ?? "")) return "Giờ chạy phải dạng HH:MM (ví dụ 08:30).";
  if (r.kind === "hourly" && !(r.everyHours >= 1 && r.everyHours <= 168)) return "Chu kỳ phải từ 1 đến 168 giờ.";
  return null;
}
