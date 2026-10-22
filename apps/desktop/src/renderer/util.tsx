import type { Effort, PermissionLevel, TaskStatus } from "../shared/contract";

export const EFFORTS: { id: Effort; label: string }[] = [
  { id: "low", label: "Thấp" },
  { id: "medium", label: "Vừa" },
  { id: "high", label: "Cao" },
  { id: "xhigh", label: "Rất cao" },
];

export const PERMISSIONS: { id: PermissionLevel; label: string }[] = [
  { id: "read", label: "Chỉ đọc" },
  { id: "write", label: "Được sửa file trong dự án" },
  { id: "full", label: "Đủ quyền (không hỏi)" },
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  running: "Đang chạy",
  done: "Xong",
  error: "Lỗi",
  stopped: "Đã dừng",
  budget: "Chạm hạn mức",
  interrupted: "Bị ngắt",
};

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("vi-VN", { hour12: false });
}

export function usd(n: number): string {
  return n.toFixed(4);
}

export function firstLine(s: string, max = 100): string {
  const line = (s.split("\n").find((l) => l.trim() !== "") ?? "").trim();
  return line.length > max ? line.slice(0, max) + "…" : line;
}

// Hiển thị đậm đoạn nằm giữa <b> và </b> mà không dùng innerHTML.
export function Snippet({ text }: { text: string }) {
  const parts = text.split(/(<b>|<\/b>)/);
  let bold = false;
  const out: React.ReactNode[] = [];
  parts.forEach((p, i) => {
    if (p === "<b>") bold = true;
    else if (p === "</b>") bold = false;
    else if (p) out.push(bold ? <b key={i}>{p}</b> : <span key={i}>{p}</span>);
  });
  return <>{out}</>;
}

export function Placeholder({ title }: { title: string }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <div className="card muted">Sẽ có ở mốc sau.</div>
    </div>
  );
}
