# Kế hoạch Trung Kiên AI Hub

Yêu cầu gốc: `docs/YEU-CAU-GOC.md` (nguyên văn của anh Trung, không sửa). Tệp này ghi cách làm đã chốt và các sự thật đã kiểm.

## Sự thật đã kiểm (tra 22/10/2026)

| Điều | Kết quả | Nguồn |
|---|---|---|
| Tín dụng API gói Max | Max 5x: 100 USD/tháng, Max 20x: 200 USD/tháng; hết hạn cuối mỗi kỳ thanh toán, không cộng dồn | support.claude.com/en/articles/17154008 |
| Phạm vi dùng tín dụng | Claude API, Agent SDK, `claude -p` bằng API key của tổ chức Console đã liên kết; KHÔNG dùng cho Claude Code tương tác | như trên |
| Hết tín dụng | Không có tín dụng mua thêm hoặc auto-reload thì API ngừng, không trừ tiền gói | như trên |
| Agent SDK | Tự nạp Skills, lệnh, CLAUDE.md từ `.claude/` dự án và `~/.claude/`; có hooks, subagents, MCP, permissions, resume/fork phiên, plugins, `enableFileCheckpointing`, `maxBudgetUsd` (ước tính phía máy, có thể vượt nhẹ) | code.claude.com/docs/en/agent-sdk/overview, /typescript |
| Xác thực | Bắt buộc API key; không dùng đăng nhập claude.ai; không đặt tên/giao diện giống "Claude Code" | agent-sdk/overview |
| Lọt đăng nhập | Tiến trình agent thừa hưởng biến CLAUDE_*/ANTHROPIC_* sẽ đăng nhập bằng nguồn khác dù `apiKeySource` báo API key; khối `env`/`apiKeyHelper` trong settings cũng vậy | đo 22/10/2026, sổ lỗi mục 1 |
| Key sai | SDK trả `result` subtype `success` kèm `is_error: true` | đo 22/10/2026 |
| Đóng gói | SDK chạy kèm tệp `claude.exe` (gói `@anthropic-ai/claude-agent-sdk-win32-x64`); phải giải nén khỏi app.asar | đo trong Mốc 0 |
| systemPrompt mặc định | Không đặt thì SDK gửi 1 câu "You are a Claude agent, built on Anthropic's Claude Agent SDK."; preset claude_code ~6.560 ký tự | đo bằng máy chủ API giả 22/10/2026 |
| Plugin cục bộ | `plugins: [{type:"local", path}]` nạp `skills/` của thư mục; Skill tên `<tên plugin>:<tên skill>`; không cần plugin.json (lấy tên thư mục) | đo 22/10/2026 |
| Playwright MCP 0.0.83 | Đăng 28/09/2026; `--allowed-origins` "không phải hàng rào bảo mật" nên app tự kiểm quyền; mặc định 25 công cụ, không có cookie/storage (bật bằng --caps); `browser_navigate` ghi snapshot ra tệp trong `--output-dir`, `browser_snapshot` trả trực tiếp; chạy được bằng Electron ở chế độ Node; công cụ MCP bị hoãn sau ToolSearch nhưng gọi thẳng vẫn chạy | README gói, đo 22/10/2026 |
| Browser use tool | `browser_toolset_20260801`, GA, chạy phía máy khách; chưa xác minh dùng được trong Agent SDK | platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool |

## Cách làm đã chốt

- Không viết lại thứ Agent SDK đã có. Các "Agent" chuyên môn là tệp mô tả subagent; SEO, Ads, catalogue, Zalo chạy bằng Skills + MCP sẵn có trước, chỉ viết module riêng khi chưa đủ.
- Chrome: Playwright MCP. Windows: tìm MCP có sẵn, kiểm chứng rồi mới tự viết.
- Cloud chỉ chứa mã và dữ liệu giả. API key, dữ liệu thật chỉ trong app trên máy anh Trung.
- Mỗi mốc một phiên làm việc; xong mốc anh dùng thử rồi mới sang mốc sau.
- Model khi xây: Opus 5.5 (thiết kế, chi phí, bảo mật, nghiệm thu), Sonnet 5.5 (viết mã theo thiết kế), Haiku 5.5 (việc cơ học).

## Các mốc

