# Các gói dùng chung

Từ Mốc 1, mã lõi nằm trong `apps/desktop/src/main/` (một ứng dụng duy nhất dùng nên chưa tách gói, tránh phức tạp khi đóng gói). Tách ra đây khi có ứng dụng hoặc dịch vụ thứ hai cần dùng chung.

| Gói dự kiến (yêu cầu gốc mục XIV) | Hiện ở | Mốc |
|---|---|---|
| `agent-core` | `src/main/agent.ts` | 1 |
| `usage-monitor` | `src/main/budget.ts`, `pricing.ts` | 1 |
| `memory` | `src/main/db.ts` (SQLite + FTS5) | 1 |
| `security` | `src/main/keystore.ts`, `policy.ts` | 1 |
| `project-manager` | `src/main/db.ts` (bảng projects) | 1 |
| `browser-automation` | chưa có | 2 |
| `skills-manager`, `mcp-manager` | chưa có (SDK tự nạp Skills/MCP từ `.claude/`) | 3 |
| `windows-automation` | chưa có | 4 |
