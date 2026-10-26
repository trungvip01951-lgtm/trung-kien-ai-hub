import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { StartTaskInput, TaskRow } from "../shared/contract";
import { filesFromSteps } from "../shared/steps";
import type { HubDb } from "./db";

// Cổng nối app Claude (máy tính) / Claude Code vào Hub: app Claude gọi công cụ MCP "trung-kien-hub" (tệp bridge-mcp.js),
// công cụ đó gọi về đây qua HTTP trên 127.0.0.1 kèm mã bí mật. Việc giao sang chạy bằng API key của Hub, theo hạn mức,
// mức quyền mặc định và các hộp hỏi quyền của Hub (anh duyệt trong cửa sổ Hub).
// Mã bí mật và cổng lưu trong bridge.json ở thư mục dữ liệu của app (chỉ tài khoản Windows của anh đọc được).

export interface BridgeInfo { enabled: boolean; port: number; token: string }

export interface BridgeDeps {
  db: HubDb;
  start(input: StartTaskInput): Promise<{ ok: boolean; busy?: boolean; joined?: boolean; taskId?: number; conversationId?: number; message?: string }>;
  enqueue(input: StartTaskInput): { id: number };
  stop(taskId: number): Promise<void> | void;
  running(): { taskId: number; conversationId: number }[];
  pendingAsk(taskId: number): boolean;
}

const MAX_BODY = 200_000;
const ANSWER_MAX = 20_000;

export class Bridge {
  private server: Server | null = null;
  private info: BridgeInfo;

  constructor(private file: string, private deps: BridgeDeps) {
    let saved: Partial<BridgeInfo> = {};
    try { if (existsSync(file)) saved = JSON.parse(readFileSync(file, "utf8")) as Partial<BridgeInfo>; } catch { /* tệp hỏng: tạo lại */ }
    this.info = { enabled: saved.enabled === true, port: Number(saved.port) || 0, token: typeof saved.token === "string" && saved.token.length >= 32 ? saved.token : randomBytes(32).toString("hex") };
  }

  get(): BridgeInfo { return { ...this.info }; }

  async setEnabled(on: boolean): Promise<BridgeInfo> {
    this.info.enabled = on;
    if (on) await this.listen(); else this.close();
    this.save();
    return this.get();
  }

  // Mở cổng khi app khởi động nếu đã bật. Giữ số cổng cũ để cấu hình bên app Claude không phải sửa.
  async init() { if (this.info.enabled) { await this.listen(); this.save(); } }

  close() { this.server?.close(); this.server = null; }

  private save() { writeFileSync(this.file, JSON.stringify(this.info), { mode: 0o600 }); }

  private listen(): Promise<void> {
    if (this.server) return Promise.resolve();
    const srv = createServer((req, res) => {
      const gone = new AbortController();
      res.on("close", () => gone.abort());
      this.handle(req, gone.signal).catch((err) => ({ status: 500, body: { error: String(err) } })).then((r) => {
        if (res.destroyed) return;
        res.writeHead(r.status, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(r.body));
      }, () => undefined);
    });
    const tryPort = (port: number) => new Promise<void>((resolve, reject) => {
      srv.once("error", reject);
      srv.listen(port, "127.0.0.1", () => { srv.removeListener("error", reject); resolve(); });
    });
    return tryPort(this.info.port).catch(() => tryPort(0)).then(() => {
      this.server = srv;
      this.info.port = (srv.address() as AddressInfo).port;
    });
  }

  private authorized(req: IncomingMessage): boolean {
    // Chỉ nhận gọi từ chương trình trên máy (không từ trang web: trình duyệt luôn gửi Origin), đúng địa chỉ, đúng mã.
    if (req.headers.origin) return false;
    const host = String(req.headers.host ?? "");
    if (host !== `127.0.0.1:${this.info.port}` && host !== `localhost:${this.info.port}`) return false;
    const got = Buffer.from(String(req.headers.authorization ?? "").replace(/^Bearer /, ""));
    const want = Buffer.from(this.info.token);
    return got.length === want.length && timingSafeEqual(got, want);
  }

