import { useCallback, useEffect, useRef, useState } from "react";
import { MODELS } from "../shared/contract";
import type {
  ChatItem, Conversation, Effort, HubEvent, ImageAttachment, ImageType, ModelId, PermissionLevel, Project, Settings,
} from "../shared/contract";

const IMAGE_TYPES: ImageType[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGES = 5;
// API nhận tối đa 5 MB mỗi ảnh tính trên chuỗi base64 (dài hơn ảnh gốc 4/3 lần).
const MAX_IMAGE_BYTES = Math.floor((5 * 1024 * 1024 * 3) / 4);

// Đọc tệp ảnh thành base64 (không có tiền tố data:).
function readImage(f: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ mediaType: f.type as ImageType, data: String(r.result).replace(/^data:[^,]*,/, ""), name: f.name || "anh-dan.png" });
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}
import { EFFORTS, PERMISSIONS, firstLine, usd } from "./util";
import { FileCards, filesFromSteps, groupItems, MarkdownText, StepGroup, toolLabel } from "./Messages";

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

function ItemView({ item, projectId, onError }: { item: ChatItem; projectId: number | null; onError: (m: string) => void }) {
  if (item.kind === "user") return <div className="msg user"><div className="bubble">{item.text}</div></div>;
  if (item.kind === "assistant") return <div className="msg assistant"><MarkdownText text={item.text} projectId={projectId} onError={onError} /></div>;
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
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  // Thêm ảnh từ dán (Ctrl+V), kéo thả hoặc chọn tệp; bỏ qua tệp không phải ảnh, báo ảnh quá lớn.
  const addFiles = async (files: File[]) => {
    const imgs = files.filter((f) => IMAGE_TYPES.includes(f.type as ImageType));
    if (!imgs.length) return false;
    const big = imgs.filter((f) => f.size > MAX_IMAGE_BYTES);
    if (big.length) setError(`Ảnh lớn quá 3,7 MB (giới hạn của API): ${big.map((f) => f.name).join(", ")}.`);
    const ok = await Promise.all(imgs.filter((f) => f.size <= MAX_IMAGE_BYTES).map(readImage));
    setImages((cur) => {
      const next = [...cur, ...ok].slice(0, MAX_IMAGES);
      if (cur.length + ok.length > MAX_IMAGES) setError(`Tối đa ${MAX_IMAGES} ảnh một lần.`);
      return next;
    });
    return true;
  };
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
  const drafts = useRef(new Map<number, string>());       // việc → chữ đang gõ dở (giữ cả khi đang xem hội thoại khác)
  const bottomRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<number | null>(null);
  projectRef.current = projectId;
  convRef.current = convId;

  const startedAt = useRef(new Map<number, number>());     // việc → lúc bắt đầu (đếm giờ chạy)
  const markRunning = (taskId: number, conversationId: number, on: boolean) => {
    if (on) { taskConv.current.set(taskId, conversationId); if (!startedAt.current.has(taskId)) startedAt.current.set(taskId, Date.now()); }
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
      // Bản nháp của việc đang chạy trong hội thoại này: lấy đủ chữ đã đến (kể cả lúc đang xem hội thoại khác).
      const running = [...taskConv.current].filter(([, c]) => c === id).map(([t]) => t);
      const draftEntries: Entry[] = running.filter((t) => drafts.current.get(t)).map((t) => ({ key: `d${t}`, kind: "draft", taskId: t, text: drafts.current.get(t)! }));
      setEntries((prev) => [
        ...items.map((item): Entry => ({ key: `i${item.id}`, kind: "item", item })),
        ...prev.filter((x) => x.kind === "item" && x.item.id > maxId),
        ...draftEntries,
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
          drafts.current.set(e.taskId, (drafts.current.get(e.taskId) ?? "") + e.text);
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
          if (it.kind === "assistant") drafts.current.delete(it.taskId);
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
          drafts.current.delete(e.task.id);
          // Dòng kết thúc ("Xong. Chi phí…") đã đến bằng sự kiện item; ở đây chỉ dọn câu hỏi tạm và bản nháp.
          if (conv === convRef.current) {
            setEntries((es) => es.filter((x) => x.kind !== "pending-user" && !(x.kind === "draft" && x.taskId === e.task.id)));
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
    if ((!text && !images.length) || !hasKey || projectId == null) return;
    const imgs = images;
    setError("");
    try {
      const r = await window.hub.startTask({ conversationId: convId, projectId, prompt: text, model, effort, permission, images: imgs });
      if (!r.ok && r.busy) {
        // Đang bận (hội thoại này đang chạy hoặc đủ số việc song song): xếp hàng, tự chạy khi có chỗ.
        await window.hub.enqueueTask({ conversationId: convId, projectId, prompt: text, model, effort, permission, images: imgs });
        setPrompt("");
        setImages([]);
        setEntries((es) => [...es, { key: nextKey(), kind: "note", tone: "info", text: `Đã xếp hàng: "${firstLine(text, 60)}". ${r.message ?? ""} Việc sẽ tự chạy khi có chỗ (xem mục Công việc đang chạy).` }]);
        return;
      }
      if (!r.ok) { setError(r.message ?? "Không gửi được."); return; }
      setPrompt("");
      setImages([]);
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
            {(() => {
              // Thẻ tệp hiện ngay sau dòng kết thúc của mỗi việc (dòng system/error cuối cùng của việc đó).
              const lastOfTask = new Map<number, string>();
              for (const en of entries) if (en.kind === "item" && (en.item.kind === "system" || en.item.kind === "error")) lastOfTask.set(en.item.taskId, en.key);
              const isStep = (en: Entry) => en.kind === "item" && (en.item.kind === "tool_use" || en.item.kind === "tool_result");
              return groupItems(entries, isStep).map((g) => {
                if ("steps" in g) return <StepGroup key={g.steps[0].key} items={g.steps.map((e) => (e as Extract<Entry, { kind: "item" }>).item)} />;
                const en = g.one;
                if (en.kind === "item") {
                  const it = en.item;
                  const files = lastOfTask.get(it.taskId) === en.key
                    ? filesFromSteps(entries.flatMap((x) => (x.kind === "item" && x.item.taskId === it.taskId ? [x.item] : []))) : [];
                  return (
                    <div key={en.key}>
                      <ItemView item={it} projectId={projectId} onError={setError} />
                      <FileCards files={files} projectId={projectId} onError={setError} />
                    </div>
                  );
                }
                if (en.kind === "draft") return <div key={en.key} className="msg assistant"><MarkdownText text={en.text} projectId={projectId} onError={setError} /></div>;
                if (en.kind === "pending-user") return <div key={en.key} className="msg user"><div className="bubble">{en.text}</div></div>;
                return <div key={en.key} className={`note-line${en.tone === "danger" ? " danger" : ""}`}>{en.text}</div>;
              });
            })()}
            {taskId !== null && <RunStatus taskId={taskId} entries={entries} waiting={perms.find((p) => p.taskId === taskId)?.toolName ?? null}
              since={startedAt.current.get(taskId) ?? Date.now()} />}
            <div ref={bottomRef} />
          </div>

          {error && <div className="alert danger">{error}</div>}
          {images.length > 0 && (
            <div className="attachments">
              {images.map((im, i) => (
                <div key={i} className="thumb">
                  <img src={`data:${im.mediaType};base64,${im.data}`} alt={im.name ?? ""} />
                  <button className="link" title="Bỏ ảnh này" onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="composer"
            onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
            onDrop={(e) => { const fs = Array.from(e.dataTransfer.files); if (fs.length) { e.preventDefault(); void addFiles(fs); } }}>
            <textarea
              value={prompt}
              rows={3}
              placeholder={noProject ? "Hãy thêm một dự án trước." : "Nhập yêu cầu… (Enter gửi, Shift+Enter xuống dòng, Ctrl+V dán ảnh)"}
              onChange={(e) => setPrompt(e.target.value)}
              // Ctrl+V ảnh (ảnh chụp màn hình, ảnh chép từ web/Zalo): đưa vào ảnh đính kèm.
              onPaste={(e) => {
                const fs = Array.from(e.clipboardData.items).filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter((f): f is File => !!f);
                if (fs.some((f) => IMAGE_TYPES.includes(f.type as ImageType))) { e.preventDefault(); void addFiles(fs); }
              }}
              // Enter gửi, Shift+Enter xuống dòng; đang gõ dở dấu (bộ gõ tiếng Việt) thì không gửi.
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void send(); }
              }}
            />
            <div className="col">
              <button className="primary" disabled={!hasKey || noProject || (!prompt.trim() && !images.length)} onClick={send}>{running ? "Xếp hàng" : "Gửi"}</button>
              <button title="Đính kèm ảnh (hoặc dán Ctrl+V, kéo thả vào ô chat)" disabled={images.length >= MAX_IMAGES} onClick={() => fileRef.current?.click()}>Ảnh</button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
                onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
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

// Dòng trạng thái khi việc đang chạy: đang làm bước gì, đã bao lâu, có đang chờ anh cho phép không.
function RunStatus({ taskId, entries, waiting, since }: { taskId: number; entries: Entry[]; waiting: string | null; since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const mine = entries.filter((e) => (e.kind === "item" && e.item.taskId === taskId) || (e.kind === "draft" && e.taskId === taskId));
  const steps = mine.filter((e) => e.kind === "item" && e.item.kind === "tool_use").length;
  const last = mine[mine.length - 1];
  let text = "Đang suy nghĩ…";
  if (waiting) text = `Đang chờ anh cho phép: ${toolLabel(waiting, {}).label.replace(/[:\s]+$/, "")}`;
  else if (last?.kind === "draft") text = "Đang viết câu trả lời…";
  else if (last?.kind === "item" && last.item.kind === "tool_use") {
    let input: Record<string, unknown> = {};
    try { input = JSON.parse(last.item.text) as Record<string, unknown>; } catch { /* giữ trống */ }
    text = `Đang làm: ${toolLabel(last.item.toolName ?? "", input).label}`;
  } else if (last?.kind === "item" && last.item.kind === "tool_result") text = "Đang xem kết quả, tính bước tiếp…";
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  const time = sec >= 60 ? `${Math.floor(sec / 60)} phút ${sec % 60} giây` : `${sec} giây`;
  return (
    <div className={`run-status${waiting ? " waiting" : ""}`}>
      <span className="spinner" />
      <span className="grow">{text}</span>
      <span className="muted small">{steps > 0 ? `${steps} bước · ` : ""}{time}</span>
    </div>
  );
}
