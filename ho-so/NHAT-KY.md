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

## 22/10/2026 17:36 — Claude-1
- Mốc 1, bản 0.1.0 (`apps/desktop`): lõi agent (`src/main/agent.ts`), hạn mức việc/ngày/kỳ (`budget.ts`, mặc định 5/10/150 USD, kỳ bắt đầu ngày 1, cảnh báo 70/90/100%), giá dự phòng (`pricing.ts`), lịch sử SQLite + FTS5 có nâng cấp cấu trúc (`db.ts`), API key mã hoá DPAPI (`keystore.ts`), phân quyền 2 mức + hỏi xác nhận (`policy.ts`), chặn cài đặt đổi máy chủ API/nguồn khoá (`settings-guard.ts`), tự cập nhật GitHub Releases (`updater.ts`), giao diện React 13 mục (`src/renderer`, AI phụ Sonnet viết), preload chỉ lộ kênh khai báo.
- Thư viện thêm (ghim): electron-updater 6.8.10, react/react-dom 19.3.0, vite 8.1.6; dùng `node:sqlite` có sẵn trong Electron 44 (Node 24.22, đo FTS5 chạy được) thay thư viện native.
- Rà soát độc lập (AI phụ Opus) tìm 9 lỗi; đã sửa: đọc ngoài dự án và WebFetch/WebSearch phải hỏi; sửa `.claude/`, `.mcp.json`, `.git/`, `CLAUDE.md`, `.env` phải hỏi; giải symlink; AI phụ không chạy nền, môi trường tách riêng phải hỏi/chặn; hỏi quyền quá 30 phút coi là từ chối; chi phí khi tiếp tục hội thoại sau việc dở dang tính dư (x1,2); token cuối lấy từ message_delta; kiểm key tính là việc đang chạy. Còn lại có ghi chú: việc kéo qua 0h tính vào ngày bắt đầu.
- Kiểm: 24/24 test; SDK thật với key giả trên cloud (môi trường đã lọc) báo "Invalid API key", chi phí 0; bản đóng gói Linux 6/6 kiểm tra khói; giao diện mở được, 0 lỗi console. Sổ lỗi mục 1–3.
- CI: thêm `npm test`, đăng GitHub Release khi phiên bản không có hậu tố `-` và chưa có tag.

## 22/10/2026 17:48 — Claude-1
- Bản 0.1.1 theo yêu cầu anh Trung (nút cập nhật): ô cập nhật luôn hiện cuối thanh bên (phiên bản đang dùng, nút "Kiểm tra cập nhật", tiến độ tải, nút "Cập nhật ngay" cài im lặng rồi tự mở lại). Không cho cập nhật khi đang chạy việc. Tệp: `src/shared/contract.ts` (checkUpdate), `src/preload.ts`, `src/main/updater.ts`, `src/main/index.ts`, `src/renderer/App.tsx`, `styles.css`.
- Kiểm: 24/24 test; giao diện bấm "Kiểm tra cập nhật" ở bản chạy thử hiện đúng thông báo, 0 lỗi.

## 22/10/2026 19:46 — Claude-1
- Bản 0.2.0 theo quyết định cùng giờ: nhiều API key theo thứ tự ưu tiên (`src/main/keyring.ts` mã hoá cả danh sách bằng DPAPI, `keys.ts` logic thuần). Bản 0.1.x lưu 1 key ở `api-key.bin` được tự chuyển thành Key 1.
- Chuyển key: lỗi `billing_error`, `authentication_failed`, `account_on_hold`, `verification_required`, `rate_limit` hoặc kết quả báo hết tín dụng/sai key. Chưa gọi công cụ nào thì tự chạy lại việc bằng key kế tiếp; đã gọi công cụ thì dừng, báo gõ "tiếp tục". Key vừa lỗi xếp cuối 30 phút. Hạn mức tính chung, phần đã tiêu của lần thử trước trừ vào hạn mức lần sau.
- Giao diện Cài đặt: bảng key (tên, 4 ký tự cuối, dùng/lỗi gần nhất), nút ↑↓, Kiểm tra từng key, Xoá; dòng phiên trong Chat ghi key đang dùng. Bỏ `keystore.ts`, đổi hợp đồng IPC (listApiKeys/addApiKey/removeApiKey/moveApiKey/testApiKey(id)).
- Kiểm: 31/31 test (thêm 7); SDK thật với 2 key giả: thử lần lượt cả 2, báo "Đã thử hết 2 key", chi phí 0; giao diện kiểm bằng Chromium với lõi giả (thêm 2 key, đổi thứ tự, 0 lỗi). Chưa kiểm lưu key thật trên cloud (Linux không có kho khoá; Windows dùng DPAPI).

## 22/10/2026 20:11 — Claude-1
- Ghi chú bản phát hành (CI) thêm dòng hướng dẫn tải ở đầu, vì anh Trung không biết bấm tệp nào trên trang Releases.

## 22/10/2026 20:48 — Claude-1
- Bản 0.2.1: anh Trung thêm key cấp tổ chức, nhận lỗi "API Error: 400 This API key is not scoped to a workspace…anthropic-workspace-id". Nguyên nhân: key không gắn workspace. App giờ nhận lỗi này (kể cả khi SDK ném lỗi thay vì trả result), báo tiếng Việt cách tạo key trong workspace, và tự chuyển key kế tiếp. Tệp: `src/main/keys.ts`, `agent.ts`, test. Kiểm: 32/32 test.
- Hướng dẫn anh: tạo key trong một workspace (Console → Workspaces → API Keys), đặt giới hạn chi tiêu cho workspace đó.
