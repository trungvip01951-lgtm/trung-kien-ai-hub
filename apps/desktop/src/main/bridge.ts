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
    const srv = createServer((req, res) => { void this.handle(req).then((r) => {
      res.writeHead(r.status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(r.body));
    }); });
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

  private async handle(req: IncomingMessage): Promise<{ status: number; body: unknown }> {
    if (req.method !== "POST" || !this.authorized(req)) return { status: 403, body: { error: "Không được phép." } };
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > MAX_BODY) return { status: 413, body: { error: "Yêu cầu quá lớn." } }; }
    let a: Record<string, unknown>;
    try { a = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { return { status: 400, body: { error: "JSON hỏng." } }; }
    try {
      return { status: 200, body: await this.call(String(req.url ?? "").replace(/^\/api\//, ""), a) };
    } catch (err) {
      return { status: 200, body: { error: err instanceof Error ? err.message : String(err) } };
    }
  }

  async call(action: string, a: Record<string, unknown>): Promise<unknown> {
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
        const s = db.getSettings();
        const input: StartTaskInput = { conversationId: a.conversationId == null ? null : Number(a.conversationId), projectId: p.id, prompt,
          model: s.defaultModel, effort: s.defaultEffort, permission: s.defaultPermission };
        const r = await this.deps.start(input);
        if (!r.ok && r.busy) {
          const q = this.deps.enqueue(input);
          return { queued: true, queueId: q.id, message: `Hub đang bận (${r.message ?? ""}). Đã xếp hàng, tự chạy khi có chỗ; xem bằng hub_viec_dang_chay.` };
        }
        if (!r.ok) return { error: r.message ?? "Không giao được việc." };
        return { taskId: r.taskId, conversationId: r.conversationId, joined: !!r.joined, project: p.name,
          note: r.joined ? "Hội thoại này đang chạy: tin đã gửi thêm vào việc đang làm." : "Đã giao. Gọi hub_ket_qua để chờ và lấy kết quả." };
      }
      case "result": {
        const id = Number(a.taskId);
        const waitMs = Math.min(Math.max(Number(a.wait ?? 30), 0), 55) * 1000;
        const until = Date.now() + waitMs;
        let t = db.getTask(id);
        if (!t) return { error: `Không có việc #${id}.` };
        while (!finished(t) && Date.now() < until && !this.deps.pendingAsk(id)) {
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
        return this.deps.running().map((r) => ({ ...r, prompt: db.getTask(r.taskId)?.prompt.slice(0, 200) }));
      case "stop":
        await this.deps.stop(Number(a.taskId));
        return { ok: true };
      default:
        return { error: `Không có lệnh ${action}.` };
    }
  }
}

function finished(t: TaskRow): boolean { return t.status !== "running"; }
