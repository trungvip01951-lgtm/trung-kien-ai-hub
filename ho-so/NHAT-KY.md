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

## 22/10/2026 21:21 — Claude-1
- Bản 0.3.0 (Mốc 3 + 3 việc anh nhắn giữa chừng), `apps/desktop`:
  - Mục **Skills**: tải Skill lên từ .zip (bộ đọc zip tự viết `src/main/zip.ts`, chặn `..`/ổ đĩa/symlink/tên Windows cấm/zip bomb, giới hạn 2.000 tệp, 50 MB bung, 200 MB tệp zip) hoặc thư mục; kiểm `SKILL.md` (name, description), báo trùng, bản cũ được giữ khi thay/xoá, bật/tắt, khôi phục (`src/main/skills.ts`, `SkillsPage.tsx`). Kho nằm ở `%APPDATA%\trung-kien-ai-hub\skills`, nạp cho agent bằng tuỳ chọn `plugins` (plugin cục bộ tên `tkhub`, Skill hiện là `tkhub:<tên>`). Agent đọc tài liệu trong kho không phải hỏi.
  - Mục **Dự án**: nút "Quét thư mục" lập bảng PROJECT_INVENTORY chỉ đọc (`src/main/inventory.ts`): CLAUDE.md/AGENTS.md, skills, agents, hooks, .mcp.json, sổ bàn giao/nhật ký/TODO, phụ thuộc, git, số phiên Claude Code cũ; "đang làm/bước tiếp" trích nguyên văn mục cuối sổ bàn giao; thư mục Thịnh Vượng chỉ ghi tên, không đọc, không cho thêm. Lưu bảng `inventory` trong hub.db. "Thêm vào app" một chạm.
  - **Phiên Claude Code cũ** của từng dự án (`listSessions` của SDK, bỏ worktree): "Tiếp tục trong Chat" mở lại đúng phiên (resume). Lần chạy đầu tính chi phí theo ước tính token ×1,2 vì tổng cũ không biết (`session_total_usd = -1`).
  - **Hướng dẫn dự án**: ô soạn cho từng dự án (cột `projects.instructions`, migration bước 2), gửi qua `systemPrompt` kiểu custom, `snapshot: false` (sửa là hội thoại đang dở theo ngay); xem kèm CLAUDE.md của dự án (chỉ đọc).
  - **Tự chia việc đúng sức** (`src/main/routing.ts`, Cài đặt bật/tắt, mặc định bật): 3 AI phụ `tro-ly-co-hoc` (Haiku 5.5), `tro-ly-thuc-thi` (Sonnet 5.5, vừa), `tro-ly-phan-tich` (Opus 5.5, cao) + lời dặn cách chia.
  - **Logo mới** (TK trắng nền xanh, sao vàng): `assets/icon.png` 512px cho file cài/exe, `src/renderer/logo.svg` ở thanh bên; CSP cho phép ảnh `data:`.
- Đo thật trên cloud (môi trường đã lọc, key giả, chi phí 0): SDK nạp `tkhub:bao-gia-mau` từ kho app; init liệt kê đủ 3 AI phụ. Máy chủ API giả cục bộ cho thấy: không đặt `systemPrompt` thì SDK chỉ gửi 1 câu "You are a Claude agent, built on Anthropic's Claude Agent SDK."; kiểu custom giữ câu đó và nối phần của app; kiểu preset claude_code dài ~6.560 ký tự.
- Kiểm: 44/44 test (thêm 12); giao diện Skills/Dự án/Hướng dẫn/Phiên cũ/Cài đặt kiểm bằng Chromium với lõi giả, 0 lỗi; kiểm tra khói 5/5 (Linux). Rà soát độc lập (AI phụ Opus) báo 9 điểm: sửa 8 (Skill đã xoá không hiện để khôi phục; đổi tên lỗi khi thay Skill làm mất Skill; tên Windows cấm trong zip; tệp zip quá lớn; Thịnh Vượng viết kiểu khác; worktree trong phiên cũ; chi phí phiên cũ; thiếu bắt lỗi giao diện); 1 điểm (custom thay mất prompt mặc định) đo lại thấy không đúng.

