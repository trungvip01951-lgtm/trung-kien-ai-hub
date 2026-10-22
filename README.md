# Trung Kiên AI Hub

Ứng dụng AI Agent cho Windows của anh Trung: giao việc bằng tiếng Việt như Claude Cowork, chạy bằng tín dụng Claude API (qua Claude Agent SDK) thay cho hạn mức gói Max, có giới hạn chi phí. Yêu cầu đầy đủ: `docs/YEU-CAU-GOC.md`. Kế hoạch và các mốc: `docs/KE-HOACH.md`.

## Trạng thái — 22/10/2026

- Mốc 1 (bản 0.2.0): nhập nhiều API key theo thứ tự ưu tiên, key hết tiền/lỗi tự chuyển key kế tiếp (mã hoá DPAPI), chọn dự án, chat với agent theo dòng chữ chạy dần, hiện bước công cụ, hỏi xác nhận trước lệnh/thao tác rủi ro, lịch sử SQLite có tìm kiếm, dừng/tiếp tục hội thoại, đếm token và chi phí, hạn mức việc/ngày/kỳ có chặn cứng, tự cập nhật từ GitHub Releases.
- Trên cloud không có API key và dữ liệu thật (anh Trung chốt 22/10/2026, xem `ho-so/QUYET-DINH.md`).

## Cấu trúc

```
trung-kien-ai-hub/
├── README.md, CLAUDE.md, KHOA-VIEC.md
├── apps/desktop/        Ứng dụng Electron + TypeScript
├── packages/            Gói dùng chung, tạo dần theo mốc
├── docs/                YEU-CAU-GOC.md, KE-HOACH.md, yeu-cau/, thiet-ke/, zalo/
├── ho-so/               Nhật ký, sổ lỗi, quyết định, bàn giao
├── tests/, scripts/, config/, data/mau/
├── release/             File cài không lưu ở đây, lấy ở GitHub Actions
└── .github/workflows/   build-windows.yml: build .exe + kiểm tra khói trên Windows
```

## Chạy thử trên máy (lập trình viên)

```
cd apps/desktop
npm ci
npm start          # mở cửa sổ ứng dụng
npm run smoke      # kiểm tra khói: Agent SDK nạp được, không gọi API
npm run dist:win   # build file cài Windows (chạy trên Windows)
```

## Lấy file cài và cập nhật

- Lần đầu: GitHub → mục Releases → bản mới nhất → tải `TrungKienAIHub-Setup-<phiên bản>.exe`.
- Từ bản 0.1.0 trở đi app tự kiểm tra bản mới khi mở và mỗi 6 giờ, tự tải về, hiện nút "Khởi động lại để cập nhật". Lịch sử, cài đặt, API key nằm ở `%APPDATA%\trung-kien-ai-hub`, cập nhật không làm mất.
- Phát hành bản mới: tăng `version` trong `apps/desktop/package.json` rồi đẩy mã; CI kiểm thử xong tự đăng Release. Không tăng phiên bản thì CI chỉ build và kiểm tra, không đăng.
