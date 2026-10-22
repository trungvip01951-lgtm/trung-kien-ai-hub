import { useState } from "react";
import type { SearchHit } from "../shared/contract";
import { Snippet, fmtDate } from "./util";

export function HistoryPage({ onOpen }: { onOpen: (conversationId: number) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [err, setErr] = useState("");
  const run = async () => {
    if (!q.trim()) { setHits(null); return; }
    try {
      setErr("");
      setHits(await window.hub.search(q.trim()));
    } catch (e) {
      setErr(String(e));
    }
  };
  return (
    <div className="page">
      <h1>Lịch sử</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong các hội thoại…" />
        <button className="primary" type="submit">Tìm</button>
      </form>
      {err && <div className="alert danger">{err}</div>}
      {hits && hits.length === 0 && <div className="card muted">Không tìm thấy kết quả.</div>}
      <div className="hits">
        {hits?.map((h) => (
          <button key={`${h.taskId}-${h.conversationId}-${h.createdAt}`} className="hit" onClick={() => onOpen(h.conversationId)}>
            <div className="muted small">Hội thoại #{h.conversationId} · {fmtDate(h.createdAt)}</div>
            <div><Snippet text={h.snippet} /></div>
          </button>
        ))}
      </div>
    </div>
  );
}
