import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { ConnectionInfo, ConnectionKind, PermissionLevel } from "../shared/contract";
import type { Decision } from "./policy";

// Kết nối dịch vụ ngoài (Windsor.ai, Gmail, Google Drive, Google Trang tính, MCP tuỳ chọn) qua máy chủ MCP từ xa
// chính thức, đăng nhập OAuth ngay trong app trên máy anh Trung (thư viện MCP chính thức làm phần OAuth: tìm máy chủ
// cấp quyền, đăng ký client, PKCE, làm mới mã). Mã truy cập và client secret mã hoá bằng safeStorage (Windows: DPAPI),
// không gửi lên giao diện, không ghi log hay cơ sở dữ liệu.

// Tên máy chủ trùng tên kết nối trên claude.ai (công cụ mcp__Google_Sheets__get_values...), để Skill và quy tắc dự án
// viết cho claude.ai dùng được nguyên trong app.
export const PRESET_ID: Record<Exclude<ConnectionKind, "custom">, string> = {
  windsor: "Windsor_ai", gmail: "Gmail", drive: "Google_Drive", sheets: "Google_Sheets",
};

export const PRESETS: Record<Exclude<ConnectionKind, "custom">, { name: string; url: string; google: boolean }> = {
  windsor: { name: "Windsor.ai", url: "https://mcp.windsor.ai", google: false },
  gmail: { name: "Gmail", url: "https://gmailmcp.googleapis.com/mcp/v1", google: true },
  drive: { name: "Google Drive", url: "https://drivemcp.googleapis.com/mcp/v1", google: true },
  sheets: { name: "Google Trang tính", url: "https://sheetsmcp.googleapis.com/mcp/v1", google: true },
};

// Cổng nhận kết quả đăng nhập trên máy, chỉ nghe 127.0.0.1 (OAuth client loại "Desktop app" của Google chấp nhận
// mọi cổng loopback). Dùng 127.0.0.1 thay "localhost" để trình duyệt không gửi mã tới tiến trình khác nghe ::1.
export const CALLBACK_PORT = 8765;
const REFRESH_BEFORE_MS = 5 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

interface Secret {
  tokens?: OAuthTokens & { savedAt?: number };
  client?: OAuthClientInformationMixed;     // client đăng ký tự động (Windsor) hoặc client anh nhập (Google)
  verifier?: string;
}
interface Stored { id: string; kind: ConnectionKind; name: string; url: string; enabled: boolean; lastError: string | null; connectedAt: string | null }

export interface Cipher { encrypt(s: string): Buffer; decrypt(b: Buffer): string }

// Công cụ đọc (tên bắt đầu bằng get/list/search/read...) tự cho; công cụ ghi (gửi, sửa, tạo, chạy hành động) phải hỏi.
const READ_TOOL = /^(get|list|search|read|query|fetch|find|describe|download|export)(_|$)/i;

export function slugOf(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "ket-noi";
}

export class Connections {
  private list: Stored[] = [];
  private secrets: Record<string, Secret> = {};
  private loginBusy = false;
  private refreshing = new Map<string, Promise<void>>();
  private port: number;
  private redirectUrl: string;

  constructor(private file: string, private secretFile: string, private cipher: Cipher,
    private openUrl: (url: string) => void | Promise<void>, private fetchFn: typeof fetch = fetch, opts: { port?: number } = {}) {
    this.port = opts.port ?? CALLBACK_PORT;
    this.redirectUrl = `http://127.0.0.1:${this.port}/callback`;
    if (existsSync(file)) { try { this.list = JSON.parse(readFileSync(file, "utf8")); } catch { this.list = []; } }
    if (existsSync(secretFile)) { try { this.secrets = JSON.parse(cipher.decrypt(readFileSync(secretFile))); } catch { this.secrets = {}; } }
    // Bản 0.5.0 đặt tên kết nối "sheets", "gmail"...: đổi sang tên trùng kết nối claude.ai để Skill/AGENTS.md gọi đúng công cụ.
    let moved = false;
    for (const c of this.list) {
      const want = c.kind === "custom" ? null : PRESET_ID[c.kind];
      if (want && c.id !== want && !this.list.some((o) => o.id === want)) {
        if (this.secrets[c.id]) { this.secrets[want] = this.secrets[c.id]; delete this.secrets[c.id]; }
        c.id = want;
        moved = true;
      }
    }
    if (moved) this.save();
  }

