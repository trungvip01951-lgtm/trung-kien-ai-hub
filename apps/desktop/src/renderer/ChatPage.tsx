import { useCallback, useEffect, useRef, useState } from "react";
import { MODELS } from "../shared/contract";
import type {
  ChatItem, Conversation, Effort, HubEvent, ModelId, PermissionLevel, Project, Settings,
} from "../shared/contract";
import { EFFORTS, PERMISSIONS, firstLine, usd } from "./util";

type Entry =
  | { key: string; kind: "item"; item: ChatItem }
  | { key: string; kind: "draft"; taskId: number; text: string }
  | { key: string; kind: "pending-user"; text: string }
  | { key: string; kind: "note"; text: string; tone?: "danger" | "info" };

interface PermReq { requestId: string; taskId: number; toolName: string; summary: string; canAlways: boolean }
interface Warn { percent: number; message: string }
interface Usage { inputTokens: number; outputTokens: number; costUsd: number }

let seq = 0;
const nextKey = () => `k${++seq}`;

function ItemView({ item }: { item: ChatItem }) {
  if (item.kind === "user") return <div className="msg user"><div className="bubble">{item.text}</div></div>;
  if (item.kind === "assistant") return <div className="msg assistant"><div className="bubble">{item.text}</div></div>;
  if (item.kind === "tool_use" || item.kind === "tool_result") {
    const label = item.kind === "tool_use" ? `Công cụ ${item.toolName ?? ""}` : `Kết quả ${item.toolName ?? ""}`;
    return (
      <details className={`step${item.isError ? " err" : ""}`}>
        <summary><b>{label.trim()}</b> · {firstLine(item.text, 90) || "(trống)"}</summary>
        <pre>{item.text}</pre>
      </details>
    );
  }
  return <div className={`note-line${item.kind === "error" ? " danger" : ""}`}>{item.text}</div>;
}

