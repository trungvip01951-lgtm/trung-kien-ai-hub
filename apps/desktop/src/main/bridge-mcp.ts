// Máy chủ MCP "trung-kien-hub" cho app Claude (máy tính) và Claude Code: chạy riêng (Electron ở chế độ Node,
// ELECTRON_RUN_AS_NODE=1), nói chuyện với app Claude qua stdin/stdout, chuyển lệnh về Hub qua HTTP 127.0.0.1.
// Không dùng thư viện ngoài (tệp này được giải nén khỏi app.asar và chạy một mình).
// Cách chạy: <Trung Kiên AI Hub.exe> <…>/bridge-mcp.js --data <thư mục dữ liệu của Hub>
import { readFileSync } from "node:fs";
import { request } from "node:http";
import path from "node:path";

const dataArg = process.argv.indexOf("--data");
const dataDir = dataArg > 0 ? process.argv[dataArg + 1] : "";

const TOOLS = [
  { name: "hub_du_an", description: "Liệt kê các dự án trong Trung Kiên AI Hub (tên, thư mục). Dùng trước khi giao việc để lấy đúng tên dự án.",
    inputSchema: { type: "object", properties: {} } },
  { name: "hub_giao_viec", description: "Giao một việc cho Trung Kiên AI Hub làm trong một dự án. Hub chạy bằng API key của anh Trung (tính tiền theo API, có hạn mức), dùng Skills, CLAUDE.md/AGENTS.md, kết nối và quyền của dự án. Trả về taskId; sau đó gọi hub_ket_qua để chờ và lấy kết quả. Truyền conversationId để làm tiếp trong cùng hội thoại (nếu hội thoại đang chạy, tin được gửi thêm vào việc đang làm).",
    inputSchema: { type: "object", required: ["project", "prompt"], properties: {
      project: { type: "string", description: "Tên (hoặc mã số) dự án trong Hub" },
      prompt: { type: "string", description: "Yêu cầu đầy đủ, tự đủ ý (Hub không thấy cuộc trò chuyện này)" },
      conversationId: { type: "number", description: "Mã hội thoại Hub để làm tiếp (lấy từ kết quả lần trước)" } } } },
  { name: "hub_ket_qua", description: "Chờ tối đa `wait` giây (mặc định 30, tối đa 55) rồi trả trạng thái và câu trả lời của việc trong Hub: status (running/done/error/stopped/budget), answer, files (tệp đã tạo/sửa), costUsd. Chưa xong (finished=false) thì gọi lại. Nếu waitingForPermission có chữ: anh Trung cần bấm cho phép trong cửa sổ Hub.",
    inputSchema: { type: "object", required: ["taskId"], properties: { taskId: { type: "number" }, wait: { type: "number" } } } },
  { name: "hub_viec_dang_chay", description: "Liệt kê các việc Hub đang chạy.", inputSchema: { type: "object", properties: {} } },
  { name: "hub_dung", description: "Dừng một việc đang chạy trong Hub.", inputSchema: { type: "object", required: ["taskId"], properties: { taskId: { type: "number" } } } },
];
const ACTION: Record<string, string> = { hub_du_an: "projects", hub_giao_viec: "start", hub_ket_qua: "result", hub_viec_dang_chay: "running", hub_dung: "stop" };

function callHub(action: string, args: unknown): Promise<unknown> {
  let info: { enabled?: boolean; port?: number; token?: string };
  try { info = JSON.parse(readFileSync(path.join(dataDir, "bridge.json"), "utf8")); }
  catch { return Promise.reject(new Error("Chưa bật kết nối: mở Trung Kiên AI Hub → MCP và công cụ → Kết nối với app Claude → Bật.")); }
  if (!info.enabled || !info.port || !info.token) return Promise.reject(new Error("Kết nối với app Claude đang tắt trong Trung Kiên AI Hub."));
  const body = JSON.stringify(args ?? {});
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: info.port, method: "POST", path: `/api/${action}`, timeout: 70_000,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), authorization: `Bearer ${info.token}` } }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`Hub từ chối (${res.statusCode}). Mở lại Hub hoặc bật lại kết nối.`));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error("Hub trả dữ liệu hỏng.")); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("Hub không trả lời.")));
    req.on("error", () => reject(new Error("Không nối được Trung Kiên AI Hub: mở app Hub lên (kết nối chỉ chạy khi Hub đang mở).")));
    req.end(body);
  });
}

function send(msg: unknown) { process.stdout.write(`${JSON.stringify(msg)}\n`); }

async function onMessage(m: { id?: number | string; method?: string; params?: Record<string, unknown> }) {
  const reply = (result: unknown) => { if (m.id !== undefined) send({ jsonrpc: "2.0", id: m.id, result }); };
  switch (m.method) {
    case "initialize":
      return reply({ protocolVersion: typeof m.params?.protocolVersion === "string" ? m.params.protocolVersion : "2025-06-18",
        capabilities: { tools: {} }, serverInfo: { name: "trung-kien-hub", version: "1.0.0" },
        instructions: "Trung Kiên AI Hub: giao việc làm trong các dự án của anh Trung, chạy bằng API key riêng. Gọi hub_du_an, rồi hub_giao_viec, rồi hub_ket_qua cho tới khi finished=true." });
    case "ping": return reply({});
    case "tools/list": return reply({ tools: TOOLS });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      if (!ACTION[name]) return reply({ content: [{ type: "text", text: `Không có công cụ ${name}.` }], isError: true });
      try {
        const r = await callHub(ACTION[name], m.params?.arguments) as { error?: string };
        return reply({ content: [{ type: "text", text: JSON.stringify(r, null, 1) }], isError: !!r?.error });
      } catch (err) {
        return reply({ content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true });
      }
    }
    default:
      if (m.id !== undefined && m.method) send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `Không hỗ trợ ${m.method}` } });
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buf += chunk;
  let i: number;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try { void onMessage(JSON.parse(line)); } catch { /* dòng hỏng: bỏ qua */ }
  }
});
process.stdin.on("end", () => process.exit(0));
