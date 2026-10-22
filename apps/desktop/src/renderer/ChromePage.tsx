import { useEffect, useState } from "react";
import type { Settings, SiteMode } from "../shared/contract";

const MODES: { id: SiteMode; label: string; hint: string }[] = [
  { id: "read", label: "Chỉ xem", hint: "đọc trang, không bấm/gõ" },
  { id: "ask", label: "Hỏi từng thao tác", hint: "mỗi lần bấm/gõ đều hỏi anh" },
  { id: "auto", label: "Tự làm thao tác thường", hint: "đăng, lưu, gửi, xoá, thanh toán, đăng nhập vẫn hỏi" },
];

// "https://www.abc.vn/wp-admin" → "abc.vn" (gồm cả tên miền con)
export function normalizeHost(s: string): string {
  const t = s.trim().toLowerCase();
  try { return new URL(t.includes("://") ? t : `https://${t}`).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export function ChromePage({ settings, onSettings }: { settings: Settings | null; onSettings: (s: Settings) => void }) {
  const [host, setHost] = useState("");
  const [mode, setMode] = useState<SiteMode>("ask");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [token, setToken] = useState("");
  useEffect(() => { window.hub.hasExtensionToken().then(setHasToken).catch(() => {}); }, []);
  if (!settings) return <div className="page" />;
  const c = settings.chrome;
  const save = async (chrome: Settings["chrome"]) => {
    try { onSettings(await window.hub.saveSettings({ ...settings, chrome })); } catch (e) { setMsg({ ok: false, text: String(e) }); }
  };
  const add = () => {
    const h = normalizeHost(host);
    if (!h) { setMsg({ ok: false, text: "Tên miền không hợp lệ." }); return; }
    setHost("");
    setMsg(null);
    void save({ ...c, sites: [...c.sites.filter((s) => s.host !== h), { host: h, mode }].sort((a, b) => a.host.localeCompare(b.host)) });
  };
  const open = async () => {
    setOpening(true);
    try { const r = await window.hub.openBrowserProfile(); setMsg({ ok: r.ok, text: r.message }); } catch (e) { setMsg({ ok: false, text: String(e) }); }
    setOpening(false);
  };
  return (
    <div className="page">
      <div className="row between">
        <h1>Chrome</h1>
        {c.mode === "app" && <button className="primary" disabled={opening} onClick={() => void open()}>Mở trình duyệt của app để đăng nhập</button>}
      </div>
      <div className="note small">
        Agent điều khiển trình duyệt bằng Playwright MCP với <b>hồ sơ riêng của app</b> (không dùng hồ sơ Chrome anh đang dùng hằng ngày).
        Muốn agent làm việc trên trang cần đăng nhập: bấm nút trên, tự đăng nhập, đóng cửa sổ rồi giao việc. App không xem, không lưu mật khẩu;
        agent không đọc cookie, không vượt CAPTCHA.
      </div>
      {msg && <div className={`alert ${msg.ok ? "info" : "danger"}`}>{msg.text}</div>}

      <div className="card">
        <label className="check">
          <input type="checkbox" checked={c.enabled} onChange={(e) => void save({ ...c, enabled: e.target.checked })} />
          <span><b>Cho agent điều khiển trình duyệt</b></span>
        </label>
        <div className="row">
          <span className="small muted">Dùng trình duyệt nào:</span>
          <select value={c.mode} onChange={(e) => void save({ ...c, mode: e.target.value as Settings["chrome"]["mode"] })}>
            <option value="app">Trình duyệt riêng của app (an toàn hơn)</option>
            <option value="main">Chrome anh đang dùng (dùng sẵn tài khoản đã đăng nhập)</option>
          </select>
        </div>
        <div className="row">
          <span className="small muted">Trình duyệt đã cài trên máy:</span>
          <select value={c.browser} onChange={(e) => void save({ ...c, browser: e.target.value as Settings["chrome"]["browser"] })}>
            <option value="chrome">Google Chrome</option>
            <option value="msedge">Microsoft Edge</option>
          </select>
        </div>
      </div>

      {c.mode === "main" && (
        <div className="card small">
          <b>Nối với Chrome anh đang dùng</b> (làm 1 lần). Tiện ích Claude trong Chrome không dùng được với app vì app chạy bằng API key
          (tiện ích đó chỉ nhận đăng nhập claude.ai), nên app dùng tiện ích chính thức của Playwright:
          <ol>
            <li>Mở Chrome, cài <a href="https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm" target="_blank" rel="noreferrer">Playwright Extension</a>.</li>
            <li>Bấm biểu tượng tiện ích, chép mã (token) hiện ra, dán vào ô dưới rồi Lưu. Không có mã thì mỗi lần agent dùng trình duyệt, Chrome sẽ hỏi anh bấm cho phép.</li>
            <li>Giao việc như bình thường; agent mở tab mới trong Chrome của anh và dùng được các tài khoản anh đã đăng nhập. Chrome phải đang mở.</li>
          </ol>
          <div className="row">
            <input className="grow" type="password" placeholder={hasToken ? "Đã lưu mã (nhập mã mới để thay)" : "Mã của Playwright Extension"} value={token} onChange={(e) => setToken(e.target.value)} />
            <button disabled={!token.trim()} onClick={async () => { await window.hub.setExtensionToken(token); setToken(""); setHasToken(true); setMsg({ ok: true, text: "Đã lưu mã (mã hoá trên máy)." }); }}>Lưu</button>
            {hasToken && <button onClick={async () => { await window.hub.setExtensionToken(""); setHasToken(false); }}>Xoá mã</button>}
          </div>
          <div className="muted">Lưu ý: chế độ này agent chạm được mọi tài khoản đang đăng nhập trong Chrome của anh. Quyền theo website bên dưới vẫn áp dụng.</div>
        </div>
      )}

      <h2>Website được phép</h2>
      <div className="muted small">
        Website ngoài danh sách: mở trang hay thao tác đều hỏi anh. Tên miền con đi theo tên miền chính (abc.vn gồm cả www.abc.vn).
        Việc chạy ở chế độ "Chỉ đọc" thì chỉ xem trang trên mọi website.
      </div>
      <div className="row">
        <input className="grow" placeholder="Ví dụ: search.google.com hoặc https://abc.vn/wp-admin" value={host}
          onChange={(e) => setHost(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <select value={mode} onChange={(e) => setMode(e.target.value as SiteMode)}>
          {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <button onClick={add}>Thêm</button>
      </div>
      {c.sites.length === 0 ? <div className="card muted">Chưa có website nào.</div> : (
        <table className="table">
          <thead><tr><th>Website</th><th>Quyền</th><th></th></tr></thead>
          <tbody>
            {c.sites.map((s) => (
              <tr key={s.host}>
                <td className="mono">{s.host}</td>
                <td>
                  <select value={s.mode} onChange={(e) => void save({ ...c, sites: c.sites.map((x) => (x.host === s.host ? { ...x, mode: e.target.value as SiteMode } : x)) })}>
                    {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <div className="small muted">{MODES.find((m) => m.id === s.mode)?.hint}</div>
                </td>
                <td><button onClick={() => void save({ ...c, sites: c.sites.filter((x) => x.host !== s.host) })}>Xoá</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
