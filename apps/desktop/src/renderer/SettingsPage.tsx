import { useEffect, useState } from "react";
import { MODELS } from "../shared/contract";
import type { Effort, ModelId, PermissionLevel, Settings } from "../shared/contract";
import { EFFORTS, PERMISSIONS } from "./util";

export function SettingsPage({ settings, onSettings, onKeyChanged }: {
  settings: Settings | null; onSettings: (s: Settings) => void; onKeyChanged: () => void;
}) {
  const [hasKey, setHasKey] = useState(false);
  const [key, setKey] = useState("");
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    window.hub.hasApiKey().then(setHasKey).catch(() => {});
    window.hub.appVersion().then(setVersion).catch(() => {});
  }, []);

  const saveKey = async () => {
    if (!key.trim()) return;
    setBusy(true);
    try {
      const r = await window.hub.setApiKey(key.trim());
      setKeyMsg({ ok: r.ok, text: r.message });
      if (r.ok) setKey("");
    } catch (e) {
      setKeyMsg({ ok: false, text: String(e) });
    }
    setHasKey(await window.hub.hasApiKey());
    onKeyChanged();
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    setKeyMsg({ ok: true, text: "Đang kiểm tra…" });
    try {
      const r = await window.hub.testApiKey();
      setKeyMsg({ ok: r.ok, text: `${r.message}${r.costUsd ? ` (tốn ~${r.costUsd.toFixed(4)} USD)` : ""}` });
    } catch (e) {
      setKeyMsg({ ok: false, text: String(e) });
    }
    setBusy(false);
  };
  const clear = async () => {
    setBusy(true);
    await window.hub.clearApiKey();
    setHasKey(await window.hub.hasApiKey());
    setKeyMsg({ ok: true, text: "Đã xoá key." });
    onKeyChanged();
    setBusy(false);
  };

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
        <div className="row">
          <span className={`badge ${hasKey ? "done" : "error"}`}>{hasKey ? "Đã lưu key" : "Chưa có key"}</span>
        </div>
        <div className="row">
          <input className="grow" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Dán API key mới vào đây" />
          <button className="primary" disabled={busy || !key.trim()} onClick={saveKey}>Lưu</button>
        </div>
        <div className="row">
          <button disabled={busy || !hasKey} onClick={test}>Kiểm tra key</button>
          <button className="danger-btn" disabled={busy || !hasKey} onClick={clear}>Xoá key</button>
          <span className="muted small">Kiểm tra sẽ gọi thử Haiku, tốn khoảng vài phần nghìn USD.</span>
        </div>
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
