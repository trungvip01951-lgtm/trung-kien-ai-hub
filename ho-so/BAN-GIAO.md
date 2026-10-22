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

## BÀN GIAO: Trung Kiên AI Hub · Claude-1 · 22/10/2026 17:41

- Việc đã làm: Mốc 1, bản 0.1.0: chat agent bằng API key, hạn mức chi phí, phân quyền, lịch sử, giao diện 13 mục, tự cập nhật. Chi tiết: `ho-so/NHAT-KY.md` mục 22/10/2026 17:41.
- Làm tới đâu: commit bf4ec86, CI https://github.com/trungvip01951-lgtm/trung-kien-ai-hub/actions/runs/39764432530 xanh (24 test, build, kiểm tra khói bản chưa cài và bản đã cài); Release https://github.com/trungvip01951-lgtm/trung-kien-ai-hub/releases/tag/v0.1.0.
- Nghiệm thu (tiêu chí mục XVI): 1 cài được ĐẠT trên máy CI; 2 chat với Claude API, 3 tính phí theo API key, 19 theo dõi chi phí, 20 dừng khi chạm hạn mức: ĐẠT trên agent giả + SDK thật với key giả, CHƯA THỂ XÁC MINH với key thật (chờ anh); 4 mở dự án, 7 đọc CLAUDE.md, 5 đọc Skills: SDK nạp 19–92 skills trên cloud, CHƯA THỂ XÁC MINH trên máy anh; 8 lưu lịch sử, 9 đóng/mở không mất dữ liệu: ĐẠT bằng test; 10 tiếp tục phiên: ĐẠT bằng test (resume), chưa thử thật; 22 phân quyền: ĐẠT bằng test.
- Còn lại: Mốc 2 (Chrome). Lỗi đã biết: việc kéo qua 0h tính vào ngày bắt đầu; actions v4 chạy Node 20 (cảnh báo).
- Tệp kết quả: `apps/desktop/`; file cài ở Release v0.1.0.
- Sao lưu để hoàn tác: commit trước Mốc 1 là 263aab7.
- Khoá đã nhả: toàn bộ repo (dòng Mốc 1 trong `KHOA-VIEC.md`).
- Việc cần anh Trung: 1. Cài bản 0.1.0 (bản 0.0.1 không tự cập nhật được). 2. Nhập API key, bấm Kiểm tra key. 3. Thêm một dự án, giao một việc nhỏ, báo kết quả.

## BÀN GIAO: Trung Kiên AI Hub · Claude-1 · 22/10/2026 20:58

- Việc đã làm: Mốc 1 xong tới bản 0.2.1 (nhiều API key tự chuyển, nút cập nhật, báo lỗi key chưa gắn workspace). Anh Trung xác nhận: tự cập nhật chạy, key trong workspace kiểm tra đạt, giao việc thử chạy được.
- Làm tới đâu: nhánh `claude/intelligent-hopper-v2t54v`, Release mới nhất v0.2.1, CI xanh, 32/32 test.
- Nghiệm thu: Mốc 1 ĐẠT theo xác nhận của anh Trung; đối chiếu chi phí app với Console CHƯA THỂ XÁC MINH (chưa có số).
- Còn lại: làm Mốc 3 rồi Mốc 2 theo `docs/KE-HOACH.md` mục "Phạm vi Mốc 3 và Mốc 2", trong cuộc trò chuyện mới (quyết định cùng giờ). Phiên mới: đọc CLAUDE.md theo thứ tự, nhận khoá trong KHOA-VIEC.md, phiên bản đang làm dùng hậu tố `-dev`.
- Tệp kết quả: `apps/desktop/`.
- Sao lưu để hoàn tác: các tag v0.1.0, v0.1.1, v0.2.0, v0.2.1.
- Khoá đã nhả: không giữ khoá nào.
- Việc cần anh Trung: 1. Gửi số "Hôm nay" trong mục Chi phí API của app và số chi tiêu cùng ngày trong Console để đối chiếu. 2. Chuẩn bị 1 tệp Skill (.zip) và 1 thư mục dự án thật để nghiệm thu Mốc 3.