  private save() {
    writeFileSync(this.file, JSON.stringify(this.list, null, 2));
    const tmp = `${this.secretFile}.tmp`;
    writeFileSync(tmp, this.cipher.encrypt(JSON.stringify(this.secrets)), { mode: 0o600 });
    renameSync(tmp, this.secretFile);
  }

  info(): ConnectionInfo[] {
    return this.list.map((c) => {
      const s = this.secrets[c.id] ?? {};
      const exp = s.tokens?.expires_in && s.tokens.savedAt ? s.tokens.savedAt + s.tokens.expires_in * 1000 : null;
      return { id: c.id, kind: c.kind, name: c.name, url: c.url, enabled: c.enabled, toolPrefix: `mcp__${c.id}__`,
        status: s.tokens?.access_token ? "connected" : "needs-login", lastError: c.lastError, connectedAt: c.connectedAt,
        expiresAt: exp ? new Date(exp).toISOString() : null, canRefresh: !!s.tokens?.refresh_token,
        needsClientId: c.kind in PRESETS && PRESETS[c.kind as keyof typeof PRESETS].google, hasClientId: !!(s.client as { client_id?: string })?.client_id };
    });
  }

  add(kind: ConnectionKind, name?: string, url?: string): { ok: boolean; message: string; id?: string } {
    const preset = kind === "custom" ? null : PRESETS[kind];
    const finalUrl = preset?.url ?? String(url ?? "").trim();
    try {
      const u = new URL(finalUrl);
      const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
      if (u.protocol !== "https:" && !local) return { ok: false, message: "Địa chỉ máy chủ MCP phải là https." };
    } catch { return { ok: false, message: "Địa chỉ máy chủ MCP không hợp lệ." }; }
    const label = (preset?.name ?? String(name ?? "").trim()) || "Kết nối";
    if (kind !== "custom" && this.list.some((c) => c.kind === kind)) return { ok: false, message: `${label} đã có.` };
    let id = kind === "custom" ? slugOf(label) : PRESET_ID[kind];
    // Tên máy chủ không trùng các tên app đã dùng.
    while (this.list.some((c) => c.id === id) || id === "chrome") id = `${id}-${randomBytes(2).toString("hex")}`;
    this.list.push({ id, kind, name: label, url: finalUrl, enabled: true, lastError: null, connectedAt: null });
    this.save();
    return { ok: true, message: `Đã thêm ${label}. Bấm Đăng nhập để kết nối.`, id };
  }

  remove(id: string) {
    this.list = this.list.filter((c) => c.id !== id);
    delete this.secrets[id];
    this.save();
  }

  setEnabled(id: string, enabled: boolean) {
    const c = this.list.find((x) => x.id === id);
    if (c) { c.enabled = enabled; this.save(); }
  }

