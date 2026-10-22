import { useCallback, useEffect, useState } from "react";
import type { InventoryRow, OldSession, Project } from "../shared/contract";
import { fmtDate } from "./util";

const mb = (n: number | null) => (n == null ? "" : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const list = (a: string[], empty = "—") => (a.length ? a.join(", ") : empty);

export function ProjectsPage({ onOpenConversation }: { onOpenConversation: (id: number) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [inv, setInv] = useState<{ rows: InventoryRow[]; scannedAt: string | null; truncated?: boolean }>({ rows: [], scannedAt: null });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [guide, setGuide] = useState<Project | null>(null);
  const [sessionsOf, setSessionsOf] = useState<Project | null>(null);

  const load = useCallback(() => {
    window.hub.listProjects().then(setProjects).catch((e) => setMsg({ ok: false, text: String(e) }));
    window.hub.lastInventory().then(setInv).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { setMsg({ ok: false, text: String(e) }); } };

  const scan = () => run(async () => {
    setScanning(true);
    try {
      const r = await window.hub.scanFolder();
      if (!r) return;
      setInv({ rows: (await window.hub.lastInventory()).rows, scannedAt: new Date().toISOString(), truncated: r.truncated });
      setMsg({ ok: true, text: `Quét ${r.root}: thấy ${r.rows.length} thư mục dự án${r.truncated ? " (thư mục quá lớn, chỉ quét 5.000 thư mục đầu)" : ""}. Không sửa, không chép gì.` });
    } finally { setScanning(false); }
  });

  const addFromInventory = (row: InventoryRow) => run(async () => {
    const r = await window.hub.addProjectPath(row.path);
    setMsg({ ok: r.ok, text: r.message });
    load();
  });

  return (
    <div className="page">
      <div className="row between">
        <h1>Dự án</h1>
        <div className="row">
          <button onClick={() => void scan()} disabled={scanning}>{scanning ? "Đang quét…" : "Quét thư mục"}</button>
          <button className="primary" onClick={() => run(async () => { await window.hub.addProject(); load(); })}>Thêm dự án</button>
        </div>
      </div>
      {msg && <div className={`alert ${msg.ok ? "info" : "danger"}`}>{msg.text}</div>}

      {projects.length === 0 ? (
        <div className="card muted">Chưa có dự án. Bấm "Thêm dự án" để chọn một thư mục, hoặc "Quét thư mục" để tìm dự án cũ.</div>
      ) : (
        <table className="table">
          <thead><tr><th>Tên</th><th>Đường dẫn</th><th>Hướng dẫn dự án</th><th></th></tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b><div className="small muted">{fmtDate(p.createdAt)}</div></td>
                <td className="mono wrap">{p.path}</td>
                <td className="wrap small">{p.instructions ? p.instructions.split("\n")[0].slice(0, 80) : <span className="muted">Chưa có</span>}</td>
                <td>
                  <div className="row">
                    <button onClick={() => setGuide(p)}>Hướng dẫn dự án</button>
                    <button onClick={() => setSessionsOf(p)}>Phiên Claude Code cũ</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Kiểm kê dự án (PROJECT_INVENTORY)</h2>
      <div className="muted small">
        Chỉ đọc trong thư mục anh chọn: CLAUDE.md, .claude (skills, agents, hooks), .mcp.json, sổ bàn giao/nhật ký/TODO, git, phiên Claude Code cũ.
        "Đang làm" và "Bước tiếp theo" trích nguyên văn mục cuối sổ bàn giao. Dự án Thịnh Vượng chỉ ghi tên, không đọc, không cho thêm.
        {inv.scannedAt && <> Lần quét gần nhất: {fmtDate(inv.scannedAt)}.</>}
      </div>
      {inv.rows.length === 0 ? (
        <div className="card muted">Chưa quét. Bấm "Quét thư mục" và chọn thư mục chứa các dự án (ví dụ Documents\Claude).</div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr>
              <th>Dự án</th><th>Trạng thái</th><th>Đang làm / bước tiếp theo</th><th>Hướng dẫn hệ thống</th><th>Skills / Agents</th>
              <th>MCP</th><th>Tài liệu</th><th>Phụ thuộc · git</th><th>Cập nhật</th><th>Chuyển giao</th>
            </tr></thead>
            <tbody>
              {inv.rows.map((r) => (
                <tr key={r.path} className={r.excluded ? "excluded" : ""}>
                  <td><b>{r.name}</b><div className="mono small muted wrap">{r.path}</div>{r.projectId && <div className="small">ID {r.projectId}</div>}</td>
                  <td>{r.excluded ? <span className="badge error">Không đưa vào</span>
                    : r.settingsWarning ? <span className="badge warn" title={r.settingsWarning}>Cài đặt cần sửa</span>
                    : r.handoffFile ? <span className="badge done">Có bàn giao</span> : <span className="badge">Chưa có bàn giao</span>}</td>
                  <td className="wrap small">
                    {r.excluded ?? <>
                      {r.current && <div>{r.current}</div>}
                      {r.next && <div><b>Tiếp:</b> {r.next}</div>}
                      {!r.current && !r.next && <span className="muted">Không trích được (xem tài liệu)</span>}
                      {r.handoffFile && <div className="muted mono">{r.handoffFile}</div>}
                    </>}
                  </td>
                  <td className="small">{list(r.instructions)}{r.hooks && <div>có hooks</div>}</td>
                  <td className="wrap small">{list(r.skills)}{r.agents.length > 0 && <div>Agents: {r.agents.join(", ")}</div>}{r.commands > 0 && <div>{r.commands} lệnh</div>}</td>
                  <td className="small">{list(r.mcp)}</td>
                  <td className="wrap small mono">{list(r.docs)}</td>
                  <td className="wrap small">{list(r.deps, "")}<div className="muted">{r.git}</div></td>
                  <td className="small">{fmtDate(r.updatedAt)}{r.oldSessions != null && <div>{r.oldSessions} phiên cũ</div>}</td>
                  <td>
                    {r.excluded ? "—" : r.projectId ? <span className="badge done">Đã có trong app</span>
                      : <button onClick={() => void addFromInventory(r)}>Thêm vào app</button>}
                    {r.settingsWarning && <div className="small">{r.settingsWarning}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {guide && <GuideDialog project={guide} onClose={() => { setGuide(null); load(); }} />}
      {sessionsOf && <SessionsDialog project={sessionsOf} onClose={() => setSessionsOf(null)}
        onOpen={(id) => { setSessionsOf(null); onOpenConversation(id); }} />}
    </div>
  );
}

// Hướng dẫn dự án: anh Trung soạn trong app, gửi kèm mọi việc của dự án này; CLAUDE.md của dự án chỉ xem.
function GuideDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [text, setText] = useState(project.instructions);
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [saved, setSaved] = useState("");
  useEffect(() => {
    (async () => {
      const out: { name: string; text: string }[] = [];
      for (const f of ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md", "AGENTS.md"]) {
        const t = await window.hub.readProjectFile(project.id, f);
        if (t != null) out.push({ name: f, text: t });
      }
      setFiles(out);
    })().catch(() => {});
  }, [project.id]);
  const save = async () => {
    await window.hub.saveProjectInstructions(project.id, text);
    setSaved(`Đã lưu lúc ${new Date().toLocaleTimeString("vi-VN")}.`);
  };
  return (
    <div className="overlay">
      <div className="dialog wide">
        <h3>Hướng dẫn dự án: {project.name}</h3>
        <div className="small muted">
          Viết quy tắc riêng của dự án (cách làm, giọng văn, việc cấm, tài liệu cần đọc). App gửi kèm mỗi việc chạy trong dự án này,
          kể cả hội thoại đang dở; không ghi vào thư mục dự án và không ảnh hưởng dự án khác.
        </div>
        <textarea rows={10} value={text} maxLength={20000} onChange={(e) => { setText(e.target.value); setSaved(""); }}
          placeholder={"Ví dụ:\n- Trả lời tiếng Việt, ngày dd/mm/yyyy.\n- Đầu việc đọc ho-so/BAN-GIAO.md.\n- Không sửa giá, hotline khi chưa hỏi anh."} />
        <div className="row between">
          <span className="small muted">{text.length.toLocaleString("vi-VN")} / 20.000 ký tự {saved && `· ${saved}`}</span>
          <div className="row">
            <button onClick={onClose}>Đóng</button>
            <button className="primary" onClick={() => void save()}>Lưu</button>
          </div>
        </div>
        <h2>Hướng dẫn có sẵn trong thư mục dự án (agent tự đọc, chỉ xem)</h2>
        {files.length === 0 ? <div className="muted small">Không có CLAUDE.md hay AGENTS.md.</div> : files.map((f) => (
          <div key={f.name}><div className="mono small">{f.name}</div><div className="preview-file mono small">{f.text}</div></div>
        ))}
      </div>
    </div>
  );
}

function SessionsDialog({ project, onClose, onOpen }: { project: Project; onClose: () => void; onOpen: (conversationId: number) => void }) {
  const [rows, setRows] = useState<OldSession[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { window.hub.listOldSessions(project.id).then(setRows).catch((e) => setErr(String(e))); }, [project.id]);
  const open = async (s: OldSession) => {
    const r = await window.hub.importOldSession(project.id, s.sessionId);
    if (r.ok && r.conversationId) onOpen(r.conversationId); else setErr(r.message);
  };
  return (
    <div className="overlay">
      <div className="dialog wide">
        <h3>Phiên Claude Code cũ: {project.name}</h3>
        <div className="small muted">
          Đọc từ lịch sử Claude Code trên máy (chỉ đọc). "Tiếp tục trong Chat" mở lại đúng phiên đó: agent nhớ toàn bộ việc cũ.
          Phiên lớn tốn nhiều token mỗi lượt; với phiên lớn nên mở hội thoại mới và bảo agent đọc sổ bàn giao.
          Lịch sử Cowork/Claude Desktop không đọc được bằng cách chính thức nên không có ở đây.
        </div>
        {err && <div className="alert danger">{err}</div>}
        {rows == null ? <div className="muted">Đang đọc…</div> : rows.length === 0 ? <div className="card muted">Không có phiên Claude Code nào cho thư mục này.</div> : (
          <table className="table">
            <thead><tr><th>Phiên</th><th>Sửa lần cuối</th><th>Dung lượng</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.sessionId}>
                  <td className="wrap">{s.title}<div className="mono small muted">{s.gitBranch ?? ""}</div></td>
                  <td>{fmtDate(s.lastModified)}</td>
                  <td>{mb(s.sizeBytes)}{(s.sizeBytes ?? 0) > 5 * 1024 * 1024 && <div><span className="badge warn">phiên lớn</span></div>}</td>
                  <td><button onClick={() => void open(s)}>{s.imported ? "Mở trong Chat" : "Tiếp tục trong Chat"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row end"><button onClick={onClose}>Đóng</button></div>
      </div>
    </div>
  );
}
