import { useCallback, useEffect, useState } from "react";
import { MODELS } from "../shared/contract";
import type { Effort, MemoryKind, MemoryNote, ModelId, Project, SpecialistInfo } from "../shared/contract";
import { EFFORTS, fmtDate } from "./util";

const KIND: Record<MemoryKind, string> = { rule: "Quy tắc", fact: "Sự thật đã kiểm", error: "Lỗi và cách sửa", progress: "Tiến độ", note: "Ghi chú" };

export function AgentsPage() {
  const [list, setList] = useState<SpecialistInfo[]>([]);
  const [edit, setEdit] = useState<SpecialistInfo | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => { window.hub.listSpecialists().then(setList).catch((e) => setMsg({ ok: false, text: String(e) })); }, []);
  useEffect(load, [load]);
  const save = async (next: SpecialistInfo[]) => {
    try { setList(await window.hub.saveSpecialists(next)); } catch (e) { setMsg({ ok: false, text: String(e) }); }
  };
  const put = (s: SpecialistInfo) => save(list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s]);
  return (
    <div className="page">
      <div className="row between">
        <h1>Agents</h1>
        <button onClick={() => setEdit({ id: "", name: "", description: "", prompt: "", model: "claude-sonnet-5-5", effort: "medium", enabled: true, builtin: false })}>+ Thêm Agent</button>
      </div>
      <div className="note small">
        Các AI chuyên môn chạy như AI phụ: trong một việc, AI chính tự giao phần việc cho đúng chuyên môn (đọc phần "Khi nào dùng"), mỗi AI có model và mức suy nghĩ riêng.
        Agent khai báo trong thư mục <span className="mono">.claude/agents</span> của dự án vẫn được nạp như trước. Thay đổi có hiệu lực từ việc kế tiếp.
      </div>
      {msg && <div className={`alert ${msg.ok ? "info" : "danger"}`}>{msg.text}</div>}
      <table className="table">
        <thead><tr><th>Agent</th><th>Khi nào dùng</th><th>Model</th><th></th></tr></thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.id}>
              <td><b>{s.name}</b><div className="mono small muted">{s.id}</div></td>
              <td className="wrap small">{s.description}</td>
              <td className="small">{MODELS.find((m) => m.id === s.model)?.label.split(" (")[0]}<div className="muted">{EFFORTS.find((e) => e.id === s.effort)?.label}</div></td>
              <td><div className="row">
                <button onClick={() => void put({ ...s, enabled: !s.enabled })}>{s.enabled ? "Tắt" : "Bật"}</button>
                <button onClick={() => setEdit(s)}>Sửa</button>
                {!s.builtin && <button onClick={() => { if (confirm(`Xoá ${s.name}?`)) void save(list.filter((x) => x.id !== s.id)); }}>Xoá</button>}
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <div className="overlay">
          <div className="dialog wide">
            <h3>{edit.builtin ? `Sửa ${edit.name}` : edit.id ? `Sửa ${edit.name}` : "Thêm Agent"}</h3>
            <div className="form-grid">
              <label>Tên<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label>Mã (chữ thường không dấu, gạch ngang)<input value={edit.id} disabled={edit.builtin || list.some((x) => x.id === edit.id && x !== edit)}
                onChange={(e) => setEdit({ ...edit, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></label>
              <label>Model<select value={edit.model} onChange={(e) => setEdit({ ...edit, model: e.target.value as ModelId })}>
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
              <label>Suy nghĩ<select value={edit.effort} onChange={(e) => setEdit({ ...edit, effort: e.target.value as Effort })}>
                {EFFORTS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
            </div>
            <label className="small muted">Khi nào dùng (AI chính đọc để chọn)<textarea rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
            <label className="small muted">Lời dặn cho Agent<textarea rows={6} value={edit.prompt} onChange={(e) => setEdit({ ...edit, prompt: e.target.value })} /></label>
            <div className="row end">
              <button onClick={() => setEdit(null)}>Huỷ</button>
              <button className="primary" disabled={!edit.name.trim() || !/^[a-z0-9-]{2,40}$/.test(edit.id) || !edit.description.trim() || !edit.prompt.trim()}
                onClick={() => { const e = edit; setEdit(null); void put(e); }}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MemoryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<number | null>(null);
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ id?: number; kind: MemoryKind; title: string; content: string; global: boolean } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { window.hub.listProjects().then((p) => { setProjects(p); setPid((cur) => cur ?? p[0]?.id ?? null); }).catch(() => {}); }, []);
  const load = useCallback(() => {
    window.hub.listMemory(pid, q.trim()).then(setNotes).catch((e) => setMsg({ ok: false, text: String(e) }));
  }, [pid, q]);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { const r = await fn(); if (ok) setMsg({ ok: true, text: typeof r === "string" ? r : ok }); } catch (e) { setMsg({ ok: false, text: String(e) }); }
    load();
  };
  return (
    <div className="page">
      <div className="row between">
        <h1>Bộ nhớ</h1>
        <div className="row">
          <button onClick={() => void run(async () => ((await window.hub.checkIntegrity()) ? "Cơ sở dữ liệu nguyên vẹn." : "Cơ sở dữ liệu có lỗi, hãy khôi phục bản sao lưu."), "x")}>Kiểm tra toàn vẹn</button>
          <button className="primary" onClick={() => setEdit({ kind: "rule", title: "", content: "", global: false })}>+ Thêm ghi chú</button>
        </div>
      </div>
      <div className="note small">
        Agent tự tìm ở đây (và trong lịch sử chat của dự án) khi cần bối cảnh cũ, và tự ghi quy tắc, lỗi đã sửa, tiến độ sau mỗi việc. Chỉ phần liên quan được nạp vào
        mỗi việc, nên dùng lâu không phải đọc lại toàn bộ. Không lưu mật khẩu, mã truy cập, số điện thoại.
      </div>
      {msg && <div className={`alert ${msg.ok ? "info" : "danger"}`}>{msg.text}</div>}
      <div className="row">
        <select value={pid ?? ""} onChange={(e) => setPid(e.target.value ? Number(e.target.value) : null)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="grow" placeholder="Tìm trong bộ nhớ…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {notes.length === 0 ? <div className="card muted">Chưa có ghi chú.</div> : (
        <table className="table">
          <thead><tr><th>Loại</th><th>Nội dung</th><th>Cập nhật</th><th></th></tr></thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id}>
                <td className="small">{KIND[n.kind]}{n.projectId == null && <div className="badge">Mọi dự án</div>}</td>
                <td className="wrap"><b>{n.title}</b><div className="small" style={{ whiteSpace: "pre-wrap" }}>{n.content}</div></td>
                <td className="small">{fmtDate(n.updatedAt)}</td>
                <td><div className="row">
                  <button onClick={() => setEdit({ id: n.id, kind: n.kind, title: n.title, content: n.content, global: n.projectId == null })}>Sửa</button>
                  <button onClick={() => { if (confirm("Xoá ghi chú này?")) void run(() => window.hub.deleteMemory(n.id)); }}>Xoá</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {edit && (
        <div className="overlay">
          <div className="dialog wide">
            <h3>{edit.id ? "Sửa ghi chú" : "Thêm ghi chú"}</h3>
            <div className="form-grid">
              <label>Loại<select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as MemoryKind })}>
                {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label>Tiêu đề<input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
            </div>
            <textarea rows={8} value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
            <label className="check"><input type="checkbox" checked={edit.global} onChange={(e) => setEdit({ ...edit, global: e.target.checked })} /><span>Áp dụng cho mọi dự án</span></label>
            <div className="row end">
              <button onClick={() => setEdit(null)}>Huỷ</button>
              <button className="primary" disabled={!edit.title.trim() || !edit.content.trim() || (!edit.global && pid == null)} onClick={() => {
                const e = edit; setEdit(null);
                void run(() => window.hub.saveMemory({ id: e.id, projectId: e.global ? null : pid, kind: e.kind, title: e.title, content: e.content }));
              }}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
