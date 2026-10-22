import { useEffect, useState } from "react";
import type { HubEvent, Settings } from "../shared/contract";
import { ChatPage } from "./ChatPage";
import { ProjectsPage } from "./ProjectsPage";
import { TasksPage } from "./TasksPage";
import { HistoryPage } from "./HistoryPage";
import { CostPage } from "./CostPage";
import { SettingsPage } from "./SettingsPage";
import { SkillsPage } from "./SkillsPage";
import { ChromePage } from "./ChromePage";
import { McpPage } from "./McpPage";
import logo from "./logo.svg";
import { Placeholder } from "./util";

const NAV: { id: string; label: string; todo?: boolean }[] = [
  { id: "chat", label: "Chat AI" },
  { id: "projects", label: "Dự án" },
  { id: "tasks", label: "Công việc đang chạy" },
  { id: "skills", label: "Skills" },
  { id: "agents", label: "Agents", todo: true },
  { id: "mcp", label: "MCP và công cụ" },
  { id: "chrome", label: "Chrome" },
  { id: "windows", label: "Máy tính Windows", todo: true },
  { id: "docs", label: "Tài liệu", todo: true },
  { id: "memory", label: "Bộ nhớ", todo: true },
  { id: "history", label: "Lịch sử" },
  { id: "cost", label: "Chi phí API" },
  { id: "settings", label: "Cài đặt" },
];
const STORE = "tkhub.nav";

function loadNav(): string {
  try {
    const v = localStorage.getItem(STORE);
    if (v && NAV.some((n) => n.id === v)) return v;
  } catch { /* bỏ qua */ }
  return "chat";
}

type UpdateEvent = Extract<HubEvent, { type: "update" }>;

export function App() {
  const [nav, setNav] = useState(loadNav);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [keyTick, setKeyTick] = useState(0);
  const [open, setOpen] = useState<{ conversationId: number; nonce: number } | null>(null);
  const [update, setUpdate] = useState<UpdateEvent | null>(null);

  const go = (id: string) => {
    setNav(id);
    try { localStorage.setItem(STORE, id); } catch { /* bỏ qua */ }
  };

  useEffect(() => { window.hub.getSettings().then(setSettings).catch(() => {}); }, []);
  useEffect(() => {
    const off = window.hub.onEvent((e) => { if (e.type === "update") setUpdate(e); });
    return off;
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme ?? "system";
  }, [settings?.theme]);

  const todo = NAV.find((n) => n.id === nav && n.todo);

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand"><img src={logo} alt="" />Trung Kiên AI Hub</div>
        <div className="nav-list">
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item${nav === n.id ? " active" : ""}${n.todo ? " todo" : ""}`} onClick={() => go(n.id)}>
              {n.label}
            </button>
          ))}
        </div>
        <UpdateBox update={update} onCheck={() => { setUpdate({ type: "update", status: "checking" }); void window.hub.checkUpdate(); }} />
      </nav>
      <main className="content">
        <div className="pane" hidden={nav !== "chat"}>
          <ChatPage settings={settings} keyTick={keyTick} openRequest={open} onGoSettings={() => go("settings")} />
        </div>
        {nav === "projects" && <ProjectsPage onOpenConversation={(id) => { setOpen({ conversationId: id, nonce: Date.now() }); go("chat"); }} />}
        {nav === "skills" && <SkillsPage />}
        {nav === "mcp" && <McpPage />}
        {nav === "chrome" && <ChromePage settings={settings} onSettings={setSettings} />}
        {nav === "tasks" && <TasksPage />}
        {nav === "history" && <HistoryPage onOpen={(id) => { setOpen({ conversationId: id, nonce: Date.now() }); go("chat"); }} />}
        {nav === "cost" && <CostPage settings={settings} onSettings={setSettings} />}
        {nav === "settings" && <SettingsPage settings={settings} onSettings={setSettings} onKeyChanged={() => setKeyTick((t) => t + 1)} />}
        {todo && <Placeholder title={todo.label} />}
      </main>
    </div>
  );
}

// Ô cập nhật luôn hiện ở cuối thanh bên: có bản mới đã tải xong thì một nút "Cập nhật ngay".
function UpdateBox({ update, onCheck }: { update: UpdateEvent | null; onCheck: () => void }) {
  const [version, setVersion] = useState("");
  useEffect(() => { window.hub.appVersion().then(setVersion).catch(() => {}); }, []);
  const s = update?.status;
  return (
    <div className="update">
      <div>Phiên bản {version}</div>
      {s === "ready" ? (
        <>
          <div>Có bản mới {update?.version}</div>
          <button className="primary" onClick={() => void window.hub.installUpdate()}>Cập nhật ngay</button>
        </>
      ) : s === "available" || s === "downloading" ? (
        <div>Đang tải bản {update?.version ?? "mới"} ({Math.round(update?.percent ?? 0)}%)</div>
      ) : s === "checking" ? (
        <div>Đang kiểm tra…</div>
      ) : (
        <>
          {s === "none" && <div>Đang dùng bản mới nhất</div>}
          {s === "error" && <div className="update-error">{update?.message}</div>}
          <button onClick={onCheck}>Kiểm tra cập nhật</button>
        </>
      )}
    </div>
  );
}
