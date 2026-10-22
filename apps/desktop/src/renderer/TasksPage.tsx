import { useCallback, useEffect, useState } from "react";
import type { TaskRow } from "../shared/contract";
import { STATUS_LABEL, firstLine, fmtDate, usd } from "./util";

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [running, setRunning] = useState<number | null>(null);
  const load = useCallback(() => {
    window.hub.runningTaskId().then(setRunning).catch(() => {});
    window.hub.listTasks(20).then(setTasks).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const off = window.hub.onEvent((e) => {
      if (e.type === "task-started" || e.type === "task-finished") load();
    });
    return off;
  }, [load]);
  const stop = async () => {
    if (running != null) await window.hub.stopTask(running);
    load();
  };
  const current = running != null ? tasks.find((t) => t.id === running) : undefined;
  return (
    <div className="page">
      <h1>Công việc đang chạy</h1>
      {running != null ? (
        <div className="card row between">
          <div>
            <b>Đang chạy việc #{running}</b>
            {current && <div className="muted">{firstLine(current.prompt, 120)}</div>}
          </div>
          <button className="danger-btn" onClick={stop}>Dừng</button>
        </div>
      ) : (
        <div className="card muted">Hiện không có việc nào đang chạy.</div>
      )}
      <h2>20 việc gần nhất</h2>
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
    </div>
  );
}