  // OAuth client tự tạo trong Google Cloud (loại Desktop app): Google không cho đăng ký client tự động.
  setClient(id: string, clientId: string, clientSecret: string): { ok: boolean; message: string } {
    const c = this.list.find((x) => x.id === id);
    if (!c) return { ok: false, message: "Không tìm thấy kết nối." };
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId.trim()) && c.kind !== "custom") {
      return { ok: false, message: "Client ID phải có dạng ...apps.googleusercontent.com." };
    }
    this.secrets[id] = { client: { client_id: clientId.trim(), ...(clientSecret.trim() ? { client_secret: clientSecret.trim() } : {}) } };
    // Một OAuth client dùng chung cho cả Gmail, Drive, Trang tính: chép sang kết nối Google khác chưa có client.
    for (const o of this.list) {
      if (o.id !== id && PRESETS[o.kind as keyof typeof PRESETS]?.google && !(this.secrets[o.id]?.client as { client_id?: string })?.client_id) {
        this.secrets[o.id] = { client: { ...this.secrets[id].client! } };
      }
    }
    this.save();
    return { ok: true, message: "Đã lưu OAuth client (mã hoá trên máy)." };
  }

  private provider(c: Stored, interactive: { onRedirect(url: URL): void } | null): OAuthClientProvider {
    const sec = () => (this.secrets[c.id] ??= {});
    const google = PRESETS[c.kind as keyof typeof PRESETS]?.google ?? false;
    const redirect = this.redirectUrl;
    const metadata: OAuthClientMetadata = {
      client_name: "Trung Kien AI Hub", redirect_uris: [redirect],
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none",
    };
    return {
      get redirectUrl() { return redirect; },
      get clientMetadata() { return metadata; },
      clientInformation: () => sec().client,
      saveClientInformation: (info) => { sec().client = info; this.save(); },
      tokens: () => sec().tokens,
      saveTokens: (t) => { sec().tokens = { ...t, savedAt: Date.now() }; this.save(); },
      saveCodeVerifier: (v) => { sec().verifier = v; },
      codeVerifier: () => sec().verifier ?? "",
      redirectToAuthorization: (url) => {
        if (!interactive) throw new NeedsLogin();
        // Google chỉ cấp mã làm mới (refresh token) khi xin quyền ngoại tuyến; thiếu thì mỗi giờ phải đăng nhập lại.
        if (google) { url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent"); }
        interactive.onRedirect(url);
      },
      invalidateCredentials: (scope) => {
        const s = sec();
        if (scope === "all" || scope === "tokens") delete s.tokens;
        if ((scope === "all" || scope === "client") && !google) delete s.client;
        if (scope === "all" || scope === "verifier") delete s.verifier;
        this.save();
      },
    };
  }

  // Đăng nhập: mở trình duyệt mặc định tới trang cấp quyền của dịch vụ, chờ dịch vụ chuyển về localhost:8765.
  async login(id: string): Promise<{ ok: boolean; message: string }> {
    const c = this.list.find((x) => x.id === id);
    if (!c) return { ok: false, message: "Không tìm thấy kết nối." };
    if (this.loginBusy) return { ok: false, message: "Đang chờ một lần đăng nhập khác. Hoàn tất hoặc chờ 10 phút." };
    const info = this.info().find((x) => x.id === id)!;
    if (info.needsClientId && !info.hasClientId) return { ok: false, message: "Nhập OAuth Client ID của Google trước (xem hướng dẫn)." };
    this.loginBusy = true;
    const state = randomUUID();
    let server: Server | null = null;
    try {
      const code = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Quá 10 phút chưa đăng nhập xong.")), LOGIN_TIMEOUT_MS);
        server = createServer((req, res) => {
          const u = new URL(req.url ?? "/", this.redirectUrl);
          // Sai đường dẫn hoặc sai state (trang khác gọi vào): bỏ qua, tiếp tục chờ đúng kết quả.
          if (u.pathname !== "/callback" || u.searchParams.get("state") !== state) { res.writeHead(404); res.end(); return; }
          const ok = u.searchParams.get("code") && u.searchParams.get("state") === state;
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(`<meta charset="utf-8"><body style="font:16px sans-serif;padding:40px">${ok ? "Đã đăng nhập xong. Quay lại Trung Kiên AI Hub." : "Đăng nhập không thành công. Quay lại app thử lại."}</body>`);
          clearTimeout(timer);
          if (ok) resolve(u.searchParams.get("code")!);
          else reject(new Error(u.searchParams.get("error_description") ?? u.searchParams.get("error") ?? "Dịch vụ không trả mã đăng nhập."));
        });
        server.on("error", (e) => { clearTimeout(timer); reject(new Error(`Cổng ${this.port} trên máy đang bị chương trình khác dùng, đóng chương trình đó rồi thử lại (${String(e)}).`)); });
        server.listen(this.port, "127.0.0.1", () => {
          // Cổng 0 (chỉ dùng khi kiểm thử): hệ điều hành chọn cổng trống.
          if (this.port === 0) this.redirectUrl = `http://127.0.0.1:${(server!.address() as { port: number }).port}/callback`;
          const p = this.provider(c, { onRedirect: (url) => { void this.openUrl(url.toString()); } });
          (p as { state?: () => string }).state = () => state;
          auth(p, { serverUrl: c.url, fetchFn: this.fetchFn }).then((r) => {
            if (r === "AUTHORIZED") { clearTimeout(timer); resolve(""); }
          }, (e) => { clearTimeout(timer); reject(e); });
        });
      });
      if (code) {
        const p = this.provider(c, null);
        (p as { state?: () => string }).state = () => state;
        await auth(p, { serverUrl: c.url, authorizationCode: code, fetchFn: this.fetchFn });
      }
      c.lastError = null;
      c.connectedAt = new Date().toISOString();
      this.save();
      return { ok: true, message: `Đã kết nối ${c.name}.` };
    } catch (err) {
      c.lastError = errText(err);
      this.save();
      return { ok: false, message: `Không kết nối được ${c.name}: ${c.lastError}` };
    } finally {
      (server as Server | null)?.close();
      this.loginBusy = false;
    }
  }

  logout(id: string) {
    const s = this.secrets[id];
    if (s) { delete s.tokens; delete s.verifier; this.save(); }
  }

  // Máy chủ MCP cho một việc: kết nối đang bật và đã đăng nhập; mã sắp hết hạn thì làm mới trước.
  async forTask(): Promise<{ servers: Record<string, McpServerConfig>; notes: string[] }> {
    const servers: Record<string, McpServerConfig> = {};
    const notes: string[] = [];
    for (const c of this.list.filter((x) => x.enabled)) {
      let t = this.secrets[c.id]?.tokens;
      if (!t?.access_token) { notes.push(`${c.name}: chưa đăng nhập (mục MCP và công cụ).`); continue; }
      const exp = t.expires_in && t.savedAt ? t.savedAt + t.expires_in * 1000 : null;
      if (exp && exp - Date.now() < REFRESH_BEFORE_MS) {
        try {
          // Mỗi kết nối chỉ làm mới một lần một lúc (máy chủ xoay vòng mã làm mới sẽ từ chối lần thứ hai).
          let job = this.refreshing.get(c.id);
          if (!job) {
            job = auth(this.provider(c, null), { serverUrl: c.url, fetchFn: this.fetchFn }).then(() => undefined)
              .finally(() => this.refreshing.delete(c.id));
            this.refreshing.set(c.id, job);
          }
          await job;
          t = this.secrets[c.id]?.tokens;
          c.lastError = null;
        } catch (err) {
          c.lastError = err instanceof NeedsLogin ? "Phiên đăng nhập hết hạn, cần đăng nhập lại." : errText(err);
          this.save();
          notes.push(`${c.name}: ${c.lastError}`);
          continue;
        }
      }
      if (!t?.access_token) continue;
      servers[c.id] = { type: "http", url: c.url, headers: { Authorization: `Bearer ${t.access_token}` } };
    }
    return { servers, notes };
  }

  owns(toolName: string): boolean {
    return this.list.some((c) => toolName.startsWith(`mcp__${c.id}__`));
  }

  decide(toolName: string, level: PermissionLevel, input: unknown = {}): Decision {
    const c = this.list.find((x) => toolName.startsWith(`mcp__${x.id}__`));
    const tool = toolName.slice(`mcp__${c?.id}__`.length);
    if (level === "full") return { decision: "allow", reason: "Đủ quyền" };
    if (READ_TOOL.test(tool)) return { decision: "allow", reason: `${c?.name}: đọc dữ liệu` };
    if (level === "read") return { decision: "deny", reason: `Chế độ Chỉ đọc: không dùng ${tool} của ${c?.name} (có thể gửi/sửa dữ liệu).` };
    // Ghi Google Trang tính: "Đồng ý luôn" theo đúng một bảng tính (việc nạp báo cáo ghi nhiều lần vào cùng sổ).
    const sheetId = (input as { spreadsheetId?: unknown })?.spreadsheetId;
    if (c?.kind === "sheets" && typeof sheetId === "string" && sheetId) {
      return { decision: "ask", reason: `${c.name}: ${tool} ghi vào bảng tính ${sheetId}`, key: `${toolName}@sheet:${sheetId}` };
    }
    return { decision: "ask", reason: `${c?.name}: ${tool} có thể gửi/sửa dữ liệu thật`, noAlways: true };
  }
}

class NeedsLogin extends Error { constructor() { super("Cần đăng nhập lại."); } }

function errText(err: unknown): string {
  const s = err instanceof Error ? err.message : String(err);
  // Không để lộ mã trong thông báo lỗi.
  return s.replace(/(access_token|refresh_token|code|client_secret)=([^&\s]+)/gi, "$1=…").slice(0, 300);
}
