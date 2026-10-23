import { useCallback, useEffect, useState } from "react";
import type { Limits, Settings, TaskRow, UsageSummary } from "../shared/contract";
import { STATUS_LABEL, fmtDate, usd } from "./util";

function levelOf(percent: number, warn: number[]): "ok" | "warn" | "danger" {
  const sorted = [...warn].sort((a, b) => a - b);
  const reached = sorted.filter((w) => percent >= w).length;
  if (reached === 0) return "ok";
  if (reached >= sorted.length) return "danger";
  return "warn";
}

function Meter({ label, used, limit, warn }: { label: string; used: number; limit: number; warn: number[] }) {
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  return (
    <div className="meter">
      <div className="row between">
        <span>{label}</span>
        <b>{usd(used)} / {usd(limit)} USD ({pct.toFixed(0)}%)</b>
      </div>
      <div className="bar"><div className={`fill ${levelOf(pct, warn)}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
    </div>
  );
}

export function CostPage({ settings, onSettings }: { settings: Settings | null; onSettings: (s: Settings) => void }) {
  const [sum, setSum] = useState<UsageSummary | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [form, setForm] = useState<Limits | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    window.hub.usageSummary().then((s) => { setSum(s); setForm((f) => f ?? s.limits); }).catch(() => {});
    window.hub.listTasks(50).then(setTasks).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const off = window.hub.onEvent((e) => { if (e.type === "task-finished" || e.type === "usage") load(); });
    return off;
  }, [load]);

  const num = (k: keyof Limits) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [k]: Number(e.target.value) } : f));

  const save = async () => {
    if (!form) return;
    const day = Math.round(form.cycleStartDay);
    if (day < 1 || day > 28) { setMsg("Ngày bắt đầu kỳ phải từ 1 đến 28."); return; }
    if ([form.perTaskUsd, form.dailyUsd, form.monthlyUsd].some((v) => !(v >= 0))) { setMsg("Hạn mức phải là số không âm."); return; }
    try {
      const base = settings ?? (await window.hub.getSettings());
      const saved = await window.hub.saveSettings({ ...base, limits: { ...base.limits, ...form, cycleStartDay: day } });
      onSettings(saved);
      setForm(saved.limits);
      setMsg("Đã lưu hạn mức.");
      load();
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <div className="page">
      <h1>Chi phí API</h1>
      {sum && (
        <div className="card">
          <Meter label="Hôm nay" used={sum.todayUsd} limit={sum.limits.dailyUsd} warn={sum.limits.warnPercents} />
          <Meter label={`Kỳ này (từ ${fmtDate(sum.cycleStart).split(",")[0]})`} used={sum.cycleUsd} limit={sum.limits.monthlyUsd} warn={sum.limits.warnPercents} />
          <div className="row between">
            <span>Còn được dùng cho việc kế tiếp</span>
            <b>{usd(sum.remainingForNextTaskUsd)} USD</b>
          </div>
          {sum.blockedReason && <div className="alert danger">{sum.blockedReason}</div>}
        </div>
      )}
      <div className="note">Số liệu là ước tính từ SDK, không phải hoá đơn. Số dư thật xem trong Claude Console. Nên đặt thêm giới hạn chi tiêu trong Console.</div>

      <h2>Hạn mức</h2>
      {form && (
        <div className="card">
          <div className="form-grid">
            <label>Mỗi việc (USD)<input type="number" min="0" step="0.01" value={form.perTaskUsd} onChange={num("perTaskUsd")} /></label>
            <label>Mỗi ngày (USD)<input type="number" min="0" step="0.01" value={form.dailyUsd} onChange={num("dailyUsd")} /></label>
            <label>Mỗi kỳ (USD)<input type="number" min="0" step="0.01" value={form.monthlyUsd} onChange={num("monthlyUsd")} /></label>
            <label>Ngày bắt đầu kỳ (1–28)<input type="number" min="1" max="28" step="1" value={form.cycleStartDay} onChange={num("cycleStartDay")} /></label>
          </div>
          <div className="row">
            <button className="primary" onClick={save}>Lưu hạn mức</button>
            {msg && <span className="muted">{msg}</span>}
          </div>
        </div>
      )}

      <h2>50 việc gần nhất</h2>
      <table className="table">
        <thead><tr><th>Thời gian</th><th>Model</th><th>Trạng thái</th><th>Token vào/ra</th><th>Chi phí (USD)</th></tr></thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>{fmtDate(t.createdAt)}</td>
              <td>{t.model}</td>
              <td>{STATUS_LABEL[t.status]}</td>
              <td>{(t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens).toLocaleString("vi-VN")} / {t.outputTokens.toLocaleString("vi-VN")}</td>
              <td>{t.costIsEstimate ? "~" : ""}{usd(t.costUsd)}</td>
            </tr>
          ))}
          {tasks.length === 0 && <tr><td colSpan={5} className="muted">Chưa có việc nào.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
