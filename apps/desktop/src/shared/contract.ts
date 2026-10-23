// Hợp đồng giao tiếp giữa giao diện (renderer) và phần lõi (main) qua preload.
// Renderer chỉ gọi được những gì khai báo ở đây: window.hub.

export type ModelId = "claude-haiku-5-5" | "claude-sonnet-5-5" | "claude-opus-5-5";
export type Effort = "low" | "medium" | "high" | "xhigh";
// read: chỉ đọc; write: được sửa file trong thư mục dự án, lệnh và công cụ ngoài phải hỏi;
// full: đủ quyền, không hỏi gì (vẫn giữ hạn mức chi phí và các chặn bắt buộc: cookie/mã truy cập trình duyệt).
export type PermissionLevel = "read" | "write" | "full";

export const MODELS: { id: ModelId; label: string }[] = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5 (rẻ, việc đơn giản)" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 (việc hằng ngày)" },
  { id: "claude-opus-5-5", label: "Opus 5.5 (việc khó)" },
];

export interface ApiKeyInfo {
  id: string; label: string; last4: string; priority: number; addedAt: string;
  lastError: string | null; lastErrorAt: string | null; lastUsedAt: string | null;
}

// instructions: "Hướng dẫn dự án" anh Trung soạn trong app, gửi kèm mỗi việc của dự án (không ghi vào thư mục dự án).
export interface Project { id: number; name: string; path: string; createdAt: string; instructions: string }

// Skill trong kho của app (mục Skills). Agent gọi bằng invokeName ("tkhub:<tên>").
export interface SkillInfo {
  name: string; invokeName: string; description: string; enabled: boolean;
  deleted: boolean;           // đã xoá: chỉ còn bản cũ, khôi phục được
  files: number; bytes: number; hasScripts: boolean; updatedAt: string;
  backups: string[];          // các bản cũ, mới nhất trước
}

export interface SkillImportPreview {
  id: string; source: string;
  items: { key: string; folder: string; name: string; description: string; files: number; bytes: number;
    hasScripts: boolean; status: "new" | "replace" | "error"; error: string | null }[];
}

// Một dòng PROJECT_INVENTORY (yêu cầu gốc mục II). Chỉ đọc từ thư mục dự án.
export interface InventoryRow {
  path: string; name: string; projectId: number | null;
  excluded: string | null;            // lý do không cho đưa vào (dự án Thịnh Vượng)
  instructions: string[];             // CLAUDE.md, AGENTS.md...
  skills: string[]; agents: string[]; commands: number; hooks: boolean; mcp: string[];
  docs: string[]; deps: string[]; git: string;
  current: string; next: string; handoffFile: string | null;   // trích nguyên văn từ sổ bàn giao
  settingsWarning: string | null; updatedAt: string;
  oldSessions: number | null;         // số phiên Claude Code cũ của thư mục này (null: chưa đọc được)
}

// Phiên Claude Code cũ (đọc bằng listSessions của Agent SDK) để tiếp tục trong app.
export interface OldSession { sessionId: string; title: string; lastModified: string; sizeBytes: number | null; gitBranch: string | null; imported: boolean }

export interface Conversation {
  id: number; projectId: number; title: string; sessionId: string | null;
  createdAt: string; updatedAt: string; costUsd: number;
}

export type TaskStatus = "running" | "done" | "error" | "stopped" | "budget" | "interrupted";

export interface TaskRow {
  id: number; conversationId: number; prompt: string; model: ModelId; status: TaskStatus;
  costUsd: number; costIsEstimate: boolean;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number;
  stopReason: string | null; createdAt: string; finishedAt: string | null;
}

// Một dòng hiển thị trong khung chat (đã lưu trong lịch sử).
export type ItemKind = "user" | "assistant" | "tool_use" | "tool_result" | "system" | "error";
export interface ChatItem {
  id: number; taskId: number; kind: ItemKind; text: string;
  toolName?: string; isError?: boolean; createdAt: string;
  toolUseId?: string;        // mã bước gọi công cụ (ghép bước gọi với kết quả)
}