## 22/10/2026 21:42 — Claude-1
- Bản 0.4.0 (Mốc 2, điều khiển trình duyệt), `apps/desktop`:
  - Playwright MCP `@playwright/mcp` 0.0.83 (ghim, đăng 28/09/2026), chạy bằng chính tệp chạy của app (`ELECTRON_RUN_AS_NODE=1`), `asarUnpack` thêm `@playwright`, `playwright`, `playwright-core`. Hồ sơ trình duyệt riêng `%APPDATA%\trung-kien-ai-hub\chrome-profile`, ảnh/snapshot ở `chrome-output`; dùng Chrome hoặc Edge đã cài; `--no-webmcp`.
  - Quyền theo website (`src/main/chrome.ts`, mục **Chrome** trong app): Chỉ xem / Hỏi từng thao tác / Tự làm thao tác thường. Ngoài danh sách thì mở trang hay thao tác đều hỏi. Đăng/lưu/gửi/xoá/thanh toán/đăng nhập, Enter, tải tệp lên, bấm theo toạ độ luôn hỏi; xét theo chữ thật của phần tử trong snapshot gần nhất, không theo lời mô tả của model. Việc chạy "Chỉ đọc" chỉ được xem trang. Chặn cookie, bộ nhớ trang, header/nội dung request, chặn/sửa mạng, ghi vết, chạy mã Playwright tuỳ ý, đặt tên tệp tự do; chạy JavaScript trên trang phải hỏi. Hộp hỏi hiện lý do và chữ trên trang.
  - Trang đang mở chỉ tin dòng "- Page URL:" đầu tiên ngay sau "### Page" (trước nội dung do trang quyết định); kết quả không có địa chỉ (đổi tab, lỗi) thì coi là chưa rõ trang → hỏi.
  - Nút "Mở trình duyệt của app để đăng nhập" (Playwright đi kèm MCP); khi cửa sổ này mở thì không chạy việc.
  - Lời dặn agent: snapshot sau mỗi thao tác quan trọng, thử lại tối đa 1 lần, gặp CAPTCHA/đăng nhập thì dừng nhờ anh.
  - Kiểm tra khói thêm mục `playwright-mcp-runs`.
- Đo trên cloud: Playwright MCP với Chromium có sẵn mở trang thử, đọc "Khách Mẫu A", gõ, bấm "Gửi thử", trang đổi đúng, chụp ảnh; chạy được bằng Electron. Trọn đường đi AgentRunner + SDK thật + máy chủ Messages API giả: trong danh sách tự mở, ngoài danh sách hỏi, Chỉ xem chặn gõ/bấm, Tự làm: gõ tự làm, bấm "Gửi thử" hỏi dù model ghi "nút xanh", đặt tên tệp bị chặn; chi phí 0 (API giả).
- Kiểm: 50/50 test; kiểm tra khói 6/6 (Linux); CI Windows bản 0.4.0-dev.1 xanh. Rà soát độc lập (AI phụ Opus) báo 9 lỗi, đã sửa cả 9 (giả địa chỉ trang bằng tiêu đề; đổi tab giữ địa chỉ cũ; network_request lộ header/token; filename ghi đè tệp dự án; xét rủi ro theo mô tả của model; Ctrl+Enter; địa chỉ cũ sau lỗi; cờ cửa sổ đăng nhập đặt muộn; WebMCP). Còn lại có ghi chú: trang tự chuyển hướng chậm sau khi công cụ đã trả kết quả thì lần thao tác kế tiếp có thể xét theo trang cũ (đã giảm: snapshot mới cập nhật lại).