export function ChatPage({ settings, keyTick, openRequest, onGoSettings }: {
  settings: Settings | null; keyTick: number;
  openRequest: { conversationId: number; nonce: number } | null;
  onGoSettings: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [convId, setConvId] = useState<number | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [model, setModel] = useState<ModelId>("claude-sonnet-5-5");
  const [effort, setEffort] = useState<Effort>("medium");
  const [permission, setPermission] = useState<PermissionLevel>("read");
  const [prompt, setPrompt] = useState("");
  const [hasKey, setHasKey] = useState(true);
  // Nhiều hội thoại chạy cùng lúc: hội thoại → việc đang chạy.
  const [runningByConv, setRunningByConv] = useState<Map<number, number>>(new Map());
  const [error, setError] = useState("");
  const [warn, setWarn] = useState<Warn | null>(null);
  const [perms, setPerms] = useState<PermReq[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageEst, setUsageEst] = useState(true);
  const taskConv = useRef(new Map<number, number>());     // việc → hội thoại
  const convRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<number | null>(null);
  projectRef.current = projectId;
  convRef.current = convId;

  const markRunning = (taskId: number, conversationId: number, on: boolean) => {
    if (on) taskConv.current.set(taskId, conversationId);
    setRunningByConv((m) => { const n = new Map(m); if (on) n.set(conversationId, taskId); else if (n.get(conversationId) === taskId) n.delete(conversationId); return n; });
  };
  // Sự kiện của việc thuộc hội thoại đang mở trên màn hình.
  const isShown = (taskId: number) => taskConv.current.get(taskId) === convRef.current && convRef.current != null;
  const taskId = convId != null ? runningByConv.get(convId) ?? null : null;
  const running = taskId !== null;

  const loadProjects = useCallback(async () => {
    const list = await window.hub.listProjects();
    setProjects(list);
    setProjectId((cur) => cur ?? list[0]?.id ?? null);
    return list;
  }, []);
  const loadConvs = useCallback(async (pid: number | null) => {
    if (pid == null) { setConvs([]); return; }
    setConvs(await window.hub.listConversations(pid));
  }, []);

  useEffect(() => { loadProjects().catch(() => {}); }, [loadProjects]);
  useEffect(() => { loadConvs(projectId).catch(() => {}); }, [projectId, loadConvs]);
  useEffect(() => { window.hub.hasApiKey().then(setHasKey).catch(() => {}); }, [keyTick]);
  useEffect(() => {
    if (!settings) return;
    setModel(settings.defaultModel); setEffort(settings.defaultEffort); setPermission(settings.defaultPermission);
  }, [settings]);
  useEffect(() => {
    window.hub.runningTasks().then((list) => { for (const t of list) markRunning(t.taskId, t.conversationId, true); }).catch(() => {});
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [entries]);

  const loadSeq = useRef(0);
  const selectConv = useCallback(async (id: number | null) => {
    const my = ++loadSeq.current;
    setConvId(id);
    convRef.current = id;
    setError("");
    setUsage(null);
    setEntries([]);
    if (id == null) return;
    try {
      const items = await window.hub.conversationItems(id);
      if (my !== loadSeq.current) return;             // đã chuyển sang hội thoại khác trong lúc chờ
      const maxId = items.reduce((m, it) => Math.max(m, it.id), 0);
      // Giữ các dòng đến bằng sự kiện trong lúc chờ tải (dòng mới hơn và bản nháp đang gõ).
      setEntries((prev) => [
        ...items.map((item): Entry => ({ key: `i${item.id}`, kind: "item", item })),
        ...prev.filter((x) => (x.kind === "item" && x.item.id > maxId) || x.kind === "draft"),
      ]);
    } catch (e) {
      if (my === loadSeq.current) setEntries([{ key: nextKey(), kind: "note", text: String(e), tone: "danger" }]);
    }
  }, []);

  // Mở hội thoại từ trang Lịch sử.
  useEffect(() => {
    if (!openRequest) return;
    (async () => {
      const list = await window.hub.listProjects();
      setProjects(list);
      for (const p of list) {
        const cs = await window.hub.listConversations(p.id);
        if (cs.some((c) => c.id === openRequest.conversationId)) {
          setProjectId(p.id);
          setConvs(cs);
          await selectConv(openRequest.conversationId);
          return;
        }
      }
    })().catch(() => {});
  }, [openRequest, selectConv]);

  // Sự kiện từ phần lõi.
  useEffect(() => {
    const off = window.hub.onEvent((e: HubEvent) => {
      switch (e.type) {
        case "task-started":
          markRunning(e.taskId, e.conversationId, true);
          loadConvs(projectRef.current).catch(() => {});
          break;
        case "budget-warning":
          setWarn({ percent: e.percent, message: e.message });
          break;
        case "permission-request":
          setPerms((q) => [...q, { requestId: e.requestId, taskId: e.taskId, toolName: e.toolName, summary: e.summary, canAlways: e.canAlways }]);
          break;
        case "permission-resolved":
          setPerms((q) => q.filter((p) => !e.requestIds.includes(p.requestId)));
          break;
        case "update":
          break;
        case "queue-failed":
          setEntries((es) => [...es, { key: nextKey(), kind: "note", tone: "danger", text: `Việc xếp hàng không chạy được: ${e.message}` }]);
          break;
        case "text-delta": {
          if (!isShown(e.taskId)) break;
          setEntries((es) => {
            const last = es[es.length - 1];
            if (last && last.kind === "draft" && last.taskId === e.taskId) {
              return [...es.slice(0, -1), { ...last, text: last.text + e.text }];
            }
            return [...es, { key: nextKey(), kind: "draft", taskId: e.taskId, text: e.text }];
          });
          break;
        }
        case "item": {
          const it = e.item;
          if (!isShown(it.taskId)) break;
          setEntries((es) => {
            if (es.some((x) => x.kind === "item" && x.item.id === it.id)) return es;
            let rest = es;
            if (it.kind === "assistant") rest = es.filter((x) => !(x.kind === "draft" && x.taskId === it.taskId));
            if (it.kind === "user") rest = es.filter((x) => x.kind !== "pending-user");
            return [...rest, { key: `i${it.id}`, kind: "item", item: it }];
          });
          break;
        }
        case "session":
          if (!isShown(e.taskId)) break;
          setEntries((es) => [...es, {
            key: nextKey(), kind: "note", tone: "info",
            text: `${e.keyLabel} · Model ${e.model} · đã nạp ${e.skills.length} skills · CLAUDE.md: ${e.claudeMd ? "có" : "không"}`,
          }]);
          break;
        case "usage":
          if (!isShown(e.taskId)) break;
          setUsage({ inputTokens: e.inputTokens, outputTokens: e.outputTokens, costUsd: e.costUsd });
          setUsageEst(e.costIsEstimate);
          break;
        case "task-finished": {
          const conv = taskConv.current.get(e.task.id) ?? e.task.conversationId;
          if (conv === convRef.current) {
            setEntries((es) => [
              ...es.filter((x) => x.kind !== "pending-user" && x.kind !== "draft"),
              { key: nextKey(), kind: "note", text: e.message, tone: e.task.status === "done" ? "info" : "danger" },
            ]);
          }
          markRunning(e.task.id, conv, false);
          setPerms((q) => q.filter((p) => p.taskId !== e.task.id));
          loadConvs(projectRef.current).catch(() => {});
          break;
        }
      }
    });
    return off;
  }, [loadConvs]);

  const send = async () => {
    const text = prompt.trim();
    if (!text || !hasKey || projectId == null) return;
    setError("");
    try {
      const r = await window.hub.startTask({ conversationId: convId, projectId, prompt: text, model, effort, permission });
      if (!r.ok && r.busy) {
        // Đang bận (hội thoại này đang chạy hoặc đủ số việc song song): xếp hàng, tự chạy khi có chỗ.
        await window.hub.enqueueTask({ conversationId: convId, projectId, prompt: text, model, effort, permission });
        setPrompt("");
        setEntries((es) => [...es, { key: nextKey(), kind: "note", tone: "info", text: `Đã xếp hàng: "${firstLine(text, 60)}". ${r.message ?? ""} Việc sẽ tự chạy khi có chỗ (xem mục Công việc đang chạy).` }]);
        return;
      }
      if (!r.ok) { setError(r.message ?? "Không gửi được."); return; }
      setPrompt("");
      setUsage(null);
      if (r.taskId != null && r.conversationId != null) markRunning(r.taskId, r.conversationId, true);
      if (r.conversationId != null && r.conversationId !== convId) {
        // Hội thoại mới: tải lại những gì đã ghi (câu hỏi vừa gửi), các dòng sau đến qua sự kiện.
        convRef.current = r.conversationId;
        await selectConv(r.conversationId);
      } else {
        setEntries((es) => es.some((x) => x.kind === "item" && x.item.kind === "user" && x.item.taskId === r.taskId)
          ? es : [...es, { key: nextKey(), kind: "pending-user", text }]);
      }
      loadConvs(projectId).catch(() => {});
    } catch (e) {
      setError(String(e));
    }
  };
  const stop = async () => { if (taskId != null) await window.hub.stopTask(taskId); };
  const answer = async (allow: boolean, always = false) => {
    const cur = perms[0];
    if (!cur) return;
    setPerms((q) => q.slice(1));
    await window.hub.answerPermission(cur.requestId, allow, always);
  };
  const addProject = async () => {
    const p = await window.hub.addProject();
    if (p) { await loadProjects(); setProjectId(p.id); setConvId(null); setEntries([]); }
  };

  const noProject = projectId == null;
  const perm = perms[0];

  return (
    <div className="chat">
      {warn && (
        <div className={`banner ${warn.percent >= 100 ? "danger" : "warn"}`}>
          <span>{warn.message}</span>
          <button className="link" onClick={() => setWarn(null)}>Đóng</button>
        </div>
      )}
      <div className="chat-body">
        <aside className="convs">
          <div className="field-label">Dự án</div>
          <select value={projectId ?? ""} onChange={(e) => { setProjectId(Number(e.target.value)); setConvId(null); setEntries([]); }}>
            {projects.length === 0 && <option value="">(chưa có dự án)</option>}
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={addProject}>Thêm dự án</button>
          <button className="primary" disabled={noProject} onClick={() => selectConv(null)}>Hội thoại mới</button>
          <div className="field-label">Hội thoại</div>
          <div className="conv-list">
            {convs.map((c) => (
              <button key={c.id} className={`conv${c.id === convId ? " active" : ""}`} onClick={() => selectConv(c.id)}>
                <span>{runningByConv.has(c.id) && <span className="dot" title="Đang chạy">● </span>}{c.title || `Hội thoại #${c.id}`}</span>
                <span className="muted small">{usd(c.costUsd)} USD</span>
              </button>
            ))}
            {convs.length === 0 && <div className="muted small">Chưa có hội thoại.</div>}
          </div>
        </aside>

        <section className="main">
          <div className="toolbar">
            <label>Model
              <select value={model} onChange={(e) => setModel(e.target.value as ModelId)}>
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>Suy nghĩ
              <select value={effort} onChange={(e) => setEffort(e.target.value as Effort)}>
                {EFFORTS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>Quyền
              <select value={permission} onChange={(e) => setPermission(e.target.value as PermissionLevel)}>
                {PERMISSIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </div>

          {permission === "full" && (
            <div className="alert danger small">Đủ quyền: agent tự chạy lệnh, sửa/xoá tệp, gửi dữ liệu và thao tác web không hỏi anh, tức là có quyền như tài khoản Windows của anh. Vẫn giữ hạn mức chi phí; chạy mã trên trang web vẫn hỏi.</div>
          )}
          <div className="messages">
            {!hasKey && (
              <div className="card">
                <b>Chưa có API key</b> — vào Cài đặt để nhập.
                <div><button className="primary" onClick={onGoSettings}>Mở Cài đặt</button></div>
              </div>
            )}
            {entries.length === 0 && hasKey && <div className="muted empty">Hãy nhập yêu cầu bên dưới để bắt đầu.</div>}
            {entries.map((en) => {
              if (en.kind === "item") return <ItemView key={en.key} item={en.item} />;
              if (en.kind === "draft") return <div key={en.key} className="msg assistant"><div className="bubble typing">{en.text}</div></div>;
              if (en.kind === "pending-user") return <div key={en.key} className="msg user"><div className="bubble">{en.text}</div></div>;
              return <div key={en.key} className={`note-line${en.tone === "danger" ? " danger" : ""}`}>{en.text}</div>;
            })}
            <div ref={bottomRef} />
          </div>

          {error && <div className="alert danger">{error}</div>}
          <div className="composer">
            <textarea
              value={prompt}
              rows={3}
              placeholder={noProject ? "Hãy thêm một dự án trước." : "Nhập yêu cầu… (Enter để gửi, Shift+Enter để xuống dòng)"}
              onChange={(e) => setPrompt(e.target.value)}
              // Enter gửi, Shift+Enter xuống dòng; đang gõ dở dấu (bộ gõ tiếng Việt) thì không gửi.
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void send(); }
              }}
            />
            <div className="col">
              <button className="primary" disabled={!hasKey || noProject || !prompt.trim()} onClick={send}>{running ? "Xếp hàng" : "Gửi"}</button>
              {running && <button className="danger-btn" onClick={stop}>Dừng</button>}
            </div>
          </div>
          <div className="footer-line muted small">
            {usage
              ? `Token vào/ra ${usage.inputTokens} / ${usage.outputTokens} · Chi phí ${usageEst ? "~" : ""}${usd(usage.costUsd)} USD (ước tính)`
              : running ? "Đang chạy…" : "Chưa có số liệu cho việc này."}
          </div>
        </section>
      </div>

      {perm && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true">
            <h3>AI muốn dùng công cụ {perm.toolName}</h3>
            {(() => {
              const conv = taskConv.current.get(perm.taskId);
              const c = convs.find((x) => x.id === conv);
              return conv !== convId ? <div className="small muted">Hội thoại: {c?.title ?? `#${conv ?? "?"}`} (việc #{perm.taskId})</div> : null;
            })()}
            <pre className="mono summary">{perm.summary}</pre>
            {perms.length > 1 && <div className="muted small">Còn {perms.length - 1} yêu cầu đang chờ.</div>}
            <div className="row end">
              <button className="danger-btn" onClick={() => answer(false)}>Từ chối</button>
              {perm.canAlways && <button onClick={() => answer(true, true)} title="Không hỏi lại đúng loại thao tác này (cùng lệnh, cùng thư mục hoặc cùng website) trong hội thoại này, đến khi tắt app">Đồng ý luôn</button>}
              <button className="primary" onClick={() => answer(true)}>Cho phép</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
