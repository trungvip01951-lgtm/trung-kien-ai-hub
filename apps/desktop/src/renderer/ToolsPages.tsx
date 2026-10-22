import { useCallback, useEffect, useState } from "react";
import type { BackupInfo, Settings } from "../shared/contract";
import { fmtDate } from "./util";

export function WindowsPage({ settings, onSettings }: { settings: Settings | null; onSettings: (s: Settings) => void }) {
  if (!settings) return <div className="page" />;
  return (
    <div className="page">
      <h1>Máy tính Windows</h1>
      <div className="card">
        <label className="check">
          <input type="checkbox" checked={settings.windowsEnabled} onChange={async (e) => onSettings(await window.hub.saveSettings({ ...settings, windowsEnabled: e.target.checked }))} />
          <span><b>Cho agent điều khiển ứng dụng Windows</b></span>
        </label>
      </div>
      <div className="note small">
        Agent dùng UI Automation của Windows (đọc đúng nút, ô nhập, chữ trong cửa sổ) thay vì bấm theo toạ độ; chỉ chụp màn hình khi không đọc được.
        <ul>
          <li><b>Tự làm:</b> liệt kê cửa sổ, đọc nội dung cửa sổ, đọc chữ trong ô, chụp màn hình.</li>
          <li><b>Hỏi anh trước:</b> bấm nút, điền chữ, gửi phím, bấm chuột, mở chương trình (mức "Được sửa file trong dự án").</li>
          <li>Việc "Chỉ đọc" không được điều khiển; việc "Đủ quyền" làm hết không hỏi.</li>
        </ul>
        Ví dụ giao việc: "Mở Excel tệp báo giá trong dự án, đọc tổng tiền ở sheet Tổng hợp" hoặc "Mở Notepad, ghi danh sách việc hôm nay".
      </div>
    </div>
  );
}

export function DocsPage() {
  return (
    <div className="page">
      <h1>Tài liệu: Excel, Word, PDF</h1>
      <div className="note small">
        Agent có sẵn công cụ làm việc với tài liệu, không cần cài Office:
        <ul>
          <li><b>Excel (.xlsx):</b> đọc bảng (theo sheet, vùng ô), ghi dữ liệu và công thức. Trước khi ghi đè, bản gốc được sao lưu vào thư mục dữ liệu app (office-backup).</li>
          <li><b>Word (.docx):</b> đọc chữ, tạo tài liệu mới (tiêu đề, đoạn, gạch đầu dòng), thay chữ giữ nguyên định dạng (có sao lưu bản gốc).</li>
          <li><b>PDF:</b> đọc PDF bằng công cụ đọc tệp có sẵn của agent; xuất PDF khổ A4 từ nội dung agent soạn.</li>
        </ul>
        Tệp trong thư mục dự án: đọc tự làm, ghi tự làm ở mức "Được sửa file trong dự án". Tệp ngoài dự án: hỏi anh trước.
        Tệp .xls/.doc đời cũ: mở bằng Excel/Word, lưu lại thành .xlsx/.docx (hoặc nhờ agent làm qua mục Máy tính Windows).
      </div>
    </div>
  );
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const REASON: Record<string, string> = { auto: "Tự động", manual: "Bấm tay", "before-restore": "Trước khi khôi phục", import: "Nhập từ ngoài" };

export function BackupSection() {
  const [list, setList] = useState<BackupInfo[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => { window.hub.listBackups().then(setList).catch(() => {}); }, []);
  useEffect(load, [load]);
  const act = async (fn: () => Promise<unknown>, done?: (r: unknown) => string | null) => {
    try { const r = await fn(); const t = done?.(r); if (t) setMsg({ ok: true, text: t }); } catch (e) { setMsg({ ok: false, text: String(e) }); }
    load();
  };
  return (
    <>
      <h2>Sao lưu và khôi phục</h2>
      <div className="muted small">
        App tự sao lưu mỗi ngày một lần khi mở (giữ 14 bản): lịch sử, Skills, kết nối, danh sách API key (đã mã hoá, chỉ dùng lại được trên máy này).
        Không gồm hồ sơ trình duyệt. Khôi phục: app khởi động lại, trạng thái hiện tại được cất thành một bản trước khi chép đè.
      </div>
      {msg && <div className={`alert ${msg.ok ? "info" : "danger"}`}>{msg.text}</div>}
      <div className="row">
        <button className="primary" onClick={() => void act(() => window.hub.createBackup(), () => "Đã sao lưu.")}>Sao lưu ngay</button>
        <button onClick={() => void act(() => window.hub.importBackup(), (r) => (r ? "Đã nhập bản sao lưu, chọn Khôi phục ở dòng mới." : null))}>Nhập bản sao lưu…</button>
      </div>
      {list.length === 0 ? <div className="card muted">Chưa có bản sao lưu.</div> : (
        <table className="table">
          <thead><tr><th>Thời gian</th><th>Loại</th><th>Phiên bản</th><th>Dung lượng</th><th></th></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id}>
                <td>{fmtDate(b.createdAt)}</td><td>{REASON[b.reason] ?? b.reason}</td><td>{b.appVersion}</td><td>{mb(b.bytes)}</td>
                <td><div className="row">
                  <button onClick={() => { if (confirm(`Khôi phục bản ${fmtDate(b.createdAt)}? App sẽ khởi động lại.`)) void act(() => window.hub.restoreBackup(b.id), (r) => (r as { message: string }).message); }}>Khôi phục</button>
                  <button onClick={() => void act(() => window.hub.exportBackup(b.id), (r) => (r ? `Đã xuất ra ${r}` : null))}>Xuất ra thư mục…</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
