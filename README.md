# Trung Kiên AI Hub

Kho mã (repository) và hồ sơ quản lý của phần mềm chat Zalo.

## Trạng thái — 22/10/2026

- Mới dựng khung: thư mục, quy tắc cho AI, sổ theo dõi.
- Chưa có mã nguồn, chưa chọn ngôn ngữ lập trình.
- Chưa kết nối Zalo hay dữ liệu thật, chưa lưu thông tin nhạy cảm nào (anh Trung chốt 22/10/2026, xem `ho-so/QUYET-DINH.md`).

## Cấu trúc

```
trung-kien-ai-hub/
├── README.md        Giới thiệu, trạng thái, cấu trúc (tệp này)
├── CLAUDE.md        Quy tắc cho AI làm việc trong repo
├── KHOA-VIEC.md     Sổ khoá việc: AI nào đang ghi phạm vi nào
├── .gitignore       Chặn bí mật và dữ liệu thật khỏi git
├── ho-so/           Hồ sơ quản lý dự án
│   ├── NHAT-KY.md     Nhật ký thay đổi
│   ├── SO-LOI.md      Sổ lỗi đã mắc
│   ├── QUYET-DINH.md  Quyết định của anh Trung (nguyên văn, kèm ngày)
│   └── BAN-GIAO.md    Bàn giao giữa các phiên AI
├── docs/            Tài liệu sản phẩm
│   ├── yeu-cau/       Yêu cầu tính năng
│   ├── thiet-ke/      Thiết kế kỹ thuật
│   └── zalo/          Ghi chú nền tảng Zalo: API, giới hạn, điều khoản
├── src/             Mã nguồn (chưa có)
├── tests/           Kiểm thử tự động
├── scripts/         Script tiện ích
├── config/          Cấu hình mẫu, chỉ giá trị giả
└── data/mau/        Dữ liệu giả để thử
```

## Đọc từ đâu

- Người: tệp này, rồi `docs/yeu-cau/`.
- AI (Claude, ChatGPT): `CLAUDE.md` trước khi làm bất cứ việc gì.

## Việc cần chốt trước khi viết mã

1. Phần mềm dùng vào việc gì, ai dùng (anh Trung, nhân viên hay khách hàng).
2. Kênh Zalo: Zalo Official Account (OA, tài khoản doanh nghiệp, có API chính thức; API là cổng để phần mềm gọi sang Zalo) hay tài khoản Zalo cá nhân.
3. Ngôn ngữ lập trình và khung dựng sẵn (framework).
4. Nơi chạy phần mềm: máy trong công ty hay máy chủ thuê.
