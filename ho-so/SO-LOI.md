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

## 3. App không mở cửa sổ khi tệp dữ liệu tạo từ bản trước thiếu cột mới — 22/10/2026 — Claude-1
- Chuyện gì xảy ra: thêm cột `session_total_ok` vào bảng conversations; tệp `hub.db` của lần chạy trước không có cột này, câu lệnh lúc khởi động lỗi, cửa sổ không hiện và không báo gì.
- Nguyên nhân: `CREATE TABLE IF NOT EXISTS` không thêm cột cho bảng đã có; lỗi khởi động không được bắt.
- Cách tránh từ nay: mọi thay đổi cấu trúc dữ liệu thêm một bước trong `HubDb.migrate()` (đánh số bằng `PRAGMA user_version`, chỉ thêm không xoá) kèm test mở tệp bản cũ; lỗi khởi động hiện hộp thông báo.

## 4. Tin chữ do trang web quyết định để xét quyền — 22/10/2026 — Claude-1
- Chuyện gì xảy ra: bản nháp Mốc 2 lấy dòng "Page URL:" cuối cùng trong kết quả công cụ và xét "đăng/lưu/gửi" theo lời mô tả của model; rà soát độc lập chỉ ra trang lạ ghi "Page URL: <site được phép>" vào tiêu đề là được thao tác không hỏi. Chưa phát hành, đã sửa trước bản 0.4.0.
- Nguyên nhân: coi mọi chữ trong kết quả công cụ là đáng tin; không phân biệt phần do công cụ viết và phần do trang viết.
- Cách tránh từ nay: dữ liệu dùng để xét quyền chỉ lấy từ phần công cụ tự viết, ở vị trí cố định; không rõ thì coi là chưa biết và hỏi. Có test giả trang lạ.

## 5. pkill -f tự giết chính lệnh đang chạy — 22/10/2026 — Claude-1
- Chuyện gì xảy ra: `pkill -f "node --test"` trong cùng một lệnh với phần sửa tệp làm lệnh bị dừng (mã 144), phần sửa phía sau không chạy, test treo.
- Cách tránh từ nay: không gộp `pkill -f <mẫu>` với lệnh có chứa chính mẫu đó; dừng tiến trình ở lệnh riêng.

## 6. Kiểm thử phụ thuộc cổng cố định bị chính máy chủ thử chiếm — 22/10/2026 — Claude-1
- Chuyện gì xảy ra: kiểm thử đăng nhập OAuth dùng cổng 8765; máy chủ tĩnh tôi mở để thử giao diện cũng ở 8765 và không tắt, `npm test` treo, AI rà soát cũng bị treo theo.
- Nguyên nhân: cổng cố định trong kiểm thử; máy chủ thử mở nền không dọn; máy chủ giả không đóng khi kiểm thử lỗi.
- Cách tránh từ nay: kiểm thử dùng cổng 0 (hệ điều hành chọn); máy chủ giả đóng trong `t.after`; tắt máy chủ thử ngay sau khi dùng.

## 7. "Đồng ý luôn" theo tên công cụ quá rộng — 22/10/2026 — Claude-1
- Chuyện gì xảy ra: bản nháp 0.5.0 cho "Đồng ý luôn" theo tên công cụ: đồng ý `npm test` là cho mọi lệnh Bash, đồng ý mở Notepad là cho mở mọi chương trình. Rà soát độc lập phát hiện, chưa phát hành.
- Cách tránh từ nay: quyền "luôn cho" phải hẹp đúng thứ anh nhìn thấy trong hộp hỏi (lệnh, thư mục, tên miền, cửa sổ, chương trình + tham số); thao tác nguy hiểm không có nút này. Có test.

## 8. Mở trình duyệt đăng nhập bằng công cụ tự động hoá — 23/10/2026 — Claude-1
- Chuyện gì xảy ra: bản 0.4.0–0.5.0 mở cửa sổ "để anh tự đăng nhập" bằng Playwright; Google báo "trình duyệt hoặc ứng dụng này có thể không an toàn" và không cho đăng nhập. Anh Trung báo sau khi cài.
- Nguyên nhân: trình duyệt do Playwright mở mang cờ tự động hoá; Google chặn đăng nhập trên trình duyệt đó. Không thử với trang đăng nhập Google trước khi phát hành.
- Cách tránh từ nay: chỗ người dùng tự đăng nhập phải mở trình duyệt thường (chạy thẳng chrome.exe). Tính năng gắn với dịch vụ thật phải ghi rõ CHƯA THỂ XÁC MINH và nói trước với anh rủi ro này.

## 9. AI chính thiếu lời dặn môi trường nên hay chạy sai lệnh — 23/10/2026 — Claude-1
- Chuyện gì xảy ra: từ 0.1.0 app chỉ gửi lời dặn hệ thống tối giản (Agent SDK mặc định một câu). AI không biết đang ở Windows, thư mục nào, cách dùng công cụ → chạy lệnh kiểu Linux, lỗi "Exit code 2" liên tục; anh Trung thấy "hay bị lỗi lúc trả lời".
- Cách tránh từ nay: dùng `systemPrompt: { type: "preset", preset: "claude_code", append }`. Khi đổi cách gọi SDK phải đo nội dung thực gửi lên API (máy chủ API giả), không đoán theo tên tham số.

## 10. Cắt chuỗi JSON làm hỏng dữ liệu bước công cụ — 23/10/2026 — Claude-1
- Chuyện gì xảy ra: bản nháp 0.6.0 cắt dữ liệu vào của bước công cụ ở 2000 ký tự rồi thêm "…" → JSON hỏng, tệp dài không có thẻ Mở. Rà soát độc lập phát hiện, chưa phát hành.
- Cách tránh từ nay: cắt từng giá trị chuỗi bên trong (`clipInput`), không cắt chuỗi đã mã hoá. Có test.