## 22/10/2026 22:50 — Claude-1
- Bản 0.5.0 (yêu cầu 22/10/2026 ~22:00–22:25 + Mốc 4 + Mốc 5), `apps/desktop`:
  - **Nhiều hội thoại cùng lúc** (tối đa 3 việc): mỗi việc giữ trước phần hạn mức chưa tiêu để tổng không vượt hạn mức ngày/kỳ; cùng hội thoại không chạy chồng; trình duyệt chỉ một việc dùng. Chat: gửi khi đang bận thì tự **xếp hàng**; **Enter gửi, Shift+Enter xuống dòng** (không gửi khi đang gõ dở dấu).
  - **Mức quyền "Đủ quyền"** (không hỏi; vẫn giữ hạn mức, chặn cookie/bộ nhớ trang trình duyệt, chạy mã trên trang vẫn hỏi). **"Đồng ý luôn"** trong hộp hỏi: hẹp theo đúng lệnh (lệnh đơn giản theo 2 từ đầu, lệnh có nối/chuyển hướng theo nguyên lệnh), thư mục, tên miền, cửa sổ, chương trình+tham số; không có nút này cho tệp cấu hình agent/git, gửi/ghi dữ liệu qua kết nối, chạy mã trên trang, bấm chuột/gửi phím, quy tắc bộ nhớ dùng chung.
  - **Kết nối Windsor.ai, Google Trang tính, Drive, Gmail** (mục MCP và công cụ, `src/main/connections.ts`): máy chủ MCP chính thức, đăng nhập OAuth trong app bằng thư viện `@modelcontextprotocol/sdk` 1.32.1 (ghim, trùng bản Agent SDK dùng): đăng ký client tự động (Windsor) hoặc OAuth client anh tạo (Google, loại Desktop app), PKCE, nhận mã ở 127.0.0.1:8765, kiểm state, mã lưu mã hoá DPAPI, tự làm mới trước mỗi việc (mỗi kết nối một lần một lúc). Công cụ đọc tự dùng, công cụ gửi/ghi phải hỏi. Thêm được máy chủ MCP khác.
  - **Chrome chính của anh** qua tiện ích Playwright Extension (`--extension`, mã ghép nối lưu mã hoá); tiện ích Claude không dùng được vì app chạy bằng API key (đã kiểm trong tệp chạy của SDK).
  - **Mốc 4**: điều khiển Windows bằng UI Automation qua PowerShell (`windows.ts`: liệt kê/đọc cửa sổ, đọc chữ, bấm, điền, phím, chuột, mở chương trình, chụp màn hình; tham số qua biến môi trường JSON; không chạm cửa sổ của chính app); Excel/Word/PDF trong app (`office.ts` do AI phụ Sonnet viết: exceljs 4.4.0, mammoth 1.13.0, docx 9.8.1 — chọn bản đăng trước 08/10/2026; sao lưu bản gốc trước khi sửa; Excel có biểu đồ/pivot/hình thì từ chối ghi; PDF bằng cửa sổ ẩn không chạy JavaScript, không mở mạng); **sao lưu/khôi phục** (`backup.ts`: tự sao lưu mỗi ngày, giữ 14 bản, khôi phục khi khởi động lại có cất bản hiện tại trước và tự trả lại nếu lỗi giữa chừng, xuất/nhập thư mục); **hàng đợi** và **lịch chạy** (`jobs.ts`, `schedule.ts`: hằng ngày/tuần/mỗi N giờ, chỉ khi app mở, lỡ giờ chạy bù 1 lần, lần trước chưa xong thì bỏ lần sau); chỉ cho một bản app chạy.
  - **Mốc 5**: 10 **AI chuyên môn** (mục Agents, `specialists.ts`): lập kế hoạch, nghiên cứu, lập trình, SEO, Google Ads, phân tích Excel, Word/PDF, tư vấn kỹ thuật máy bơm, quản lý tài liệu, kiểm thử nghiệm thu; sửa/tắt/thêm được. **Bộ nhớ dài hạn** (`memory-tools.ts`, bảng memory + FTS5): agent tìm theo từ khoá trong ghi chú và lịch sử chat của đúng dự án, tự ghi quy tắc/lỗi/tiến độ (không đè ghi chú anh viết, chặn lưu mã/mật khẩu/số điện thoại); trang Bộ nhớ có kiểm tra toàn vẹn. Nghiệp vụ SEO/Google Ads chạy qua Windsor.ai + Skills, không viết module riêng.
