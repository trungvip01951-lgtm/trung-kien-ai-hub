# Trung Kiên AI Hub

Ứng dụng AI Agent cho Windows của anh Trung: giao việc bằng tiếng Việt như Claude Cowork, chạy bằng tín dụng Claude API (qua Claude Agent SDK) thay cho hạn mức gói Max, có giới hạn chi phí. Yêu cầu đầy đủ: `docs/YEU-CAU-GOC.md`. Kế hoạch và các mốc: `docs/KE-HOACH.md`.

## Trạng thái — 22/10/2026

- Đang làm Mốc 0: khung ứng dụng Electron, đóng gói Agent SDK, build file cài Windows bằng GitHub Actions. Chưa có chức năng chat.
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

## Lấy file cài

GitHub → tab Actions → quy trình "Build Windows" → lần chạy mới nhất → mục Artifacts → `trung-kien-ai-hub-windows`.
