# Bàn giao giữa các phiên AI

Mục mới nối xuống cuối, theo mẫu chung (skill `quy-tac-lam-viec-chung`, `assets/BAN-GIAO.md`). Viết để AI khác đọc xong làm tiếp được ngay.

## BÀN GIAO: Trung Kiên AI Hub · Claude-1 · 22/10/2026 16:29

- Việc đã làm: dựng khung dự án: `README.md`, `CLAUDE.md`, `KHOA-VIEC.md`, `.gitignore`, 4 tệp trong `ho-so/`, 8 thư mục (`docs/yeu-cau`, `docs/thiet-ke`, `docs/zalo`, `src`, `tests`, `scripts`, `config`, `data/mau`) mỗi thư mục có README nói rõ để gì.
- Làm tới đâu: xong toàn bộ, commit trên nhánh `claude/intelligent-hopper-v2t54v`.
- Nghiệm thu: README ĐẠT; CLAUDE.md ĐẠT; thư mục ĐẠT (8/8 có README); không kết nối dữ liệu thật ĐẠT (phiên không gọi Zalo hay API nào; `git grep` không thấy mật khẩu, mã truy cập, số điện thoại); `.gitignore` ĐẠT (chặn 7/7 mẫu thử bí mật và dữ liệu thật, cho qua 4/4 mẫu được phép).
- Còn lại: chưa có mã nguồn; chờ anh Trung chốt 4 việc ở `README.md`.
- Tệp kết quả: gốc repo.
- Sao lưu để hoàn tác: commit gốc `a89f1fa` (Initial commit); `git revert` commit dựng khung là quay về.
- Khoá đã nhả: toàn bộ repo (dòng Claude-1 trong `KHOA-VIEC.md`).
- Việc cần anh Trung: 4 việc ở `README.md`, mục "Việc cần chốt trước khi viết mã".

## BÀN GIAO: Trung Kiên AI Hub · Claude-1 · 22/10/2026 16:52

- Việc đã làm: Mốc 0 theo `docs/KE-HOACH.md`: khung Electron + TypeScript chạy Agent SDK, CI build file cài Windows, kiểm tra khói tự động.
- Làm tới đâu: xong Mốc 0, commit b21bdc8 trên nhánh `claude/intelligent-hopper-v2t54v`, CI xanh.
- Nghiệm thu: build .exe ĐẠT; cài im lặng trên Windows (máy CI) ĐẠT; claude.exe đi kèm chạy được trong bản đã cài ĐẠT; nạp Agent SDK ĐẠT; cài và mở trên máy thật của anh Trung CHƯA THỂ XÁC MINH (chờ anh thử). Bằng chứng: https://github.com/trungvip01951-lgtm/trung-kien-ai-hub/actions/runs/39758317711
- Còn lại: Mốc 1 (API key DPAPI, chat streaming, lịch sử SQLite/FTS5, chi phí và hạn mức). Nâng actions lên bản Node 24.
- Tệp kết quả: `apps/desktop/`, `.github/workflows/build-windows.yml`; file cài ở Artifacts của lần chạy CI trên.
- Sao lưu để hoàn tác: commit trước Mốc 0 là da0f355.
- Khoá đã nhả: toàn bộ repo (dòng Mốc 0 trong `KHOA-VIEC.md`).
- Việc cần anh Trung: 1. Tải file cài từ Artifacts, cài trên máy, báo mở được cửa sổ "Trung Kiên AI Hub" hay không. 2. Tổ chức Console nhận tín dụng: không gắn thẻ, không bật auto-reload.
