# CLAUDE.md — Trung Kiên AI Hub

Quy tắc riêng của dự án, áp dụng cho mọi AI (Claude, ChatGPT) làm trong repo này. Đọc hết trước khi ghi.

## Thứ tự ưu tiên

Yêu cầu mới nhất của anh Trung > tệp này > quy tắc làm việc chung (skill `quy-tac-lam-viec-chung`, bản 08/10/2026). Quy tắc chung không chép vào đây; muốn đổi thì sửa ở nơi gốc.

## Đầu phiên, đọc theo thứ tự

1. `KHOA-VIEC.md`: ai đang giữ phạm vi nào.
2. `docs/KE-HOACH.md`: mốc đang làm, sự thật đã kiểm. Yêu cầu gốc `docs/YEU-CAU-GOC.md` chỉ đọc đúng mục liên quan.
3. `ho-so/QUYET-DINH.md`: việc anh Trung đã chốt, không hỏi lại.
4. `ho-so/SO-LOI.md`: lỗi đã mắc, tránh lặp.
5. `ho-so/NHAT-KY.md`: vài mục gần nhất.
6. `ho-so/BAN-GIAO.md`: phiên trước dừng ở đâu.

Cấu trúc thư mục xem `README.md`.

## Giới hạn hiện tại (anh Trung chốt 22/10/2026)

- Trên cloud: không API key, không gọi Claude API thật, không dữ liệu thật. API key và dữ liệu thật chỉ nằm trong app đã cài trên máy anh.
- Chưa kết nối dữ liệu thật: không gọi API Zalo, không đăng nhập tài khoản Zalo, không đọc tin nhắn hay danh bạ thật.
- Chưa truy cập thông tin nhạy cảm: không hỏi, không lưu mật khẩu, mã truy cập (access token), khoá bí mật (secret key), số điện thoại hay thông tin khách thật.
- Muốn mở giới hạn nào phải có lệnh mới của anh Trung, ghi nguyên văn vào `ho-so/QUYET-DINH.md` trước khi làm.

## Dữ liệu và bí mật

- Chỉ dùng dữ liệu giả, đặt trong `data/mau/`. Dữ liệu giả phải nhìn là biết giả: "Khách Mẫu A", số `0000000001`.
- Bí mật sau này để trong `.env` hoặc tệp `*.local.*` (đã bị `.gitignore` chặn); không ghi vào mã, tài liệu, nhật ký hay commit (lần lưu thay đổi lên git).
- Trước mỗi commit: xem `git diff --cached`, bảo đảm không có số thật, mã truy cập hay mật khẩu.

## Làm chung nhiều AI

- Trước khi ghi: thêm dòng vào `KHOA-VIEC.md` (tên AI, phạm vi, giờ bắt đầu). Phạm vi AI khác đang giữ thì không ghi.
- Tệp trong `ho-so/`: chỉ nối thêm đoạn của mình, đọc lại ngay trước khi ghi, không sửa đoạn của AI khác.
- Xong hoặc dừng: điền giờ nhả và kết quả vào sổ khoá, ghi bàn giao vào `ho-so/BAN-GIAO.md`.

## Ghi hồ sơ ngay trong lượt làm

| Có gì | Ghi vào |
|---|---|
| Thay đổi mã hoặc tài liệu | `ho-so/NHAT-KY.md` |
| Lỗi mới mắc | `ho-so/SO-LOI.md` |
| Quyết định của anh Trung | `ho-so/QUYET-DINH.md` (nguyên văn, kèm ngày) |
| Dừng hoặc chuyển phiên | `ho-so/BAN-GIAO.md` |

Ngày viết dd/mm/yyyy, giờ Việt Nam (UTC+7).

## Mã nguồn

- Electron + TypeScript, Node 22, mã ở `apps/desktop/`. Phiên bản thư viện ghim cứng (không dùng `^`); đổi phiên bản phải kiểm tài liệu chính thức và ghi nhật ký.
- Agent SDK chạy kèm tệp `claude.exe`; bản đóng gói phải giữ `asarUnpack` cho `node_modules/@anthropic-ai/**`, nếu không ứng dụng không chạy được agent.
- Trước khi đẩy mã: `npm test` và `npm run smoke` trong `apps/desktop` (trên Linux cần `xvfb-run -a`). CI "Build Windows" phải xanh.
- Phát hành: tăng `version` trong `apps/desktop/package.json` → CI đăng GitHub Release → app đã cài tự cập nhật. Phiên bản có dấu `-` (ví dụ `0.1.0-dev.1`) là bản đang làm, CI không đăng. Chỉ bỏ hậu tố khi đã kiểm thử xong; mỗi bản ghi nhật ký.
- Trên cloud không chạy agent thật bằng biến môi trường thừa hưởng (sổ lỗi mục 1). Kiểm thử agent dùng agent giả trong `src/main/agent.test.ts`.
- Không viết lại thứ Agent SDK đã có (Skills, CLAUDE.md, subagents, hooks, MCP, phiên). Lý do: `docs/KE-HOACH.md`.
- Không đặt tên hay giao diện giống "Claude Code" (quy định của Agent SDK).
