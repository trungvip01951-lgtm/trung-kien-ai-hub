# Nhật ký thay đổi

Mục mới nối xuống cuối. Mỗi mục: `## dd/mm/yyyy hh:mm — <tên AI>`, sau đó gạch đầu dòng: đổi gì, tệp nào, lý do.

## 22/10/2026 16:27 — Claude-1
- Dựng khung dự án theo yêu cầu anh Trung: `README.md`, `CLAUDE.md`, `KHOA-VIEC.md`, `.gitignore`, `ho-so/`, `docs/` (yeu-cau, thiet-ke, zalo), `src/`, `tests/`, `scripts/`, `config/`, `data/mau/`.
- `.gitignore` chặn `.env`, tệp `*.local.*`, khoá bí mật, log, và mọi thứ trong `data/` trừ `data/mau/`.
- Chưa có mã, chưa kết nối Zalo, chưa dùng dữ liệu thật.

## 22/10/2026 16:52 — Claude-1
- Mốc 0 (commit b21bdc8): `apps/desktop` Electron 44.9.3 + TypeScript 5.9.3, Agent SDK 0.3.308, electron-builder 26.17.0 (ghim cứng). Chế độ `--smoke-test`: tìm, chạy `claude --version`, nạp SDK; không gọi API.
- `asarUnpack` cho `node_modules/@anthropic-ai/**`; đường dẫn `claude.exe` đổi `app.asar` → `app.asar.unpacked` (`src/sdk-path.ts`).
- Thêm `.github/workflows/build-windows.yml`, `docs/YEU-CAU-GOC.md` (chép nguyên văn, `cmp` khớp), `docs/KE-HOACH.md`, `packages/README.md`, `release/README.md`; bỏ `src/`; cập nhật README, CLAUDE.md, .gitignore.
- Kết quả đo: Linux bản chưa đóng gói và bản đóng gói (linux-unpacked) 3/3 kiểm tra ĐẠT. CI Windows lần 1 (https://github.com/trungvip01951-lgtm/trung-kien-ai-hub/actions/runs/39758317711): build, kiểm tra khói win-unpacked 3/3 ĐẠT, cài im lặng vào `%LOCALAPPDATA%\Programs\trung-kien-ai-hub` rồi kiểm tra khói 3/3 ĐẠT; file cài tải lên Artifacts (224.088.164 byte, đã nén).
- Cảnh báo CI: actions/checkout@v4, setup-node@v4, upload-artifact@v4 dùng Node 20 đã bị GitHub ngừng hỗ trợ (vẫn chạy). Để Mốc 1 nâng.