export interface Limits {
  perTaskUsd: number; dailyUsd: number; monthlyUsd: number;
  cycleStartDay: number;     // ngày bắt đầu kỳ thanh toán gói (1-28), tín dụng hết hạn cuối kỳ
  warnPercents: number[];    // ví dụ [70, 90, 100]
}

export interface UsageSummary {
  todayUsd: number; cycleUsd: number; cycleStart: string; limits: Limits;
  remainingForNextTaskUsd: number; blockedReason: string | null;
}

// Quyền theo website khi điều khiển trình duyệt: chỉ xem / hỏi từng thao tác / tự làm thao tác thường
// (thao tác đăng, lưu, gửi, xoá, thanh toán, đăng nhập luôn hỏi).
export type SiteMode = "read" | "ask" | "auto";
export interface ChromeSettings {
  enabled: boolean;
  // app: hồ sơ trình duyệt riêng của app; main: Chrome/Edge anh đang dùng (qua tiện ích Playwright Extension).
  mode: "app" | "main";
  browser: "chrome" | "msedge";        // trình duyệt đã cài trên máy; hồ sơ riêng của app
  sites: { host: string; mode: SiteMode }[];
}

// Kết nối dịch vụ ngoài qua máy chủ MCP từ xa (đăng nhập OAuth trong app).
export type ConnectionKind = "windsor" | "gmail" | "drive" | "sheets" | "custom";
export interface ConnectionInfo {
  id: string; kind: ConnectionKind; name: string; url: string; enabled: boolean; toolPrefix: string;
  status: "connected" | "needs-login"; lastError: string | null; connectedAt: string | null;
  expiresAt: string | null; canRefresh: boolean;
  needsClientId: boolean; hasClientId: boolean;   // Google: cần OAuth client anh tạo trong Google Cloud
}

export interface Settings {
  limits: Limits; defaultModel: ModelId; defaultEffort: Effort;
  defaultPermission: PermissionLevel; theme: "system" | "light" | "dark";
  // Tự chia việc cho AI phụ đúng sức (Haiku/Sonnet/Opus, mức suy nghĩ riêng) trong cùng một việc.
  autoRouting: boolean;
  chrome: ChromeSettings;
  // Cho agent điều khiển ứng dụng Windows (bấm, gõ vẫn hỏi theo mức quyền).
  windowsEnabled: boolean;
}

// Sự kiện phần lõi đẩy lên giao diện trong lúc chạy việc.
export type HubEvent =
  | { type: "task-started"; taskId: number; conversationId: number; allowanceUsd: number }
  | { type: "session"; taskId: number; sessionId: string; model: string; skills: string[]; tools: string[]; claudeMd: boolean; keyLabel: string }
  | { type: "text-delta"; taskId: number; text: string }
  | { type: "item"; item: ChatItem }
  | { type: "usage"; taskId: number; costUsd: number; costIsEstimate: boolean; inputTokens: number; outputTokens: number }
  | { type: "permission-request"; requestId: string; taskId: number; toolName: string; summary: string; canAlways: boolean }
  // Yêu cầu đã được trả lời tự động (cùng loại vừa "Đồng ý luôn", hoặc việc đã dừng): giao diện gỡ hộp hỏi.
  | { type: "permission-resolved"; requestIds: string[] }
  | { type: "task-finished"; task: TaskRow; message: string }
  | { type: "queue-failed"; queueId: number; message: string }
  | { type: "budget-warning"; scope: "day" | "cycle"; percent: number; message: string }
  | { type: "update"; status: "checking" | "available" | "none" | "downloading" | "ready" | "error"; version?: string; percent?: number; message?: string };

