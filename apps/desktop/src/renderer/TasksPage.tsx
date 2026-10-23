import { useCallback, useEffect, useState } from "react";
import { MODELS } from "../shared/contract";
import type { Effort, ModelId, PermissionLevel, Project, QueueItem, Schedule, TaskRow } from "../shared/contract";
import { EFFORTS, PERMISSIONS, STATUS_LABEL, firstLine, fmtDate, usd } from "./util";

const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const Q_LABEL: Record<QueueItem["status"], string> = { waiting: "Đang chờ", started: "Đã chạy", failed: "Không chạy được", cancelled: "Đã huỷ" };
type Draft = Omit<Schedule, "id" | "lastRunAt" | "nextRunAt" | "lastTaskId"> & { id?: number };

const ruleText = (s: Schedule) => (s.kind === "hourly" ? `Mỗi ${s.everyHours} giờ` : s.kind === "daily" ? `Hằng ngày ${s.time}` : `${WEEKDAYS[s.weekday]} hằng tuần ${s.time}`);

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [running, setRunning] = useState<{ taskId: number; conversationId: number }[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => {
    window.hub.runningTasks().then(setRunning).catch(() => {});
    window.hub.listTasks(30).then(setTasks).catch(() => {});
    window.hub.listQueue().then(setQueue).catch(() => {});
    window.hub.listSchedules().then(setSchedules).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.hub.listProjects().then(setProjects).catch(() => {});
    const off = window.hub.onEvent((e) => { if (e.type === "task-started" || e.type === "task-finished" || e.type === "queue-failed") load(); });
    const t = setInterval(load, 15000);
    return () => { off(); clearInterval(t); };
  }, [load]);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const projectName = (id: number) => projects.find((p) => p.id === id)?.name ?? `#${id}`;
  const newDraft = (): Draft => ({ name: "", projectId: projects[0]?.id ?? 0, prompt: "", model: "claude-sonnet-5-5", effort: "medium", permission: "read",
    enabled: true, kind: "daily", time: "08:00", weekday: 1, everyHours: 6 });
  const save = async () => {
    if (!draft) return;
    try { await window.hub.saveSchedule(draft); setDraft(null); setMsg({ ok: true, text: "Đã lưu lịch." }); } catch (e) { setMsg({ ok: false, text: String(e).replace(/^Error: (Error invoking remote method '[^']+': )?(Error: )?/, "") }); }
    load();
  };
  const waiting = queue.filter((q) => q.status === "waiting");

  return (
    <div className="page">
      <h1>Công việc đang chạy</h1>
      {msg && <div className={`alert ${msg.ok ? "info" : "danger"}`}>{msg.text}</div>}
      {running.length === 0 ? <div className="card muted">Hiện không có việc nào đang chạy.</div> : running.map((r) => {
        const t = byId.get(r.taskId);
        return (
          <div key={r.taskId} className="card row between">
            <div><b>Việc #{r.taskId}</b>{t && <div className="muted">{firstLine(t.prompt, 120)}</div>}</div>
            <button className="danger-btn" onClick={async () => { await window.hub.stopTask(r.taskId); load(); }}>Dừng</button>
          </div>
        );
      })}
      <div className="muted small">Chạy tối đa 5 hội thoại cùng lúc (trong mỗi việc, AI chính còn chia việc cho nhiều AI phụ chạy song song); mỗi việc giữ trước phần hạn mức của nó để tổng không vượt hạn mức ngày/kỳ.</div>

      <h2>Hàng đợi {waiting.length > 0 && `(${waiting.length} việc đang chờ)`}</h2>
      {queue.length === 0 ? <div className="card muted">Trống. Gửi việc khi đang bận, hoặc việc theo lịch, sẽ vào đây và tự chạy khi có chỗ.</div> : (
        <table className="table">
          <thead><tr><th>Thời gian</th><th>Nguồn</th><th>Việc</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {queue.slice(0, 30).map((q) => (
              <tr key={q.id}>
                <td>{fmtDate(q.createdAt)}</td>
                <td className="small">{q.source}</td>
                <td>{firstLine(q.input.prompt, 70)}<div className="small muted">{projectName(q.input.projectId)}</div></td>
                <td><span className={`badge ${q.status === "failed" ? "error" : q.status === "started" ? "done" : ""}`}>{Q_LABEL[q.status]}</span>
                  {q.taskId && <div className="small muted">việc #{q.taskId}</div>}{q.message && <div className="small">{q.message}</div>}</td>
                <td>{q.status === "waiting" && <button onClick={async () => { await window.hub.cancelQueue(q.id); load(); }}>Huỷ</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row between"><h2>Lịch chạy tự động</h2><button disabled={!projects.length} onClick={() => setDraft(newDraft())}>+ Thêm lịch</button></div>
      <div className="muted small">Lịch chỉ chạy khi app đang mở; lỡ giờ khi app tắt thì lúc mở app chạy bù một lần. Không có ai bấm đồng ý lúc việc theo lịch chạy,
        nên chọn quyền "Chỉ đọc" cho việc kiểm tra/báo cáo; chỉ chọn "Đủ quyền" khi chắc việc đó an toàn.</div>
      {schedules.length === 0 ? <div className="card muted">Chưa có lịch.</div> : (
        <table className="table">
          <thead><tr><th>Lịch</th><th>Việc</th><th>Lần chạy</th><th></th></tr></thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id}>
                <td><b>{s.name}</b><div className="small">{ruleText(s)}</div>{!s.enabled && <span className="badge">Đang tắt</span>}</td>
                <td className="wrap">{firstLine(s.prompt, 80)}<div className="small muted">{projectName(s.projectId)} · {PERMISSIONS.find((p) => p.id === s.permission)?.label}</div></td>
                <td className="small">{s.lastRunAt ? `Lần trước ${fmtDate(s.lastRunAt)}` : "Chưa chạy"}{s.nextRunAt && <div>Lần tới {fmtDate(s.nextRunAt)}</div>}
                  {s.lastTaskId && byId.get(s.lastTaskId) && <div>Kết quả: {STATUS_LABEL[byId.get(s.lastTaskId)!.status]}</div>}</td>
                <td><div className="row">
                  <button onClick={async () => { await window.hub.runScheduleNow(s.id); load(); }}>Chạy ngay</button>
                  <button onClick={() => setDraft({ ...s })}>Sửa</button>
                  <button onClick={async () => { if (confirm(`Xoá lịch ${s.name}?`)) { await window.hub.deleteSchedule(s.id); load(); } }}>Xoá</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>30 việc gần nhất</h2>
      <table className="table">
        <thead><tr><th>Thời gian</th><th>Việc</th><th>Trạng thái</th><th>Chi phí (USD)</th></tr></thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>{fmtDate(t.createdAt)}</td>
              <td>{firstLine(t.prompt, 80)}</td>
              <td><span className={`badge ${t.status}`}>{STATUS_LABEL[t.status]}</span></td>
              <td>{t.costIsEstimate ? "~" : ""}{usd(t.costUsd)}</td>
            </tr>
          ))}
          {tasks.length === 0 && <tr><td colSpan={4} className="muted">Chưa có việc nào.</td></tr>}
        </tbody>
      </table>

      {draft && (
        <div className="overlay">
          <div className="dialog wide">
            <h3>{draft.id ? "Sửa lịch" : "Thêm lịch"}</h3>
            <div className="form-grid">
              <label>Tên<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ví dụ: Báo cáo quảng cáo sáng" /></label>
              <label>Dự án<select value={draft.projectId} onChange={(e) => setDraft({ ...draft, projectId: Number(e.target.value) })}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label>Lặp lại<select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })}>
                <option value="daily">Hằng ngày</option><option value="weekly">Hằng tuần</option><option value="hourly">Mỗi N giờ</option></select></label>
              {draft.kind === "hourly"
                ? <label>Mỗi bao nhiêu giờ<input type="number" min={1} max={168} value={draft.everyHours} onChange={(e) => setDraft({ ...draft, everyHours: Number(e.target.value) })} /></label>
                : <label>Giờ chạy<input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></label>}
              {draft.kind === "weekly" && <label>Thứ<select value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>
                {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}</select></label>}
              <label>Model<select value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value as ModelId })}>
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
              <label>Suy nghĩ<select value={draft.effort} onChange={(e) => setDraft({ ...draft, effort: e.target.value as Effort })}>
                {EFFORTS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
              <label>Quyền<select value={draft.permission} onChange={(e) => setDraft({ ...draft, permission: e.target.value as PermissionLevel })}>
                {PERMISSIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
            </div>
            <label className="small muted">Nội dung việc
              <textarea rows={5} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} placeholder="Ví dụ: Lấy số liệu Google Ads hôm qua qua Windsor, ghi vào bảng tính báo cáo, tóm tắt 5 dòng." />
            </label>
            <label className="check"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /><span>Bật lịch</span></label>
            <div className="row end"><button onClick={() => setDraft(null)}>Huỷ</button><button className="primary" onClick={() => void save()}>Lưu</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
