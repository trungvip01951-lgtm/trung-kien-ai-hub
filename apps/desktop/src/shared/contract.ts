// Hợp đồng giao tiếp giữa giao diện (renderer) và phần lõi (main) qua preload.
// Renderer chỉ gọi được những gì khai báo ở đây: window.hub.

export type ModelId = "claude-haiku-5-5" | "claude-sonnet-5-5" | "claude-opus-5-5";
export type Effort = "low" | "medium" | "high" | "xhigh";
// read: chỉ đọc; write: được sửa file trong thư mục dự án, lệnh và công cụ ngoài phải hỏi.
export type PermissionLevel = "read" | "write";

export const MODELS: { id: ModelId; label: string }[] = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5 (rẻ, việc đơn giản)" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 (việc hằng ngày)" },
  { id: "claude-opus-5-5", label: "Opus 5.5 (việc khó)" },
];

export interface Project { id: number; name: string; path: string; createdAt: string }

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

export interface Settings {
  limits: Limits; defaultModel: ModelId; defaultEffort: Effort;
  defaultPermission: PermissionLevel; theme: "system" | "light" | "dark";
}

// Sự kiện phần lõi đẩy lên giao diện trong lúc chạy việc.
export type HubEvent =
  | { type: "task-started"; taskId: number; conversationId: number; allowanceUsd: number }
  | { type: "session"; taskId: number; sessionId: string; model: string; skills: string[]; tools: string[]; claudeMd: boolean }
  | { type: "text-delta"; taskId: number; text: string }
  | { type: "item"; item: ChatItem }
  | { type: "usage"; taskId: number; costUsd: number; costIsEstimate: boolean; inputTokens: number; outputTokens: number }
  | { type: "permission-request"; requestId: string; taskId: number; toolName: string; summary: string }
  | { type: "task-finished"; task: TaskRow; message: string }
  | { type: "budget-warning"; scope: "day" | "cycle"; percent: number; message: string }
  | { type: "update"; status: "checking" | "available" | "none" | "downloading" | "ready" | "error"; version?: string; percent?: number; message?: string };

export interface StartTaskInput {
  conversationId: number | null; projectId: number; prompt: string;
  model: ModelId; effort: Effort; permission: PermissionLevel;
}

export interface SearchHit { conversationId: number; taskId: number; snippet: string; createdAt: string }

export interface HubApi {
  appVersion(): Promise<string>;
  // API key: chỉ ghi và kiểm tra, không bao giờ đọc ngược ra giao diện.
  hasApiKey(): Promise<boolean>;
  setApiKey(key: string): Promise<{ ok: boolean; message: string }>;
  clearApiKey(): Promise<void>;
  testApiKey(): Promise<{ ok: boolean; message: string; costUsd: number }>;

  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<Settings>;
  usageSummary(): Promise<UsageSummary>;
  listTasks(limit: number): Promise<TaskRow[]>;

  listProjects(): Promise<Project[]>;
  addProject(): Promise<Project | null>;            // mở hộp thoại chọn thư mục
  listConversations(projectId: number): Promise<Conversation[]>;
  conversationItems(conversationId: number): Promise<ChatItem[]>;
  search(query: string): Promise<SearchHit[]>;

  startTask(input: StartTaskInput): Promise<{ ok: boolean; taskId?: number; conversationId?: number; message?: string }>;
  stopTask(taskId: number): Promise<void>;
  answerPermission(requestId: string, allow: boolean): Promise<void>;
  runningTaskId(): Promise<number | null>;

  installUpdate(): Promise<void>;
  onEvent(cb: (e: HubEvent) => void): () => void;
}

declare global { interface Window { hub: HubApi } }
