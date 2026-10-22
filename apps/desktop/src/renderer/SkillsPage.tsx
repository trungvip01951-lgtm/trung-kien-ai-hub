import { useCallback, useEffect, useState } from "react";
import type { SkillImportPreview, SkillInfo } from "../shared/contract";
import { fmtDate } from "./util";

const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const STATUS = { new: "Mới", replace: "Thay bản đang có (bản cũ được giữ)", error: "Lỗi" } as const;
// "20261022-140500Z" → giờ máy
const stampDate = (s: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})Z/.exec(s);
  return m ? fmtDate(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : s;
};

export function SkillsPage() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [preview, setPreview] = useState<SkillImportPreview | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [restoreOf, setRestoreOf] = useState<SkillInfo | null>(null);

  const load = useCallback(() => { window.hub.listSkills().then(setSkills).catch((e) => setMsg({ ok: false, text: String(e) })); }, []);
  useEffect(load, [load]);

  const upload = async (kind: "zip" | "folder") => {
    setMsg(null);
    let r: Awaited<ReturnType<typeof window.hub.previewSkillUpload>>;
    try { r = await window.hub.previewSkillUpload(kind); } catch (e) { setMsg({ ok: false, text: String(e) }); return; }
    if (!r) return;
    if ("error" in r) { setMsg({ ok: false, text: r.error }); return; }
    if (!r.items.length) { setMsg({ ok: false, text: `Không thấy SKILL.md nào trong ${r.source}.` }); return; }
    setPreview(r);
    setPicked(new Set(r.items.filter((i) => i.status !== "error").map((i) => i.key)));
  };

  const commit = async () => {
    if (!preview) return;
    try {
      const r = await window.hub.commitSkillUpload(preview.id, [...picked]);
      setMsg({ ok: r.imported.length > 0 && !r.message.includes("Lỗi"), text: r.message });
    } catch (e) { setMsg({ ok: false, text: String(e) }); }
    setPreview(null);
    load();
  };

  const cancel = async () => { if (preview) await window.hub.cancelSkillUpload(preview.id); setPreview(null); };
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { setMsg({ ok: false, text: String(e) }); } load(); };

  return (
    <div className="page">
      <div className="row between">
        <h1>Skills</h1>
        <div className="row">
          <button className="primary" onClick={() => void upload("zip")}>Tải Skill lên (.zip)</button>
          <button onClick={() => void upload("folder")}>Chọn thư mục Skill</button>
        </div>
      </div>
      <div className="note small">
        Giống tải Skill trên claude.ai: tệp .zip chứa một hoặc nhiều thư mục có <span className="mono">SKILL.md</span> (phần đầu có name và description).
        App chỉ chép tệp, không chạy script nào khi nhập. Agent gọi Skill bằng tên <span className="mono">tkhub:&lt;tên&gt;</span>, và chỉ đọc nội dung Skill khi cần.
        Skills trong <span className="mono">~/.claude/skills</span> và <span className="mono">.claude/skills</span> của từng dự án vẫn được nạp như trước.
      </div>
      {msg && <div className={`alert ${msg.ok ? "info" : "danger"}`}>{msg.text}</div>}

      {skills.length === 0 ? (
        <div className="card muted">Chưa có Skill nào. Bấm "Tải Skill lên (.zip)".</div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Skill</th><th>Mô tả</th><th>Tệp</th><th>Cập nhật</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {skills.map((s) => (
                <tr key={s.name}>
                  <td><b>{s.name}</b><div className="mono small muted">{s.invokeName}</div></td>
                  <td className="wrap">{s.description}</td>
                  <td>{s.files} tệp · {kb(s.bytes)}{s.hasScripts && <div><span className="badge warn">có script</span></div>}</td>
                  <td>{fmtDate(s.updatedAt)}</td>
                  <td><span className={`badge ${s.enabled ? "done" : s.deleted ? "error" : ""}`}>{s.enabled ? "Đang bật" : s.deleted ? "Đã xoá" : "Đang tắt"}</span></td>
                  <td>
                    <div className="row">
                      {!s.deleted && <button onClick={() => void act(() => window.hub.setSkillEnabled(s.name, !s.enabled))}>{s.enabled ? "Tắt" : "Bật"}</button>}
                      <button disabled={!s.backups.length} onClick={() => setRestoreOf(s)}>{s.deleted ? "Khôi phục" : `Bản cũ (${s.backups.length})`}</button>
                      {!s.deleted && <button onClick={() => { if (confirm(`Xoá Skill ${s.name}? Bản hiện tại được cất vào bản cũ, khôi phục lại được.`)) void act(() => window.hub.removeSkill(s.name)); }}>Xoá</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="muted small">Bật/tắt, thêm hay xoá Skill có hiệu lực từ việc kế tiếp. Skill đã xoá vẫn hiện trong bảng để khôi phục.</div>

      {preview && (
        <div className="overlay">
          <div className="dialog wide">
            <h3>Nhập Skill từ {preview.source}</h3>
            <table className="table">
              <thead><tr><th></th><th>Skill</th><th>Thư mục trong tệp</th><th>Tệp</th><th>Kết quả</th></tr></thead>
              <tbody>
                {preview.items.map((i) => (
                  <tr key={i.key}>
                    <td><input type="checkbox" disabled={i.status === "error"} checked={picked.has(i.key)}
                      onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(i.key); else n.delete(i.key); setPicked(n); }} /></td>
                    <td><b>{i.name || "(chưa có tên)"}</b><div className="small muted wrap">{i.description}</div></td>
                    <td className="mono small">{i.folder}</td>
                    <td>{i.files} · {kb(i.bytes)}{i.hasScripts && <div><span className="badge warn">có script</span></div>}</td>
                    <td className={i.status === "error" ? "small" : ""}>
                      <span className={`badge ${i.status === "error" ? "error" : i.status === "replace" ? "warn" : "done"}`}>{STATUS[i.status]}</span>
                      {i.error && <div className="small">{i.error}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.items.some((i) => i.hasScripts) && (
              <div className="alert info small">Skill có script: app không chạy khi nhập. Khi agent muốn chạy script, app vẫn hỏi anh trước như mọi lệnh khác.</div>
            )}
            <div className="row end">
              <button onClick={() => void cancel()}>Huỷ</button>
              <button className="primary" disabled={!picked.size} onClick={() => void commit()}>Nhập {picked.size} Skill</button>
            </div>
          </div>
        </div>
      )}

      {restoreOf && (
        <div className="overlay">
          <div className="dialog">
            <h3>Bản cũ của {restoreOf.name}</h3>
            <div className="small muted">Khôi phục thì bản đang dùng được cất vào bản cũ trước, không mất.</div>
            <table className="table">
              <tbody>
                {restoreOf.backups.map((b) => (
                  <tr key={b}><td>{stampDate(b)}</td><td>
                    <button onClick={async () => {
                      try { const r = await window.hub.restoreSkill(restoreOf.name, b); setMsg({ ok: r.ok, text: r.message }); }
                      catch (e) { setMsg({ ok: false, text: String(e) }); }
                      setRestoreOf(null); load();
                    }}>Khôi phục</button>
                  </td></tr>
                ))}
              </tbody>
            </table>
            <div className="row end"><button onClick={() => setRestoreOf(null)}>Đóng</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
