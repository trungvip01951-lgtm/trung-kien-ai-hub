import { useCallback, useEffect, useState } from "react";
import type { BridgeView, ConnectionInfo, ConnectionKind } from "../shared/contract";
import { fmtDate } from "./util";

const PRESETS: { kind: Exclude<ConnectionKind, "custom">; label: string }[] = [
  { kind: "windsor", label: "Windsor.ai" },
  { kind: "sheets", label: "Google Trang tính" },
  { kind: "drive", label: "Google Drive" },
  { kind: "gmail", label: "Gmail" },
];

export function McpPage() {
  const [list, setList] = useState<ConnectionInfo[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [client, setClient] = useState<{ id: string; cid: string; sec: string } | null>(null);
  const [custom, setCustom] = useState({ name: "", url: "" });
  const load = useCallback(() => { window.hub.listConnections().then(setList).catch((e) => setMsg({ ok: false, text: String(e) })); }, []);
  useEffect(load, [load]);
  const act = async (id: string | null, fn: () => Promise<{ ok: boolean; message: string } | void>) => {
    setBusy(id); setMsg(null);
    try { const r = await fn(); if (r) setMsg({ ok: r.ok, text: r.message }); } catch (e) { setMsg({ ok: false, text: String(e) }); }
    setBusy(null); load();
  };
  const has = (k: ConnectionKind) => list.some((c) => c.kind === k);
  const googleMissing = list.some((c) => c.needsClientId && !c.hasClientId);

  return (
    <div className="page">
      <h1>MCP và công cụ</h1>
      <div className="note small">
        Kết nối dịch vụ để agent đọc và làm việc với dữ liệu của anh, qua máy chủ MCP chính thức của từng dịch vụ.
        Anh đăng nhập ngay trong trình duyệt; app chỉ giữ mã truy cập (mã hoá trên máy), không xem mật khẩu.
        Công cụ <b>đọc</b> (get, list, search…) agent tự dùng; công cụ <b>gửi/sửa</b> (gửi thư, ghi bảng tính, chạy hành động quảng cáo…) phải hỏi anh,
        trừ khi việc chạy ở chế độ "Đủ quyền". Kết nối mới có hiệu lực từ việc kế tiếp.
      </div>
      {msg && <div className={`alert ${msg.ok ? "info" : "danger"}`}>{msg.text}</div>}

      <div className="row">
        {PRESETS.map((p) => (
          <button key={p.kind} disabled={has(p.kind)} onClick={() => void act(null, () => window.hub.addConnection(p.kind))}>+ {p.label}</button>
        ))}
      </div>

      {list.length === 0 ? <div className="card muted">Chưa có kết nối. Bấm một nút ở trên để thêm.</div> : (
        <table className="table">
          <thead><tr><th>Dịch vụ</th><th>Trạng thái</th><th>Tên công cụ</th><th></th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b><div className="mono small muted wrap">{c.url}</div></td>
                <td>
                  <span className={`badge ${c.status === "connected" ? "done" : "warn"}`}>{c.status === "connected" ? "Đã kết nối" : "Chưa đăng nhập"}</span>
                  {!c.enabled && <span className="badge">Đang tắt</span>}
                  {c.connectedAt && <div className="small muted">Đăng nhập {fmtDate(c.connectedAt)}{c.canRefresh ? " · tự làm mới" : ""}</div>}
                  {c.needsClientId && !c.hasClientId && <div className="small">Cần OAuth Client ID</div>}
                  {c.lastError && <div className="small danger-text">{c.lastError}</div>}
                </td>
                <td className="mono small">{c.toolPrefix}…</td>
                <td>
                  <div className="row">
                    {c.needsClientId && <button onClick={() => setClient({ id: c.id, cid: "", sec: "" })}>{c.hasClientId ? "Đổi Client ID" : "Nhập Client ID"}</button>}
                    <button className="primary" disabled={busy === c.id} onClick={() => void act(c.id, () => window.hub.loginConnection(c.id))}>
                      {busy === c.id ? "Đang chờ đăng nhập…" : c.status === "connected" ? "Đăng nhập lại" : "Đăng nhập"}
                    </button>
                    <button onClick={() => void act(null, () => window.hub.setConnectionEnabled(c.id, !c.enabled))}>{c.enabled ? "Tắt" : "Bật"}</button>
                    {c.status === "connected" && <button onClick={() => void act(null, () => window.hub.logoutConnection(c.id))}>Đăng xuất</button>}
                    <button onClick={() => { if (confirm(`Xoá kết nối ${c.name}?`)) void act(null, () => window.hub.removeConnection(c.id)); }}>Xoá</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(googleMissing || list.some((c) => c.needsClientId)) && (
        <>
          <h2>Kết nối Google (Gmail, Drive, Trang tính): làm 1 lần</h2>
          <div className="card small">
            Đăng nhập: bấm <b>Đăng nhập</b> → Chrome anh đang dùng mở trang Google → chọn tài khoản → <b>Cho phép</b>, xong tự quay về app.
            <br />Riêng lần đầu, Google bắt mỗi phần mềm phải có "mã ứng dụng" (OAuth client) riêng. App Claude dùng mã của hãng Anthropic, app này
            không được dùng mã đó, nên anh tạo mã của anh 1 lần (miễn phí, khoảng 5 phút), dùng chung cho Gmail, Drive, Trang tính:
            <ol>
              <li>Mở <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">tạo dự án</a> (tên tuỳ ý, ví dụ "Trung Kien AI Hub") → Tạo.</li>
              <li>Bật dịch vụ: <a href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noreferrer">Sheets API</a>,{" "}
                <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">Drive API</a>,{" "}
                <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noreferrer">Gmail API</a> và các dịch vụ MCP{" "}
                (<span className="mono">sheetsmcp</span>, <span className="mono">drivemcp</span>, <span className="mono">gmailmcp</span>.googleapis.com): mở từng trang, bấm Enable.</li>
              <li><a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">Màn hình đồng ý</a>: Get started → loại External → mục Audience thêm email của anh vào Test users.</li>
              <li><a href="https://console.cloud.google.com/auth/clients/create" target="_blank" rel="noreferrer">Tạo client</a>: Application type chọn <b>Desktop app</b> → Create → bấm <b>Download JSON</b>.</li>
              <li>Quay lại đây bấm "Nhập Client ID" → "Chọn tệp JSON" → chọn tệp vừa tải. Sau đó bấm Đăng nhập từng dòng.</li>
            </ol>
            Máy chủ MCP của Google đang ở giai đoạn xem trước: nếu đăng nhập báo 403 là tài khoản chưa được Google mở, báo em.
          </div>
        </>
      )}

      <ClaudeBridge />

      <h2>Máy chủ MCP khác</h2>
      <div className="row">
        <input placeholder="Tên (ví dụ: Search Console)" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
        <input className="grow" placeholder="https://…/mcp" value={custom.url} onChange={(e) => setCustom({ ...custom, url: e.target.value })} />
        <button disabled={!custom.name.trim() || !custom.url.trim()} onClick={() => void act(null, async () => {
          const r = await window.hub.addConnection("custom", custom.name, custom.url);
          if (r.ok) setCustom({ name: "", url: "" });
          return r;
        })}>Thêm</button>
      </div>

      {client && (
        <div className="overlay">
          <div className="dialog">
            <h3>OAuth client của Google</h3>
            <div className="col">
              <button onClick={() => { const c = client; setClient(null); void act(null, () => window.hub.importGoogleClient(c.id)); }}>Chọn tệp JSON đã tải từ Google (nhanh nhất)</button>
              <div className="small muted">hoặc dán tay:</div>
              <input placeholder="Client ID (…apps.googleusercontent.com)" value={client.cid} onChange={(e) => setClient({ ...client, cid: e.target.value })} />
              <input placeholder="Client secret" type="password" value={client.sec} onChange={(e) => setClient({ ...client, sec: e.target.value })} />
              <div className="small muted">Lưu mã hoá trên máy, dùng chung cho Gmail, Drive, Trang tính.</div>
            </div>
            <div className="row end">
              <button onClick={() => setClient(null)}>Huỷ</button>
              <button className="primary" onClick={() => { const c = client; setClient(null); void act(null, () => window.hub.setConnectionClient(c.id, c.cid, c.sec)); }}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Nối app Claude (máy tính) / Claude Code vào Hub: chat trên Claude, việc giao sang Hub chạy bằng API key.
function ClaudeBridge() {
  const [b, setB] = useState<BridgeView | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { window.hub.bridgeInfo().then(setB).catch((e) => setMsg({ ok: false, text: String(e) })); }, []);
  const run = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setMsg(null);
    try { const r = await fn(); setMsg({ ok: r.ok, text: r.message }); } catch (e) { setMsg({ ok: false, text: String(e) }); }
  };
  if (!b) return null;
  const desktopJson = JSON.stringify({ mcpServers: { "trung-kien-hub": b.entry } }, null, 2);
  const codeCmd = ["claude", ...b.codeArgs.slice(0, -1), `'${b.codeArgs[b.codeArgs.length - 1]}'`].join(" ");
  return (
    <>
      <h2>Kết nối với app Claude</h2>
      <div className="card small">
        Chat trong <b>app Claude trên máy tính</b> hoặc <b>Claude Code</b>, rồi bảo "giao Hub làm … ở dự án …": Claude gọi công cụ <span className="mono">trung-kien-hub</span>,
        Hub chạy việc bằng <b>API key của Hub</b> (theo hạn mức, mức quyền mặc định trong Cài đặt, Skills và kết nối của dự án) rồi trả kết quả về khung chat Claude.
        Phần Claude trò chuyện vẫn tính vào gói Claude của anh; phần việc Hub làm tính vào API. Hộp hỏi quyền (nếu có) hiện ở cửa sổ Hub.
        Chỉ chạy khi Hub đang mở; chỉ chương trình trên máy này nối được (cổng 127.0.0.1 có mã bí mật).
      </div>
      {msg && <div className={`alert ${msg.ok ? "info" : "danger"}`}>{msg.text}</div>}
      <div className="row">
        <button className={b.enabled ? "" : "primary"} onClick={() => void window.hub.setBridgeEnabled(!b.enabled).then(setB).catch((e) => setMsg({ ok: false, text: String(e) }))}>
          {b.enabled ? "Tắt kết nối" : "Bật kết nối"}</button>
        <span className="small muted">{b.enabled ? `Đang bật (cổng ${b.port})` : "Đang tắt"}</span>
      </div>
      {b.enabled && (
        <>
          <div className="row">
            <button onClick={() => void run(() => window.hub.installBridge("desktop"))}>Cài vào app Claude (máy tính)</button>
            <button onClick={() => void run(() => window.hub.installBridge("code"))}>Cài vào Claude Code</button>
          </div>
          <details className="small">
            <summary>Tự khai báo bằng tay</summary>
            <div>App Claude: dán vào tệp <span className="mono">%APPDATA%\Claude\claude_desktop_config.json</span> (gộp vào mục mcpServers có sẵn):</div>
            <pre className="mono">{desktopJson}</pre>
            <div>Claude Code: chạy lệnh</div>
            <pre className="mono">{codeCmd}</pre>
          </details>
        </>
      )}
    </>
  );
}