- Đo trên cloud (SDK thật, máy chủ Messages API giả, không gọi Claude thật): bộ nhớ ghi/tìm, Excel ghi/đọc, Word tạo, ghi tệp ngoài dự án bị hỏi; 10 AI chuyên môn có trong yêu cầu gửi API; OAuth đầy đủ với máy chủ cấp quyền giả; xuất PDF thật trong kiểm tra khói. CI Windows: PowerShell UI Automation mở Notepad, tìm cửa sổ, đọc cây phần tử.
- Kiểm: 71 test (Linux) + 1 test Windows thật trên CI; kiểm tra khói 7/7 (thêm pdf-export). Rà soát độc lập 2 lượt (AI phụ Opus): bản 0.5.0-dev.1 12 lỗi, Mốc 4+5 15 lỗi; đã sửa 26, chấp nhận có ghi chú 1: mã truy cập OAuth/mã ghép nối nằm trong tham số dòng lệnh của tiến trình agent — chỉ đọc được bởi chương trình chạy dưới tài khoản Windows của anh, tức là khi agent đã được chạy lệnh (lúc đó agent đã có quyền như tài khoản anh, kể cả giải mã DPAPI).

## 22/10/2026 23:07 — Claude-1
- CI Windows bản 0.5.0-dev.4 xanh (https://github.com/trungvip01951-lgtm/trung-kien-ai-hub/actions/runs/39810102949): 72 test gồm điều khiển Notepad thật (mở, tìm cửa sổ, đọc cây phần tử, điền chữ bằng WM_SETTEXT, đọc lại, chụp màn hình), kiểm tra khói bản chưa cài và đã cài. Lần trước lỗi vì ô soạn thảo Notepad cổ điển báo kiểu "Pane" và không có ValuePattern; lỗi PowerShell giờ trả bằng chữ thay CLIXML. Đặt bản 0.5.0 để phát hành.

## 23/10/2026 10:09 — Claude-1
- Bản 0.5.1 theo phản hồi anh Trung:
  - Nút "Mở trình duyệt của app để đăng nhập" giờ mở Chrome/Edge đã cài như bình thường (`--user-data-dir` hồ sơ riêng của app, mở sẵn accounts.google.com), không qua Playwright: Google chặn đăng nhập ("trình duyệt không an toàn") trên trình duyệt có cờ tự động hoá. Đóng cửa sổ thì app mới cho giao việc. (`src/main/index.ts`)
  - Chat nhận ảnh: dán Ctrl+V, kéo thả, nút "Ảnh" (tối đa 5 ảnh, mỗi ảnh ≤ 5 MB, PNG/JPG/GIF/WEBP); gửi cho agent dạng khối ảnh + chữ (chế độ nhập dạng luồng của Agent SDK); ảnh lưu ở `%APPDATA%\trung-kien-ai-hub\attachments`, lịch sử ghi tên tệp. (`agent.ts`, `ChatPage.tsx`)
- Kiểm: 72 test (thêm 1); SDK thật + máy chủ API giả: yêu cầu gửi API có khối ảnh image/png; giao diện: giả lập dán ảnh vào ô chat hiện ảnh thu nhỏ, 0 lỗi. Mở Chrome thật để đăng nhập CHƯA THỂ XÁC MINH trên cloud (cần máy anh).

## 23/10/2026 12:12 — Claude-1
- Bản 0.6.0 theo yêu cầu anh Trung 23/10 (giao diện như app Claude, mở tệp, lỗi lúc trả lời, kiểm lại app, dự án báo cáo cty), `apps/desktop`:
  - **Khung chat như app Claude** (`src/renderer/Messages.tsx`, react-markdown 10.1.0 + remark-gfm 4.0.1): câu trả lời có định dạng (đậm, bảng, danh sách, khối mã); các bước công cụ gộp thành một dòng "N bước · việc cuối", bấm mở từng bước; bước lỗi hiện nhỏ "lỗi (mã 2)" vì AI tự xử lý tiếp. Kết quả ghép đúng bước gọi theo mã bước (cột mới `items.tool_use_id`) kể cả khi nhiều công cụ chạy cùng lúc.
  - **Mở tệp**: tệp agent tạo/sửa hiện thành thẻ có nút Mở / Thư mục; liên kết và đường dẫn trong câu trả lời (kể cả có dấu cách, `file:///`, `%`) bấm là mở bằng chương trình mặc định. Chỉ mở thẳng loại tài liệu, bảng, ảnh, chữ (danh sách cho phép); tệp chương trình (.exe, .py, .ps1…) chỉ mở thư mục.
  - **Lỗi lúc trả lời**: trước đây AI chính chỉ nhận một câu lời dặn hệ thống nên không biết mình đang chạy trên Windows, thư mục nào, công cụ nào → hay chạy sai lệnh (ảnh anh gửi: "Exit code 2"). Nay dùng bộ lời dặn đầy đủ của Agent SDK (`preset claude_code`) + phần riêng của app (tiếng Việt, không tự xưng Claude Code). Ngoài ra: câu hỏi không còn biến mất sau khi trả lời, dòng "Xong. Chi phí" không lặp đôi, lỗi API không báo đôi, chuyển qua lại hội thoại đang chạy không mất chữ đang gõ dở, việc xếp hàng chạy ngay khi việc trước xong.
  - **Dự án báo cáo cty**: tên kết nối trùng app Claude (`Google_Sheets`, `Google_Drive`, `Gmail`, `Windsor_ai`) để AGENTS.md/skill gọi đúng công cụ `mcp__Google_Sheets__get_values`…; kết nối cũ tự đổi tên, giữ đăng nhập. Dự án có AGENTS.md thì AI được nhắc đọc trước. "Đồng ý luôn" cho lệnh python theo đúng tệp chương trình (`python -B -X utf8 kho/bin/bc.py …`), ghi Trang tính theo đúng bảng tính.
  - **Ảnh**: nhận loại ảnh theo nội dung (ảnh Zalo đuôi .jpg thật ra là webp không còn bị API từ chối), giới hạn 3,7 MB mỗi ảnh theo giới hạn API.
- Rà soát độc lập (AI phụ Opus) 14 mục: sửa 13; mục 13 (lời dặn preset tự giới thiệu "Claude Code") xử lý bằng câu dặn không tự xưng. Đáng chú ý nhất đã sửa: "Đồng ý luôn" cho `cmd /c …`, `powershell -Command …`, `bash -c …`, `python -m …` từng mở rộng sang lệnh khác (ví dụ xoá thư mục) — nay chỉ đúng nguyên lệnh.
- Kiểm: 77 test (thêm 5), kiểm tra khói 8/8, giao diện chạy bằng Chromium với dữ liệu giả: 3 bước chạy cùng lúc ghép đúng kết quả, tệp ghi dài có thẻ Mở, liên kết `D:/Bao%20cao/x.xlsx` và đường dẫn có dấu cách mở được, `0.3.308` không thành chỗ bấm, 0 lỗi trang. Chạy với API thật và mở tệp trên Windows thật CHƯA THỂ XÁC MINH trên cloud.

## 23/10/2026 13:20 — Claude-1
- Anh Trung nối lại GitHub; đẩy bản 0.6.0 lên. CI "Build Windows" xanh (https://github.com/trungvip01951-lgtm/trung-kien-ai-hub/actions/runs/39910053924), đăng Release v0.6.0 lúc 13:16.

## 23/10/2026 13:24 — Claude-1
- Bản 0.6.1 theo 2 yêu cầu anh Trung 23/10:
  - **Đăng nhập Google như app Claude**: bấm Đăng nhập mở thẳng Chrome anh đang dùng (đã đăng nhập Google sẵn, chỉ chọn tài khoản → Cho phép), không có Chrome thì Edge, rồi trình duyệt mặc định (`src/main/index.ts` openLoginPage). Đã đo: máy chủ Google (accounts.google.com) không có đăng ký client tự động (không có registration_endpoint), nên vẫn cần OAuth client của anh 1 lần — app Claude dùng client của hãng Anthropic, app này không được dùng. Làm cho dễ: nhập bằng tệp JSON Google cho tải về (nút "Chọn tệp JSON"), hướng dẫn có liên kết thẳng từng trang Google Cloud; kết nối Google thêm sau tự dùng chung client.
  - **Khung chat hiện việc đang chạy**: dòng trạng thái có vòng quay dưới cùng: "Đang làm: Chạy lệnh …/Đọc …/Tạo tệp …", "Đang viết câu trả lời…", "Đang chờ anh cho phép: …" (viền vàng), số bước và thời gian đã chạy.
- Kiểm: 78 test (thêm 1: tệp JSON, dùng chung client), kiểm tra khói 8/8, giao diện Chromium với dữ liệu giả hiện dòng trạng thái, 0 lỗi trang. Đăng nhập Google thật CHƯA THỂ XÁC MINH trên cloud.

## 23/10/2026 13:40 — Claude-1
- Bản 0.6.2 theo 4 tin anh Trung 23/10 (`apps/desktop`):
  - **Tiền mỗi hội thoại**: số dưới tên hội thoại cập nhật trong lúc chạy (trước chỉ cập nhật khi xong nên hiện 0.0000); dòng token gồm cả phần đọc lại từ bộ nhớ đệm (trước chỉ hiện token vào chưa đệm, ví dụ "32"). Giá model khớp bảng giá Anthropic 06/10/2026; cách cộng tiền khi tiếp tục hội thoại khớp tài liệu SDK (total_cost_usd cộng dồn theo query, phiên resume tiếp từ tổng đã lưu).
  - **Gửi thêm khi AI đang làm**: mọi việc dùng luồng tin vào (InputChannel); tin gửi thêm đi vào lượt đang chạy với priority "next", AI trả lời ngay. AI phụ được chạy nền (bỏ ép chạy chờ); app giữ việc mở tới khi AI phụ (local_agent) xong, tối đa 30 phút sau lượt cuối; lệnh chạy nền (máy chủ thử…) không giữ việc mở. Đã gửi thêm hoặc đã có lượt xong thì lỗi key không tự chạy lại bằng key khác (tránh mất tin, lặp trả lời). Tối đa 5 hội thoại song song (trước 3).
  - **Quyền**: đổi ô Quyền khi việc đang chạy thì áp ngay; lên Đủ quyền thì các câu đang hỏi tự được đồng ý. Đủ quyền không còn hỏi chạy mã trên trang.
  - **Trình duyệt của app**: một máy chủ Playwright MCP dùng chung qua HTTP (localhost) thay vì mỗi việc một máy chủ — trước đây việc xong là trình duyệt đóng. Trình duyệt tự đóng sau 5 phút không thao tác (`--idle-timeout`), thao tác sau tự mở lại, giữ đăng nhập. Mở cửa sổ đăng nhập thì tắt máy chủ trước (cùng hồ sơ).
- Rà soát độc lập (AI phụ Opus) phần gửi thêm/AI nền: 8 mục; sửa 1 (việc treo mãi khi có lệnh chạy nền), 2–3 (mất tin gửi thêm khi đổi key), 4 (đổi quyền khi gửi thêm), 5 (mốc 60 giây hủy cả khi đang phát chữ); 6, 8 thấp, chấp nhận; 7 không lỗi.
- Kiểm: 80 test (thêm 3), kiểm tra khói 8/8, máy chủ trình duyệt dùng chung chạy thật với Chromium: việc thứ hai thấy trang việc thứ nhất mở. Chạy với Claude thật, Chrome trên Windows CHƯA THỂ XÁC MINH trên cloud.
