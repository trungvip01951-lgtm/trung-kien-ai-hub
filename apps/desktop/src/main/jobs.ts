import type { HubEvent, QueueItem, Schedule, StartTaskInput, TaskRow } from "../shared/contract";
import type { HubDb } from "./db";
import { nextRun } from "./schedule";

// Hàng đợi công việc và lịch chạy (Mốc 4). Việc trong hàng đợi chạy khi có chỗ trống (tối đa số việc song song),
// theo thứ tự; còn nguyên sau khi tắt mở app. Lịch chỉ chạy khi app đang mở, mỗi lần đến giờ đưa đúng một việc vào hàng đợi.

export interface Starter {
  start(input: StartTaskInput): Promise<{ ok: boolean; busy?: boolean; taskId?: number; message?: string; done?: Promise<TaskRow> }>;
  runningTasks(): { taskId: number }[];
}

export class Jobs {
  private current: Promise<void> | null = null;
  private again = false;
  private timer: NodeJS.Timeout | null = null;

  // guard: lý do tạm chưa chạy được (ví dụ cửa sổ đăng nhập trình duyệt đang mở) thì để việc chờ.
  constructor(private db: HubDb, private runner: Starter, private emit: (e: HubEvent) => void, private now = () => new Date(),
    private guard: () => string | null = () => null) {}

  enqueue(input: StartTaskInput, source = "Chat"): QueueItem {
    const it = this.db.enqueue(input, source);
    void this.pump();
    return it;
  }

  cancel(id: number) {
    const it = this.db.queueItem(id);
    if (it?.status === "waiting") this.db.setQueueStatus(id, "cancelled", "Anh Trung huỷ.");
  }

  // Chạy các việc đang chờ theo thứ tự; việc nào vướng bận thì giữ chờ, việc lỗi khác (hết hạn mức, thiếu dự án) thì báo.
  // Gọi khi đang chạy dở thì chờ lượt đang chạy rồi chạy thêm một lượt (không chạy hai lượt song song).
  pump(): Promise<void> {
    if (this.current) { this.again = true; return this.current; }
    this.current = (async () => {
      do {
        this.again = false;
        await this.pumpOnce();
      } while (this.again);
    })().finally(() => { this.current = null; });
    return this.current;
  }

  private async pumpOnce() {
    for (const it of this.db.waitingQueue()) {
      // Đọc lại trạng thái ngay trước khi chạy (anh có thể vừa bấm Huỷ trong lúc việc trước đang khởi động).
      if (this.db.queueItem(it.id)?.status !== "waiting" || this.guard()) continue;
      const r = await this.runner.start(it.input);
      if (r.ok) {
        this.db.setQueueStatus(it.id, "started", null, r.taskId ?? null);
        const sched = /^Lịch #(\d+)/.exec(it.source);
        if (sched && r.taskId) this.db.setScheduleTask(Number(sched[1]), r.taskId);
        void r.done?.then(() => this.pump(), () => this.pump());
      } else if (!r.busy) {
        this.db.setQueueStatus(it.id, "failed", r.message ?? "Không chạy được.");
        this.emit({ type: "queue-failed", queueId: it.id, message: `${it.source}: ${r.message ?? "Không chạy được."}` });
      }
    }
  }

  // Đến giờ thì đưa vào hàng đợi. Lỡ nhiều lần khi app tắt chỉ chạy bù một lần.
  tick() {
    const now = this.now();
    for (const s of this.db.listSchedules()) {
      if (!s.enabled || !s.nextRunAt || new Date(s.nextRunAt) > now) continue;
      this.db.markScheduleRun(s.id, now.toISOString(), nextRun(s, now).toISOString());
      if (!this.db.getProject(s.projectId)) continue;
      // Lần trước của cùng lịch còn chờ hoặc còn chạy: bỏ lần này, không dồn nhiều lần chạy cùng sửa một chỗ.
      const pendingSame = this.db.waitingQueue().some((q) => q.source.startsWith(`Lịch #${s.id} `));
      const runningSame = s.lastTaskId != null && this.runner.runningTasks().some((r) => r.taskId === s.lastTaskId);
      if (pendingSame || runningSame) {
        this.emit({ type: "queue-failed", queueId: 0, message: `Lịch "${s.name}": lần trước chưa xong, bỏ qua lần ${now.toLocaleString("vi-VN")}.` });
        continue;
      }
      this.enqueue({ conversationId: null, projectId: s.projectId, prompt: s.prompt, model: s.model, effort: s.effort, permission: s.permission },
        `Lịch #${s.id} ${s.name}`);
    }
    void this.pump();
  }

  start(intervalMs = 30_000) {
    this.tick();
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop() { if (this.timer) clearInterval(this.timer); }

  saveSchedule(s: Omit<Schedule, "id" | "lastRunAt" | "lastTaskId" | "nextRunAt"> & { id?: number }): Schedule {
    return this.db.saveSchedule({ ...s, nextRunAt: s.enabled ? nextRun(s, this.now()).toISOString() : null });
  }
}