// Bộ nhớ dài hạn theo dự án (projectId null: dùng chung mọi dự án).
export type MemoryKind = "rule" | "fact" | "error" | "progress" | "note";
// source: "user" anh Trung tự viết, "agent" do agent ghi.
export interface MemoryNote { id: number; projectId: number | null; kind: MemoryKind; title: string; content: string; source: "user" | "agent"; createdAt: string; updatedAt: string }

// AI chuyên môn (subagent): mặc định của app hoặc anh tự thêm.
export interface SpecialistInfo { id: string; name: string; description: string; prompt: string; model: ModelId; effort: Effort; enabled: boolean; builtin: boolean }

export interface BackupInfo { id: string; createdAt: string; reason: string; appVersion: string; bytes: number }

// Lịch chạy việc tự động (chỉ khi app đang mở).
export interface ScheduleRule { kind: "daily" | "weekly" | "hourly"; time: string; weekday: number; everyHours: number }
export interface Schedule extends ScheduleRule {
  id: number; name: string; projectId: number; prompt: string; model: ModelId; effort: Effort; permission: PermissionLevel;
  enabled: boolean; lastRunAt: string | null; nextRunAt: string | null; lastTaskId: number | null;
}
export interface QueueItem { id: number; input: StartTaskInput; source: string; status: "waiting" | "started" | "failed" | "cancelled"; message: string | null; taskId: number | null; createdAt: string }

// Ảnh đính kèm câu hỏi (dán Ctrl+V, kéo thả, nút đính kèm). data: base64 không có tiền tố "data:".
export type ImageType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";
export interface ImageAttachment { mediaType: ImageType; data: string; name?: string }

export interface StartTaskInput {
  images?: ImageAttachment[];
  conversationId: number | null; projectId: number; prompt: string;
  model: ModelId; effort: Effort; permission: PermissionLevel;
}

export interface SearchHit { conversationId: number; taskId: number; snippet: string; createdAt: string }

export interface HubApi {
  appVersion(): Promise<string>;
  // Nhiều API key theo thứ tự ưu tiên; key hết tiền/lỗi thì tự chuyển key kế tiếp.
  // Chỉ ghi và kiểm tra, không bao giờ đọc ngược key ra giao diện (chỉ 4 ký tự cuối).
  hasApiKey(): Promise<boolean>;
  listApiKeys(): Promise<ApiKeyInfo[]>;
  addApiKey(key: string, label: string): Promise<{ ok: boolean; message: string }>;
  removeApiKey(id: string): Promise<void>;
  moveApiKey(id: string, delta: -1 | 1): Promise<void>;
  testApiKey(id: string): Promise<{ ok: boolean; message: string; costUsd: number }>;

  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<Settings>;
  usageSummary(): Promise<UsageSummary>;
  listTasks(limit: number): Promise<TaskRow[]>;

  listProjects(): Promise<Project[]>;
  addProject(): Promise<Project | null>;            // mở hộp thoại chọn thư mục
  addProjectPath(path: string): Promise<{ ok: boolean; message: string; project?: Project }>;
  saveProjectInstructions(projectId: number, text: string): Promise<Project | null>;
  readProjectFile(projectId: number, rel: string): Promise<string | null>;   // xem CLAUDE.md, sổ bàn giao (chỉ đọc)
  scanFolder(): Promise<{ rows: InventoryRow[]; truncated: boolean; root: string } | null>;  // mở hộp thoại chọn thư mục
  lastInventory(): Promise<{ rows: InventoryRow[]; scannedAt: string | null }>;
  listOldSessions(projectId: number): Promise<OldSession[]>;
  importOldSession(projectId: number, sessionId: string): Promise<{ ok: boolean; message: string; conversationId?: number }>;

  listSkills(): Promise<SkillInfo[]>;
  previewSkillUpload(kind: "zip" | "folder"): Promise<SkillImportPreview | { error: string } | null>;
  commitSkillUpload(id: string, keys: string[]): Promise<{ imported: string[]; message: string }>;
  cancelSkillUpload(id: string): Promise<void>;
  setSkillEnabled(name: string, enabled: boolean): Promise<void>;
  removeSkill(name: string): Promise<void>;
  restoreSkill(name: string, stamp: string): Promise<{ ok: boolean; message: string }>;