| Mốc | Nội dung | Tiêu chí (mục XVI yêu cầu gốc) | Trạng thái |
|---|---|---|---|
| 0 | Khung Electron + TypeScript, Agent SDK đóng gói được, GitHub Actions build .exe, cài im lặng và kiểm tra khói trên Windows | 1 (trên máy CI) | ĐẠT trên máy CI 22/10/2026; chờ anh cài thử trên máy thật |
| 1 | API key (DPAPI), chọn dự án, chat streaming qua Agent SDK, hiện bước công cụ, lịch sử SQLite/FTS5, dừng/tiếp tục, token và chi phí, hạn mức công việc/ngày/tháng có chặn cứng | 1–9, 17–20 | Bản 0.2.1: anh Trung xác nhận chạy được trên máy với API key thật (22/10/2026 20:53); chưa đối chiếu chi phí với Console |
| 2 | Chrome: hồ sơ riêng, quyền theo website, xác nhận thao tác rủi ro | 11–13 | Bản 0.4.0 (22/10/2026): đạt trên cloud (Chromium, trang thử, máy chủ API giả); chờ anh nghiệm thu trên Chrome thật |
| 3 | Kiểm kê và nhập dự án cũ trên máy anh (chỉ đọc), thử tiếp tục 1 việc thật mỗi nhóm | 24–25 | Bản 0.3.0 (22/10/2026): đạt trên cloud (test + SDK thật key giả); chờ anh nghiệm thu với Skill và dự án thật |
| 4 | Windows, Excel/Word/PDF, sao lưu/khôi phục, hàng đợi, lịch | 14–16, 21–23 | Bản 0.5.0 (22/10/2026): đạt bằng test trên cloud + Windows thật trên CI; chờ anh nghiệm thu |
| 5 | Module nghiệp vụ (Search Console, Google Ads API, catalogue, Zalo/AI Desk) khi Skills chưa đủ | — | Bản 0.5.0: 10 AI chuyên môn + bộ nhớ dài hạn; SEO/Ads qua Windsor.ai, catalogue qua Skills + công cụ tài liệu. Zalo chưa làm: cần anh quyết (xem BAN-GIAO) |

## Việc anh Trung tự làm (không cần code)

- Tổ chức Console nhận tín dụng: không gắn thẻ, không bật auto-reload, để hết tín dụng thì API tự ngừng.
- File .exe chưa ký số: Windows sẽ cảnh báo khi cài, chọn "Thông tin thêm" → "Vẫn chạy".

## Phạm vi Mốc 3 và Mốc 2 (anh Trung chốt 22/10/2026, xem ho-so/QUYET-DINH.md)

Làm Mốc 3 rồi làm luôn Mốc 2, mỗi mốc ra một bản phát hành để anh cập nhật bằng nút trong app.

**Mốc 3 — Nhập dự án và Skills (bản 0.3.x)**
- Mục **Skills** trong app: nút **Tải Skill lên** giống claude.ai: nhận tệp `.zip` (một hoặc nhiều thư mục có `SKILL.md`) hoặc chọn thư mục có `SKILL.md`. Kiểm `SKILL.md` có phần đầu `name`/`description`, báo trùng tên, giữ bản cũ để khôi phục, bật/tắt, xoá. Không chạy script nào khi nhập.
- Nơi lưu Skills của app: thư mục dữ liệu app (không ghi vào `~/.claude` của Claude Code). Cách nạp cho agent cần kiểm tài liệu Agent SDK trước (gợi ý: tuỳ chọn `plugins` nạp thư mục cục bộ có `skills/`); đo bằng `skills` trong tin nhắn init.
- Mục **Dự án**: nút **Quét thư mục** chỉ đọc các thư mục anh chọn: tìm `CLAUDE.md`, `.claude/` (skills, agents, settings), `.mcp.json`, sổ bàn giao/nhật ký/TODO, git. Lập bảng PROJECT_INVENTORY (yêu cầu gốc mục II), cho thêm dự án vào app một chạm. Không sửa, không chép dữ liệu dự án; dữ liệu Thịnh Vượng không đưa vào.
- Nghiệm thu: anh tải 1 Skill thật lên, agent liệt kê được Skill đó và dùng được trong một việc; quét 1 thư mục dự án thật, mở dự án và tiếp tục 1 việc cũ.

**Mốc 2 — Điều khiển Chrome (bản 0.4.x)**
- Playwright MCP (kiểm phiên bản và tài liệu chính thức trước khi ghim), hồ sơ trình duyệt riêng trong thư mục dữ liệu app, không dùng Chrome chính.
- Danh sách website được phép; thao tác đăng/lưu/gửi/sửa tài khoản luôn hỏi anh. Không vượt CAPTCHA, không lấy cookie/token.
- Kiểm trên cloud bằng Chromium có sẵn với trang thử; nghiệm thu thật trên máy anh.
