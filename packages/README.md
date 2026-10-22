# Các gói dùng chung

Tạo dần theo mốc trong `docs/KE-HOACH.md`, mỗi gói một thư mục, chỉ tạo khi có mã thật:

| Gói | Mốc | Việc |
|---|---|---|
| `agent-core` | 1 | Gọi Agent SDK, phiên, tiếp tục phiên |
| `usage-monitor` | 1 | Đếm token, chi phí, hạn mức, chặn cứng |
| `memory` | 1 | SQLite + FTS5: lịch sử, tìm kiếm |
| `security` | 1 | Lưu API key (DPAPI), ba mức quyền |
| `project-manager` | 1 | Danh sách dự án, thư mục gốc |
| `browser-automation` | 2 | Chrome qua Playwright MCP |
| `skills-manager`, `mcp-manager` | 3 | Nhập, bật/tắt Skills và MCP |
| `windows-automation` | 4 | Điều khiển Windows |