  listConnections(): Promise<ConnectionInfo[]>;
  addConnection(kind: ConnectionKind, name?: string, url?: string): Promise<{ ok: boolean; message: string }>;
  removeConnection(id: string): Promise<void>;
  setConnectionEnabled(id: string, enabled: boolean): Promise<void>;
  setConnectionClient(id: string, clientId: string, clientSecret: string): Promise<{ ok: boolean; message: string }>;
  loginConnection(id: string): Promise<{ ok: boolean; message: string }>;   // mở trình duyệt mặc định để đăng nhập
  logoutConnection(id: string): Promise<void>;
  // Mã ghép nối tiện ích Playwright Extension (để khỏi phải bấm đồng ý mỗi lần); lưu mã hoá.
  setExtensionToken(token: string): Promise<void>;
  hasExtensionToken(): Promise<boolean>;
  runningTasks(): Promise<{ taskId: number; conversationId: number }[]>;
  // Mở tệp bằng chương trình mặc định (folder: mở thư mục chứa tệp). Không mở tệp chạy chương trình.
  openFile(path: string, projectId: number | null, folder?: boolean): Promise<{ ok: boolean; message: string }>;
  enqueueTask(input: StartTaskInput): Promise<QueueItem>;
  listQueue(): Promise<QueueItem[]>;
  cancelQueue(id: number): Promise<void>;
  listSchedules(): Promise<Schedule[]>;
  saveSchedule(s: Omit<Schedule, "id" | "lastRunAt" | "nextRunAt" | "lastTaskId"> & { id?: number }): Promise<Schedule>;
  deleteSchedule(id: number): Promise<void>;
  runScheduleNow(id: number): Promise<QueueItem | null>;
  listSpecialists(): Promise<SpecialistInfo[]>;
  saveSpecialists(list: SpecialistInfo[]): Promise<SpecialistInfo[]>;
  listMemory(projectId: number | null, query: string): Promise<MemoryNote[]>;
  saveMemory(n: { id?: number; projectId: number | null; kind: MemoryKind; title: string; content: string }): Promise<MemoryNote>;
  deleteMemory(id: number): Promise<void>;
  checkIntegrity(): Promise<boolean>;
  listBackups(): Promise<BackupInfo[]>;
  createBackup(): Promise<BackupInfo>;
  restoreBackup(id: string): Promise<{ ok: boolean; message: string }>;   // app khởi động lại
  exportBackup(id: string): Promise<string | null>;
  importBackup(): Promise<BackupInfo | null>;

  // Mở trình duyệt với hồ sơ riêng của app để anh Trung tự đăng nhập các website (app không xem mật khẩu).
  openBrowserProfile(): Promise<{ ok: boolean; message: string }>;
  listConversations(projectId: number): Promise<Conversation[]>;
  conversationItems(conversationId: number): Promise<ChatItem[]>;
  search(query: string): Promise<SearchHit[]>;

  startTask(input: StartTaskInput): Promise<{ ok: boolean; busy?: boolean; taskId?: number; conversationId?: number; message?: string }>;
  stopTask(taskId: number): Promise<void>;
  answerPermission(requestId: string, allow: boolean, always?: boolean): Promise<void>;   // always: "Đồng ý luôn" trong hội thoại này
  runningTaskId(): Promise<number | null>;

  checkUpdate(): Promise<void>;     // kiểm tra ngay; có bản mới thì tự tải, xong phát sự kiện "ready"
  installUpdate(): Promise<void>;   // khởi động lại và cài bản đã tải
  onEvent(cb: (e: HubEvent) => void): () => void;
}

declare global { interface Window { hub: HubApi } }
