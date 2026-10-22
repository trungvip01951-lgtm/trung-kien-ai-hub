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
| Đóng gói | SDK chạy kèm tệp `claude.exe` (gói `@anthropic-ai/claude-agent-sdk-win32-x64`); phải giải nén khỏi app.asar | đo trong Mốc 0 |
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
| 0 | Khung Electron + TypeScript, Agent SDK đóng gói được, GitHub Actions build .exe, cài im lặng và kiểm tra khói trên Windows | 1 (trên máy CI) | xem `ho-so/BAN-GIAO.md` |
| 1 | API key (DPAPI), chọn dự án, chat streaming qua Agent SDK, hiện bước công cụ, lịch sử SQLite/FTS5, dừng/tiếp tục, token và chi phí, hạn mức công việc/ngày/tháng có chặn cứng | 1–9, 17–20 | chưa làm |
| 2 | Chrome: hồ sơ riêng, quyền theo website, xác nhận thao tác rủi ro | 11–13 | chưa làm |
| 3 | Kiểm kê và nhập dự án cũ trên máy anh (chỉ đọc), thử tiếp tục 1 việc thật mỗi nhóm | 24–25 | chưa làm |
| 4 | Windows, Excel/Word/PDF, sao lưu/khôi phục, hàng đợi, lịch | 14–16, 21–23 | chưa làm |
| 5 | Module nghiệp vụ (Search Console, Google Ads API, catalogue, Zalo/AI Desk) khi Skills chưa đủ | — | chưa làm |

## Việc anh Trung tự làm (không cần code)

- Tổ chức Console nhận tín dụng: không gắn thẻ, không bật auto-reload, để hết tín dụng thì API tự ngừng.
- File .exe chưa ký số: Windows sẽ cảnh báo khi cài, chọn "Thông tin thêm" → "Vẫn chạy".
