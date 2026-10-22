import { useCallback, useEffect, useState } from "react";
import type { Project } from "../shared/contract";
import { fmtDate } from "./util";

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    window.hub.listProjects().then(setProjects).catch((e) => setErr(String(e)));
  }, []);
  useEffect(load, [load]);
  const add = async () => {
    try {
      await window.hub.addProject();
      load();
    } catch (e) {
      setErr(String(e));
    }
  };
  return (
    <div className="page">
      <div className="row between">
        <h1>Dự án</h1>
        <button className="primary" onClick={add}>Thêm dự án</button>
      </div>
      {err && <div className="alert danger">{err}</div>}
      {projects.length === 0 ? (
        <div className="card muted">Chưa có dự án. Bấm "Thêm dự án" để chọn một thư mục.</div>
      ) : (
        <table className="table">
          <thead><tr><th>Tên</th><th>Đường dẫn</th><th>Ngày tạo</th></tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}><td>{p.name}</td><td className="mono">{p.path}</td><td>{fmtDate(p.createdAt)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
