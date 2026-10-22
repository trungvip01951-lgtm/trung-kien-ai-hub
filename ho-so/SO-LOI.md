# Sổ lỗi đã mắc

Đọc trước khi làm để không lặp lỗi. Mục mới nối xuống cuối, đánh số tăng dần, theo mẫu:

```
## <số>. <tên lỗi ngắn> — dd/mm/yyyy — <tên AI>
- Chuyện gì xảy ra:
- Nguyên nhân:
- Cách tránh từ nay:
```

## 1. Agent thừa hưởng đăng nhập của phiên cloud, gọi API thật dù dùng key giả — 22/10/2026 — Claude-1
- Chuyện gì xảy ra: chạy thử AgentRunner với Agent SDK thật và key giả trên máy cloud; lượt gọi vẫn thành công, ước tính ~0,0082 USD. Phí tính vào phiên Claude Code cloud (gói Max của anh Trung), không phải tín dụng API; không có dữ liệu thật. Trái quyết định 22/10/2026 "không gọi Claude API thật trên cloud".
- Nguyên nhân: `agentEnv` chép toàn bộ `process.env` rồi chỉ bỏ vài biến; các biến `CLAUDE_CODE_REMOTE`, `CLAUDE_SESSION_INGRESS_TOKEN_FILE`… của máy cloud lọt vào tiến trình agent và nó đăng nhập bằng phiên đang chạy. `apiKeySource` vẫn báo `ANTHROPIC_API_KEY` nên lớp kiểm tra không phát hiện.
- Cách tránh từ nay: `agentEnv` bỏ mọi biến bắt đầu bằng `ANTHROPIC_`, `CLAUDE`, `CCR_` (có test). Trên cloud chỉ chạy agent thật khi đã chứng minh môi trường sạch (key giả phải ra lỗi 401). Không coi `apiKeySource` là bằng chứng duy nhất về nguồn tính phí.

## 2. Key sai bị ghi là "Xong" — 22/10/2026 — Claude-1
- Chuyện gì xảy ra: với key sai, SDK trả `result` có `subtype: "success"` nhưng `is_error: true` ("Invalid API key"); phần lõi ghi trạng thái Xong.
- Nguyên nhân: chỉ đọc `subtype`, không đọc `is_error`.
- Cách tránh từ nay: luôn xét `is_error` của kết quả và trường `error` của tin nhắn assistant (có test).
