import { useEffect, useState } from "react";
import { MODELS } from "../shared/contract";
import type { ApiKeyInfo, Effort, ModelId, PermissionLevel, Settings } from "../shared/contract";
import { EFFORTS, PERMISSIONS } from "./util";

export function SettingsPage({ settings, onSettings, onKeyChanged }: {
  settings: Settings | null; onSettings: (s: Settings) => void; onKeyChanged: () => void;
}) {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState("");

  const reload = async () => { setKeys(await window.hub.listApiKeys()); onKeyChanged(); };
  useEffect(() => {
    window.hub.listApiKeys().then(setKeys).catch(() => {});
    window.hub.appVersion().then(setVersion).catch(() => {});
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { setKeyMsg({ ok: false, text: String(e) }); }
    await reload().catch(() => {});
    setBusy(false);
  };
  const addKey = () => run(async () => {
    const r = await window.hub.addApiKey(key.trim(), label.trim());
    setKeyMsg({ ok: r.ok, text: r.message });
    if (r.ok) { setKey(""); setLabel(""); }
  });
  const test = (k: ApiKeyInfo) => run(async () => {
    setKeyMsg({ ok: true, text: `Đang kiểm tra ${k.label}…` });
    const r = await window.hub.testApiKey(k.id);
    setKeyMsg({ ok: r.ok, text: `${k.label}: ${r.message}${r.costUsd ? ` (tốn ~${r.costUsd.toFixed(4)} USD)` : ""}` });
  });
  const remove = (k: ApiKeyInfo) => {
    if (!window.confirm(`Xoá ${k.label} (…${k.last4}) khỏi app? Key trong Claude Console không bị ảnh hưởng.`)) return;
    void run(async () => { await window.hub.removeApiKey(k.id); setKeyMsg({ ok: true, text: `Đã xoá ${k.label}.` }); });
  };
  const move = (k: ApiKeyInfo, d: -1 | 1) => run(() => window.hub.moveApiKey(k.id, d));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN") : "—");

  const patch = async (p: Partial<Settings>) => {
    if (!settings) return;
    try {
      onSettings(await window.hub.saveSettings({ ...settings, ...p }));
    } catch { /* giữ nguyên giá trị cũ */ }
  };

  return (
    <div className="page">
      <h1>Cài đặt</h1>
      <h2>API key</h2>
      <div className="card">
        <div className="muted small">
          App dùng key theo thứ tự từ trên xuống. Key hết tiền, sai hoặc bị từ chối ngay từ đầu thì tự chuyển sang key kế tiếp và chạy lại việc đó.
          Nếu hết tiền giữa chừng (đã sửa file, chạy lệnh) thì dừng để không làm trùng; gõ "tiếp tục" để làm tiếp bằng key kế tiếp.
          Key vừa lỗi được xếp xuống cuối trong 30 phút. Hạn mức chi phí tính chung cho tất cả key.
        </div>
        {keys.length === 0 ? (
          <div className="row"><span className="badge error">Chưa có key</span></div>
        ) : (
          <table className="table">
            <thead><tr><th>#</th><th>Tên</th><th>Key</th><th>Dùng gần nhất</th><th>Lỗi gần nhất</th><th></th></tr></thead>
            <tbody>
              {keys.map((k, i) => (
                <tr key={k.id}>
                  <td>{k.priority}</td>
                  <td>{k.label}</td>
                  <td className="mono">…{k.last4}</td>
                  <td>{when(k.lastUsedAt)}</td>
                  <td>{k.lastError ? <span className="text-danger">{k.lastError} ({when(k.lastErrorAt)})</span> : "—"}</td>
                  <td className="nowrap">
                    <button disabled={busy || i === 0} onClick={() => move(k, -1)} title="Ưu tiên cao hơn">↑</button>
                    <button disabled={busy || i === keys.length - 1} onClick={() => move(k, 1)} title="Ưu tiên thấp hơn">↓</button>
                    <button disabled={busy} onClick={() => test(k)}>Kiểm tra</button>
                    <button className="danger-btn" disabled={busy} onClick={() => remove(k)}>Xoá</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row">
          <input style={{ width: 180 }} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Tên, vd: Key ${keys.length + 1}`} />
          <input className="grow" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Dán API key vào đây" />
          <button className="primary" disabled={busy || !key.trim()} onClick={addKey}>Thêm key</button>
        </div>
        <div className="muted small">Kiểm tra sẽ gọi thử Haiku bằng đúng key đó, tốn khoảng vài phần nghìn USD.</div>
        {keyMsg && <div className={`alert ${keyMsg.ok ? "info" : "danger"}`}>{keyMsg.text}</div>}
      </div>

      <h2>Mặc định</h2>
      {settings && (
        <div className="card">
          <div className="form-grid">
            <label>Model
              <select value={settings.defaultModel} onChange={(e) => patch({ defaultModel: e.target.value as ModelId })}>
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>Mức suy nghĩ
              <select value={settings.defaultEffort} onChange={(e) => patch({ defaultEffort: e.target.value as Effort })}>
                {EFFORTS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>Quyền
              <select value={settings.defaultPermission} onChange={(e) => patch({ defaultPermission: e.target.value as PermissionLevel })}>
                {PERMISSIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>Giao diện
              <select value={settings.theme} onChange={(e) => patch({ theme: e.target.value as Settings["theme"] })}>
                <option value="system">Theo hệ thống</option>
                <option value="light">Sáng</option>
                <option value="dark">Tối</option>
              </select>
            </label>
          </div>
        </div>
      )}
      <div className="muted small">Trung Kiên AI Hub · phiên bản {version || "…"}</div>
    </div>
  );
}