  private async handle(req: IncomingMessage, gone?: AbortSignal): Promise<{ status: number; body: unknown }> {
    if (req.method !== "POST" || !this.authorized(req)) return { status: 403, body: { error: "Không được phép." } };
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > MAX_BODY) return { status: 413, body: { error: "Yêu cầu quá lớn." } }; }
    let a: Record<string, unknown>;
    try { a = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { return { status: 400, body: { error: "JSON hỏng." } }; }
    try {
      return { status: 200, body: await this.call(String(req.url ?? "").replace(/^\/api\//, ""), a, gone) };
    } catch (err) {
      return { status: 200, body: { error: err instanceof Error ? err.message : String(err) } };
    }
  }

  // Hội thoại do app Claude mở qua cổng này: chỉ những hội thoại này Claude được làm tiếp hoặc gửi thêm tin
  // (không chen vào hội thoại anh đang làm trong Hub, không đổi mức quyền của việc anh đang chạy).
  private ownConvs = new Set<number>();
  private ownQueue = new Set<number>();

  async call(action: string, a: Record<string, unknown>, gone?: AbortSignal): Promise<unknown> {
    const { db } = this.deps;
    switch (action) {
      case "projects":
        return db.listProjects().map((p) => ({ id: p.id, name: p.name, path: p.path }));
      case "start": {
        const projects = db.listProjects();
        const want = String(a.project ?? "").trim();
        const p = projects.find((x) => String(x.id) === want) ?? projects.find((x) => x.name.toLowerCase() === want.toLowerCase())
          ?? projects.filter((x) => x.name.toLowerCase().includes(want.toLowerCase())).at(0);
        if (!want || !p) return { error: `Không thấy dự án "${want}". Dự án có: ${projects.map((x) => x.name).join(", ") || "(chưa có)"}.` };
        const prompt = String(a.prompt ?? "").trim();
        if (!prompt) return { error: "Thiếu yêu cầu." };
        const convId = a.conversationId == null ? null : Number(a.conversationId);
        if (convId != null) {
          const conv = db.getConversation(convId);
          if (!conv || conv.projectId !== p.id) return { error: `Hội thoại #${convId} không thuộc dự án ${p.name}.` };
          if (!this.ownConvs.has(convId)) return { error: `Hội thoại #${convId} không do app Claude mở qua Hub: không làm tiếp được. Bỏ conversationId để mở hội thoại mới.` };
        }
        const s = db.getSettings();
        const input: StartTaskInput = { conversationId: convId, projectId: p.id, prompt,
          model: s.defaultModel, effort: s.defaultEffort, permission: s.defaultPermission };
        const r = await this.deps.start(input);
        if (!r.ok && r.busy) {
          const q = this.deps.enqueue(input);
          this.ownQueue.add(q.id);
          return { queued: true, queueId: q.id, message: `Hub đang bận (${r.message ?? ""}). Đã xếp hàng, tự chạy khi có chỗ. Gọi hub_ket_qua với queueId=${q.id} (không phải taskId) để chờ.` };
        }
        if (!r.ok) return { error: r.message ?? "Không giao được việc." };
        if (r.conversationId != null) this.ownConvs.add(r.conversationId);
        return { taskId: r.taskId, conversationId: r.conversationId, joined: !!r.joined, project: p.name,
          note: r.joined ? "Hội thoại này đang chạy: tin đã gửi thêm vào việc đang làm." : "Đã giao. Gọi hub_ket_qua để chờ và lấy kết quả." };
      }
      case "result": {
        // Việc đang xếp hàng: tra mã việc thật khi đã chạy.
        if (a.queueId != null) {
          const q = this.ownQueue.has(Number(a.queueId)) ? db.queueItem(Number(a.queueId)) : null;
          if (!q) return { error: `Không có việc xếp hàng #${a.queueId} do app Claude giao.` };
          if (q.status === "waiting") return { queueId: q.id, status: "queued", finished: false, note: "Còn đang xếp hàng, gọi lại sau." };
          if (!q.taskId) return { queueId: q.id, status: q.status, finished: true, error: q.message ?? "Việc xếp hàng không chạy được." };
          a = { ...a, taskId: q.taskId };
          const t0 = db.getTask(q.taskId);
          if (t0) this.ownConvs.add(t0.conversationId);
        }
        const id = Number(a.taskId);
        const waitMs = Math.min(Math.max(Number(a.wait ?? 30), 0), 55) * 1000;
        const until = Date.now() + waitMs;
        let t = db.getTask(id);
        if (!t || !this.ownConvs.has(t.conversationId)) return { error: `Không có việc #${id} do app Claude giao (việc giao trước khi Hub khởi động lại cũng không xem lại được từ đây).` };
        while (!finished(t) && Date.now() < until && !this.deps.pendingAsk(id) && !gone?.aborted) {
          await new Promise((r) => setTimeout(r, 1000));
          t = db.getTask(id)!;
        }
        const items = db.conversationItems(t.conversationId).filter((x) => x.taskId === id);
        const answer = items.filter((x) => x.kind === "assistant").map((x) => x.text).join("\n\n");
        const steps = items.filter((x) => x.kind === "tool_use").map((x) => x.toolName ?? "");
        return {
          taskId: id, conversationId: t.conversationId, status: t.status, finished: finished(t),
          waitingForPermission: this.deps.pendingAsk(id) ? "Đang chờ anh Trung cho phép trong cửa sổ Trung Kiên AI Hub." : undefined,
          costUsd: Number(t.costUsd.toFixed(4)), costIsEstimate: t.costIsEstimate, stopReason: t.stopReason ?? undefined,
          answer: answer.length > ANSWER_MAX ? `…${answer.slice(-ANSWER_MAX)}` : answer,
          files: filesFromSteps(items), stepCount: steps.length, lastSteps: steps.slice(-5),
        };
      }
      case "running":
        // Chỉ việc app Claude giao (việc anh tự giao trong Hub không lộ sang, không dừng được từ Claude).
        return this.deps.running().filter((r) => this.ownConvs.has(r.conversationId)).map((r) => ({ ...r, prompt: db.getTask(r.taskId)?.prompt.slice(0, 200) }));
      case "stop": {
        const t = db.getTask(Number(a.taskId));
        if (!t || !this.ownConvs.has(t.conversationId)) return { error: "Chỉ dừng được việc do app Claude giao." };
        await this.deps.stop(t.id);
        return { ok: true };
      }
      default:
        return { error: `Không có lệnh ${action}.` };
    }
  }
}

function finished(t: TaskRow): boolean { return t.status !== "running"; }
