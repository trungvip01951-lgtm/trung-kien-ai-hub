# NHIỆM VỤ: XÂY DỰNG TRUNG KIÊN AI HUB – WINDOWS AI AGENT

Bạn là kỹ sư trưởng kiến trúc AI, lập trình Windows, tự động hóa trình duyệt, quản lý dữ liệu và tích hợp Claude Agent SDK.

**YÊU CẦU: TRIỂN KHAI PHẦN MỀM THẬT, KHÔNG CHỈ VIẾT KẾ HOẠCH, BẢN DEMO HAY GIAO DIỆN GIẢ.**

## I. MỤC TIÊU

Xây dựng ứng dụng Windows tên:

**TRUNG KIÊN AI HUB**

Ứng dụng sử dụng Claude API qua Claude Agent SDK, có giao diện tương tự trải nghiệm làm việc của Claude Cowork, nhưng hoạt động độc lập với hạn mức hội thoại Claude Max.

Mục tiêu chính:

1. Sử dụng tín dụng Claude API khoảng 185 USD đang có.
2. Có toàn bộ năng lực AI Agent có thể tích hợp hợp pháp từ Claude Agent SDK.
3. Đọc, sửa file, viết code, chạy lệnh, điều khiển trình duyệt và tương tác với phần mềm Windows.
4. Nhập và tái sử dụng Skills, hướng dẫn hệ thống, MCP, quy tắc và các dự án Claude đang thực hiện.
5. Bảo toàn dữ liệu, lịch sử, tiến độ công việc và trạng thái dự án.
6. Không cần thiết lập lại toàn bộ khi chuyển từ Claude Code/Cowork sang ứng dụng riêng.
7. Tối ưu token và chi phí API.
8. Có bộ nhớ lâu dài để tiếp tục công việc sau khi đóng và mở lại phần mềm.
9. Có khả năng mở rộng cho các AI khác và các tài khoản API được chủ sở hữu cho phép.
10. Phải có phần mềm thực tế cài được trên Windows.

## II. KIỂM KÊ VÀ BẢO TOÀN DỰ ÁN CŨ

ĐÂY LÀ NHIỆM VỤ ƯU TIÊN SỐ 1.

Trước khi lập trình:

- Xác định thư mục làm việc và các dự án Claude đang truy cập hợp lệ.
- Kiểm tra các thư mục dự án được người dùng cấp quyền.
- Tìm các file CLAUDE.md, SKILL.md, .claude, MCP config, project instructions, agent definitions, hooks và settings.
- Kiểm kê Git repository, cấu trúc nguồn, tiến độ, task, TODO, tài liệu bàn giao, dữ liệu quan trọng.
- Xác định công việc đã hoàn thành, đang thực hiện, chưa hoàn thành và đang chờ xử lý.
- Đối chiếu tài liệu, lịch sử phiên và dữ liệu đã xuất nếu thực sự có quyền truy cập.
- Nếu lịch sử Cowork/Claude Desktop không thể truy xuất bằng phương thức chính thức thì ghi rõ hạn chế, cung cấp chức năng nhập thủ công hoặc nhập file xuất dữ liệu. Không tuyên bố đã đồng bộ những dữ liệu chưa đọc được.

Tạo bảng quản lý:

PROJECT_INVENTORY
- Project ID
- Tên dự án
- Thư mục nguồn
- Trạng thái
- Công việc hiện tại
- Skills đang sử dụng
- Hướng dẫn hệ thống
- MCP
- Tài liệu liên quan
- Phụ thuộc
- Bước tiếp theo
- Thời điểm cập nhật
- Tình trạng chuyển giao

YÊU CẦU BẮT BUỘC:

- Không xóa hoặc ghi đè dữ liệu dự án cũ.
- Sao lưu trước khi di chuyển hoặc chuyển đổi.
- Ưu tiên tham chiếu thư mục dự án gốc thay vì nhân bản hàng loạt.
- Không tự ý truy cập thư mục, tài khoản hoặc dịch vụ ngoài phạm vi được cấp quyền.
- Không chuyển dữ liệu thuộc dự án Thịnh Vượng vào hệ thống Trung Kiên.
- Mỗi dự án được kiểm kê phải có phương án mở và tiếp tục công việc trong ứng dụng mới.

## III. KIẾN TRÚC CÔNG NGHỆ

Ưu tiên sử dụng:

- Electron + React + TypeScript cho ứng dụng Windows.
- Node.js cho backend cục bộ.
- @anthropic-ai/claude-agent-sdk cho AI Agent.
- Anthropic Messages API khi cần các tính năng riêng.
- SQLite với FTS5 để lưu lịch sử và tìm kiếm.
- Playwright/CDP cho điều khiển Chrome và trình duyệt.
- Windows UI Automation hoặc công cụ Windows tương thích cho điều khiển desktop.
- MCP cho kết nối ứng dụng và dịch vụ ngoài.
- Git cho quản lý phiên bản.
- Electron Builder cho đóng gói ứng dụng.

Có thể lựa chọn công nghệ tốt hơn khi đã kiểm chứng, nhưng phải giải thích lý do trong tài liệu kỹ thuật.

Tham khảo tài liệu chính thức mới nhất trước khi triển khai:

https://code.claude.com/docs/en/agent-sdk/overview

https://code.claude.com/docs/en/agent-sdk/quickstart

https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool

https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool

https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-and-team-plans

Không dùng API, model ID hoặc tính năng đã lỗi thời. Không tự giả định phiên bản SDK.

## IV. GIAO DIỆN PHẦN MỀM

Thiết kế giao diện hiện đại, tiếng Việt, tương tự phong cách Claude Cowork nhưng sử dụng thương hiệu riêng, không sao chép trái phép giao diện hoặc nhận diện của Anthropic.

Thanh bên trái:

1. Chat AI
2. Dự án
3. Công việc đang chạy
4. Skills
5. Agents
6. MCP và công cụ
7. Chrome
8. Máy tính Windows
9. Tài liệu
10. Bộ nhớ
11. Lịch sử
12. Chi phí API
13. Cài đặt

Phần làm việc chính:

- Nhập yêu cầu bằng tiếng Việt.
- Đính kèm nhiều file và thư mục.
- Kéo thả tài liệu.
- Chọn dự án.
- Chọn model.
- Chọn Skills/Agents.
- Hiển thị các bước thực thi.
- Hiển thị cửa sổ hoặc ảnh chụp Chrome khi đang thao tác.
- Hiển thị log công cụ, file được chỉnh sửa và kết quả.
- Nút tạm dừng, tiếp tục, hủy công việc.
- Hiển thị token và chi phí ước tính.
- Tìm kiếm lịch sử.
- Mở đồng thời nhiều dự án.
- Hỗ trợ giao diện sáng và tối.

Phải có khả năng đóng và mở lại ứng dụng mà không mất lịch sử.

## V. HỆ THỐNG AI AGENT

Sử dụng Claude Agent SDK làm hệ thống điều phối chính.

Triển khai:

- Agent lập kế hoạch.
- Agent nghiên cứu.
- Agent lập trình.
- Agent SEO.
- Agent Google Ads.
- Agent phân tích Excel.
- Agent xử lý Word/PDF.
- Agent tư vấn kỹ thuật máy bơm.
- Agent quản lý tài liệu.
- Agent kiểm thử và nghiệm thu.

Hỗ trợ:

- Subagents.
- Skills.
- Hooks.
- MCP.
- Tool permissions.
- Session resume/fork.
- Checkpoints.
- Structured outputs.
- Quản lý ngữ cảnh.
- Dừng và khôi phục công việc.
- Nhật ký công cụ.
- Bàn giao giữa các Agent.

Mọi công việc dài phải được chia thành các bước có trạng thái và checkpoint.

Không tuyên bố tính năng nào đã hoạt động nếu chưa được kiểm thử.

## VI. CHUYỂN SKILLS VÀ HƯỚNG DẪN HỆ THỐNG

Xây chức năng:

IMPORT FROM CLAUDE

Ứng dụng phải có khả năng:

- Nhập Skills từ thư mục được chọn.
- Nhận diện SKILL.md.
- Đọc các tệp tham chiếu và script liên quan.
- Nhập CLAUDE.md và các project rules.
- Nhập cấu hình Agents, Hooks, MCP tương thích.
- Phát hiện trùng lặp.
- Phân biệt Skills toàn hệ thống và Skills theo dự án.
- Kiểm tra khả năng tương thích và phụ thuộc.
- Hiển thị Skills đang hoạt động.
- Cho phép bật/tắt và cập nhật Skills.
- Quản lý phiên bản và khôi phục bản trước.

Hướng dẫn hệ thống phải có phân cấp:

GLOBAL RULES
→ COMPANY RULES
→ PROJECT RULES
→ AGENT RULES
→ TASK INSTRUCTIONS

Không để hướng dẫn của dự án này tự động ghi đè hoặc làm sai dự án khác.

Chỉ tải Skills cần thiết vào ngữ cảnh để tiết kiệm token.

## VII. ĐIỀU KHIỂN CHROME

Đây là chức năng quan trọng.

Xây bộ điều khiển trình duyệt có khả năng:

- Mở website.
- Đọc nội dung trang.
- Tìm kiếm.
- Nhấn nút.
- Nhập biểu mẫu.
- Chuyển tab.
- Cuộn trang.
- Chụp màn hình.
- Tải và đọc tài liệu.
- Đăng nhập bằng phiên người dùng đã được cho phép.
- Làm việc với WordPress/WooCommerce.
- Kiểm tra Google Search Console.
- Làm việc với Google Ads.
- Đọc báo cáo và xuất dữ liệu.
- Theo dõi kết quả thao tác.

Ưu tiên browser automation bằng Playwright và công cụ Browser Use chính thức khi phù hợp.

Không dựa duy nhất vào tọa độ chuột.

Phải có cơ chế:

- Nhận diện trang đã thay đổi.
- Thử lại an toàn khi lỗi.
- Xác minh sau từng thao tác quan trọng.
- Ghi log và bằng chứng.
- Giới hạn quyền theo website.
- Trình duyệt/hồ sơ riêng, hạn chế rủi ro với Chrome chính.
- Không vượt CAPTCHA, không lấy cắp cookie/token, không né cơ chế bảo mật dịch vụ.

Các hành động đăng sản phẩm, sửa chiến dịch, gửi dữ liệu hoặc thay đổi tài khoản thực phải tuân thủ quyền và cơ chế xác nhận đã thiết lập.

## VIII. ĐIỀU KHIỂN WINDOWS

Xây Windows Automation Bridge:

- Điều khiển chuột.
- Điều khiển bàn phím.
- Chụp ảnh màn hình.
- Đọc cửa sổ ứng dụng.
- Mở chương trình.
- Tương tác với hộp thoại Windows.
- Quản lý file và thư mục trong phạm vi cho phép.
- Mở Excel, Word, PDF.
- Thực hiện các thao tác lặp lại.
- Đọc kết quả, phát hiện lỗi.
- Tự phục hồi sau lỗi có thể khắc phục.

Ưu tiên API điều khiển ứng dụng hoặc UI Automation thay vì thao tác tọa độ.

Không cấp toàn quyền hệ thống theo mặc định.

Chỉ tự động thực hiện thao tác nguy cơ thấp trong phạm vi được cấp quyền. Các thao tác nguy hiểm, thay đổi tài khoản, xóa dữ liệu, gửi nội dung ra ngoài phải có xác nhận.

## IX. TÍCH HỢP CÁC DỰ ÁN TRUNG KIÊN

Các nhóm công việc cần hỗ trợ gồm:

### A. WEBSITE VÀ SEO

Kiểm tra danh sách website thực tế từ dự án đang có.

Đặc biệt xem xét các website:

- bomchinhhang.online
- bomnuocthai.com
- maybomtk.net

Và các website còn lại của hệ thống.

Chức năng:

- Quét sitemap.
- Kiểm tra index.
- Phân tích SEO.
- Phân tích Search Console.
- Quản lý bài viết.
- Kiểm tra sản phẩm WooCommerce.
- Tối ưu nội dung.
- Phân tích internal link.
- Quản lý backlink.
- Theo dõi lỗi.
- Báo cáo clicks và impressions theo 7, 14, 28 ngày.
- Lưu lịch sử thay đổi.
- Tránh tạo nội dung trùng lặp không cần thiết.
- Có cơ chế phê duyệt trước khi sửa dữ liệu website đang hoạt động.

Giữ nguyên quy tắc SEO riêng của từng website sau khi nhập thành công.

### B. GOOGLE ADS

Xây module quản lý nhiều tài khoản Google Ads được cấp quyền.

- Danh sách tài khoản.
- Chiến dịch.
- Nhóm quảng cáo.
- Từ khóa.
- Giá thầu.
- Ngân sách.
- Chuyển đổi.
- Chi phí.
- Báo cáo.
- So sánh hiệu quả.
- Theo dõi lượt gọi/tin nhắn nếu có dữ liệu đo lường.
- Phát hiện bất thường.
- Phân tích chồng chéo từ khóa.
- Gợi ý tối ưu.
- Lưu lịch sử thay đổi.

Ưu tiên Google Ads API và kết nối chính thức. Không tự ý thay đổi tài khoản hoặc thực hiện các thao tác quảng cáo bị cấm.

### C. CATALOGUE, SẢN PHẨM VÀ BÁO GIÁ

- Đọc PDF, Word, Excel.
- Trích xuất model.
- Quản lý thông số Q-H.
- Đọc đường đặc tính bơm.
- So sánh sản phẩm.
- Quản lý thương hiệu PEROTAC và các thương hiệu khác.
- Thay logo trong tài liệu được cấp quyền.
- Xuất PDF chất lượng cao.
- Lập báo giá.
- Lập hợp đồng.
- Kiểm tra giá, VAT, số lượng.
- Đối chiếu catalogue.
- Kiểm lỗi kỹ thuật, chính tả và định dạng.
- Lưu file nguồn và kết quả.

Thông số kỹ thuật không được tự suy đoán khi thiếu catalogue hoặc dữ liệu đã kiểm chứng.

### D. TRUNG KIÊN AI DESK VÀ ZALO

Kiểm tra dự án Trung Kiên AI Desk đang có trước khi xây module mới.

Mục tiêu tích hợp:

- Quản lý khách hàng.
- Lưu hội thoại được truy cập hợp lệ.
- Phân loại nhu cầu.
- Trích model máy bơm.
- Theo dõi báo giá.
- Quản lý nhân viên.
- Quản lý công việc.
- Tạo báo giá và đơn hàng.
- Tìm catalogue.
- Gợi ý câu trả lời.
- Báo cáo kinh doanh.

Với Zalo, ưu tiên giao diện lập trình/kết nối chính thức được hỗ trợ. Không giả định được phép đồng bộ lịch sử hoặc điều khiển tài khoản cá nhân bằng API nếu nền tảng không hỗ trợ. Phần chưa kết nối được phải ghi rõ.

### E. DỰ ÁN KHÁC

Không giới hạn ở các nhóm nêu trên.

Mọi dự án đang được Claude xử lý trong phạm vi người dùng cấp quyền phải được đưa vào danh mục quản lý, kể cả dự án không được liệt kê trong yêu cầu này.

Ưu tiên kế thừa kiến trúc, mã nguồn, quy tắc và dữ liệu đã có, không lập trình lại chức năng đang hoạt động tốt nếu không cần thiết.

## X. BỘ NHỚ DÀI HẠN

Xây hệ thống lưu trữ:

- Lịch sử chat.
- Công việc.
- Kết quả.
- Quy tắc.
- Skills.
- Tài liệu.
- Lỗi và cách sửa.
- Thông tin dự án.
- Checkpoints.
- Tiến độ.
- Quan hệ giữa các tài liệu.

Sử dụng SQLite/FTS và chỉ bổ sung vector search khi thực sự cần.

Có cơ chế nạp ngữ cảnh theo nhu cầu, tóm tắt lịch sử dài và quản lý phiên bản bộ nhớ.

Mục tiêu: sử dụng lâu dài mà không cần đọc lại toàn bộ hàng GB dữ liệu mỗi lần làm việc.

Cung cấp:

- Sao lưu.
- Khôi phục.
- Xuất/nhập dữ liệu.
- Kiểm tra toàn vẹn.
- Phát hiện dữ liệu trùng.
- Chống phình cơ sở dữ liệu.
- Giới hạn dữ liệu nhạy cảm đưa lên API.

## XI. QUẢN LÝ API VÀ CHI PHÍ

Cho phép nhập ANTHROPIC_API_KEY an toàn.

Yêu cầu:

- API key phải thuộc đúng tổ chức Claude Console nhận tín dụng.
- Không ghi API key vào source code, log, Git hoặc cơ sở dữ liệu dạng rõ.
- Sử dụng Windows Credential Manager/DPAPI hoặc giải pháp bảo vệ khóa tương đương.
- Bảo đảm Claude Agent SDK chạy bằng API key thay vì âm thầm dùng phiên đăng nhập gói Max.
- Kiểm thử xác thực và phương thức thanh toán với lượt gọi nhỏ trước.
- Hiển thị model đang sử dụng.
- Thống kê token đầu vào, đầu ra, cache và chi phí theo thông tin SDK/API.
- Phân biệt số dư thực từ Console với số dư ước tính.
- Có giới hạn theo ngày, dự án và công việc.
- Có cảnh báo khi gần hết ngân sách.
- Dừng yêu cầu mới khi chạm giới hạn cứng.
- Không tự động nạp tiền hoặc bật auto-reload.

Hỗ trợ lựa chọn Sonnet/Opus và các model thực sự có trên API.

Ưu tiên model tiết kiệm cho tác vụ đơn giản, model mạnh khi cần suy luận phức tạp.

Chỉ dùng các cơ chế prompt caching, batch và tối ưu ngữ cảnh khi phù hợp.

Hỗ trợ thêm nhà cung cấp AI khác ở kiến trúc mở rộng, nhưng không nhầm lẫn tín dụng Anthropic với tín dụng của nhà cung cấp khác.

## XII. VẬN HÀNH ỔN ĐỊNH

Phải có:

- Hàng đợi công việc.
- Công việc theo lịch.
- Checkpoint tự động.
- Khôi phục sau khi ứng dụng bị đóng.
- Retry có giới hạn.
- Phát hiện treo.
- Nhật ký lỗi.
- Ghi lại từng thay đổi.
- Tự động sao lưu.
- Khả năng rollback.
- Cập nhật ứng dụng giữ nguyên dữ liệu.
- Quản lý phiên bản.
- Giới hạn công việc chạy song song.
- Không chạy lặp gây sửa dữ liệu nhiều lần.

Các công việc chạy nền chỉ được thực thi khi ứng dụng hoặc dịch vụ đã cấu hình thực sự đang hoạt động.

Không được báo hoàn thành khi công việc chưa có bằng chứng hoàn tất.

## XIII. BẢO MẬT VÀ PHÂN QUYỀN

Thiết kế ba mức:

1. Read Only – chỉ đọc và phân tích.
2. Workspace Write – được sửa file trong phạm vi dự án đã cấp quyền.
3. Approved External Actions – hành động ngoài hệ thống cần phê duyệt.

Bắt buộc xác nhận đối với các thao tác rủi ro cao như xóa dữ liệu, gửi email/tin nhắn, sửa tài khoản, xuất bản lên website hoặc thay đổi ngân sách quảng cáo.

Chặn prompt injection từ nội dung website, email và tài liệu không đáng tin cậy.

Ghi log các thao tác quan trọng, nhưng không ghi lộ mật khẩu, API key hoặc token phiên.

## XIV. CẤU TRÚC BÀN GIAO

Ưu tiên dự án có cấu trúc rõ ràng:

TRUNG-KIEN-AI-HUB/
- apps/desktop/
- packages/agent-core/
- packages/browser-automation/
- packages/windows-automation/
- packages/project-manager/
- packages/skills-manager/
- packages/mcp-manager/
- packages/memory/
- packages/usage-monitor/
- packages/security/
- integrations/
- database/
- scripts/
- tests/
- docs/
- release/

Tạo tài liệu:

- README.md
- ARCHITECTURE.md
- INSTALL.md
- USER-GUIDE-VI.md
- PROJECT-MIGRATION.md
- SECURITY.md
- TEST-REPORT.md
- HANDOVER.md
- CHANGELOG.md

Đường dẫn dữ liệu ứng dụng phải tách khỏi mã nguồn và gói cài đặt.

## XV. CÁC GIAI ĐOẠN THỰC HIỆN

**Giai đoạn 1 – Kiểm kê và sao lưu**

- Xem xét dự án có quyền truy cập.
- Sao lưu.
- Xây danh mục công việc.
- Kiểm tra Skills và hướng dẫn hệ thống.
- Lập sơ đồ dữ liệu.

**Giai đoạn 2 – Xây lõi ứng dụng**

- Tạo ứng dụng Windows.
- Hoàn thiện UI.
- Kết nối Claude Agent SDK.
- Kết nối API key.
- Chat và streaming.
- Quản lý dự án.
- Lưu lịch sử.
- Quản lý chi phí.

**Giai đoạn 3 – Năng lực Agent**

- Skills.
- MCP.
- Subagents.
- Hooks.
- Permissions.
- Sessions.
- Memory.
- Checkpoints.

**Giai đoạn 4 – Điều khiển**

- Chrome.
- Windows.
- Đọc/sửa file.
- Chạy code.
- Tự động hóa nhiều bước.
- Công cụ quan sát thao tác.

**Giai đoạn 5 – Tích hợp dự án cũ**

- Kết nối các thư mục dự án.
- Nhập quy tắc và Skills.
- Chuyển dữ liệu phù hợp.
- Khôi phục danh sách công việc.
- Kiểm tra khả năng tiếp tục công việc thực tế.

**Giai đoạn 6 – Kiểm thử và đóng gói**

- Kiểm thử chức năng.
- Kiểm thử bảo mật.
- Kiểm thử API billing.
- Kiểm thử điều khiển Chrome.
- Kiểm thử Windows.
- Kiểm thử sao lưu/khôi phục.
- Kiểm thử cập nhật.
- Đóng gói file cài Windows.

## XVI. TIÊU CHUẨN NGHIỆM THU

Chỉ công nhận hoàn thành khi có bằng chứng cho các chức năng:

1. Cài được trên Windows.
2. Mở ứng dụng và chat với Claude API.
3. API chạy đúng cơ chế tính phí theo API key.
4. Chọn và mở được dự án đã nhập.
5. Đọc được Skills.
6. Thực thi một Skill thực tế.
7. Đọc được CLAUDE.md.
8. Lưu được lịch sử.
9. Đóng/mở lại không mất dữ liệu.
10. Khôi phục được phiên và checkpoint theo khả năng SDK.
11. Mở và điều khiển Chrome.
12. Đọc được nội dung trang.
13. Thao tác được trên trang thử nghiệm.
14. Đọc được Excel.
15. Chỉnh sửa được Word.
16. Xuất được PDF.
17. Chạy được script.
18. Ghi log thao tác.
19. Theo dõi được token và chi phí.
20. Dừng khi chạm giới hạn chi phí.
21. Sao lưu và khôi phục thành công.
22. Kiểm tra phân quyền.
23. Khôi phục sau lỗi.
24. Import được cấu hình/dự án cũ tương thích.
25. Tiếp tục được một công việc thực tế của dự án Trung Kiên.

Với mỗi mục phải ghi PASS / FAIL / BLOCKED, cách thử và bằng chứng.

Không đánh dấu PASS cho tính năng chưa thử.

## XVII. QUY TẮC LÀM VIỆC

- Bắt đầu thực hiện ngay.
- Không dừng sau bước lập kế hoạch.
- Không chỉ tạo giao diện.
- Không dùng dữ liệu giả để tuyên bố nghiệm thu.
- Không bỏ qua backend.
- Không xóa dự án cũ.
- Không thay đổi dữ liệu sản xuất khi chưa được cấp quyền.
- Không hỏi lại những thông tin đã có trong workspace.
- Tự kiểm tra tài liệu chính thức và lỗi tương thích.
- Sau mỗi giai đoạn, kiểm thử rồi mới triển khai tiếp.
- Tự sửa lỗi trong phạm vi an toàn.
- Không tuyên bố hoàn thành phần chưa làm.
- Nếu hết ngữ cảnh, ghi checkpoint/HANDOVER để phiên sau tiếp tục.
- Nếu bị giới hạn bởi quyền truy cập hoặc cần phê duyệt rủi ro cao, ghi rõ trở ngại và chỉ yêu cầu đúng quyền cần thiết.
- Không tự động làm việc ngoài phiên thực thi hoặc ngầm tuyên bố vẫn chạy sau khi đã dừng.
- Ưu tiên chất lượng, an toàn dữ liệu và khả năng bảo trì lâu dài.

## XVIII. KẾT QUẢ PHẢI BÀN GIAO

1. Toàn bộ mã nguồn có thể build.
2. Ứng dụng Windows đã đóng gói và kiểm tra.
3. File cài đặt .exe hoặc .msi.
4. Cơ sở dữ liệu và cơ chế lưu trữ.
5. Bộ quản lý Skills.
6. Bộ quản lý dự án.
7. Claude Agent SDK integration.
8. Bộ điều khiển Chrome.
9. Bộ điều khiển Windows.
10. Hệ thống API billing và giới hạn chi phí.
11. Tài liệu hướng dẫn tiếng Việt.
12. Báo cáo kiểm thử và lỗi còn tồn tại.
13. Danh mục dự án cũ đã chuyển.
14. Kế hoạch tiếp tục cho các dự án chưa chuyển được.

**BẮT ĐẦU NGAY TỪ VIỆC KIỂM KÊ MÔI TRƯỜNG VÀ CÁC DỰ ÁN CÓ QUYỀN TRUY CẬP. SAU ĐÓ TRIỂN KHAI LIÊN TỤC THEO CÁC GIAI ĐOẠN TRONG PHẠM VI PHIÊN LÀM VIỆC, TỰ KIỂM THỬ, SỬA LỖI VÀ BÀN GIAO KẾT QUẢ THỰC TẾ.**

# LỆNH BỔ SUNG BẮT BUỘC – TRUNG KIÊN AI HUB

Đây là phần mở rộng yêu cầu của dự án Trung Kiên AI Hub đang thực hiện. Hãy cập nhật kiến trúc, kế hoạch, mã nguồn và tiêu chuẩn nghiệm thu theo các điều kiện sau.

**MỤC TIÊU CUỐI CÙNG: ỨNG DỤNG MỚI PHẢI THAY THẾ ĐƯỢC CLAUDE DESKTOP/COWORK TRONG NHỮNG CÔNG VIỆC THỰC TẾ TÔI ĐANG LÀM, DÙNG TÍN DỤNG CLAUDE API THAY CHO HẠN MỨC GÓI MAX.**

Không chỉ tạo thêm một ứng dụng chat AI đơn giản.

## 1. CHUYỂN GIAO TOÀN BỘ HỆ THỐNG LÀM VIỆC HIỆN TẠI

Trước khi hoàn thiện phần mềm, phải kiểm kê và chuyển giao tối đa mọi dữ liệu có thể truy cập hợp lệ từ môi trường Claude hiện tại.

Bao gồm:

- Tất cả dự án đang thực hiện.
- Toàn bộ Skills và file SKILL.md.
- Hướng dẫn CLAUDE.md.
- Global instructions và project instructions.
- Quy tắc công ty Trung Kiên.
- Custom Agents và Subagents.
- MCP và cấu hình kết nối.
- Hooks, Commands và Scripts.
- Mã nguồn các dự án.
- File cấu hình.
- Tài liệu tham khảo.
- Catalogue, bảng giá, hợp đồng.
- Dữ liệu website và SEO.
- Dữ liệu Google Ads được phép truy cập.
- Cơ sở dữ liệu và hệ thống bộ nhớ.
- Lịch sử hội thoại, lịch sử thao tác và checkpoint có thể xuất hoặc đọc hợp lệ.
- Quy trình xử lý công việc.
- Công việc hoàn thành, đang làm và chờ thực hiện.
- Các lỗi đã được phát hiện và phương án xử lý.
- Các cấu hình và phụ thuộc cần thiết để công cụ hoạt động.

ĐẶC BIỆT:

Tôi không muốn phải hướng dẫn lại AI từ đầu.

Ví dụ: Khi mở dự án SEO Trung Kiên, AI phải biết sử dụng đúng dữ liệu, Skills, quy tắc SEO và tiến độ của dự án đã chuyển giao.

Khi mở dự án xử lý catalogue, AI phải có khả năng tìm lại tài liệu liên quan, quy tắc xử lý và tiếp tục công việc.

Khi mở dự án phần mềm đang lập trình, AI phải đọc được mã nguồn, kiểm tra Git, xác định trạng thái và tiếp tục từ checkpoint hợp lệ.

### Quy trình chuyển giao

1. Kiểm kê toàn bộ dữ liệu trong phạm vi được cấp quyền.
2. Sao lưu nguyên trạng và tạo checksum xác minh.
3. Lập danh mục mọi tài sản cần chuyển.
4. Phân tích phụ thuộc giữa Skills, Agents, MCP và dự án.
5. Nhập dữ liệu vào ứng dụng mới.
6. Giữ nguyên các file gốc.
7. Kiểm tra dữ liệu sau nhập.
8. Kiểm thử khả năng thực thi thực tế.
9. Đối chiếu danh mục trước và sau chuyển.
10. Tạo báo cáo những gì đã chuyển thành công và những gì chưa chuyển được.

Không được bỏ qua dữ liệu chỉ vì định dạng khác nhau.

Nếu API hoặc ứng dụng Claude không cho truy cập trực tiếp một thành phần, phải ghi rõ BLOCKED và xây phương án nhập bằng file xuất dữ liệu hoặc thao tác người dùng cho phép.

Không tuyên bố chuyển được 100% lịch sử, bộ nhớ ẩn, phiên đăng nhập hoặc chức năng nội bộ Cowork nếu thực tế chưa thể truy xuất.

Không sao chép mật khẩu, API key, cookie hay thông tin xác thực sang nơi lưu trữ không an toàn.

## 2. ỨNG DỤNG PHẢI CÓ NĂNG LỰC LÀM VIỆC NHƯ COWORK

Không chỉ giống giao diện.

Tôi muốn giao công việc bằng ngôn ngữ tự nhiên, ví dụ:

"Kiểm tra toàn bộ website, tìm lỗi SEO và đề xuất cách xử lý."

"Đọc các catalogue và cập nhật dữ liệu sản phẩm."

"Mở Chrome kiểm tra tiến độ chiến dịch quảng cáo."

"Tiếp tục lập trình dự án hôm trước."

"Hãy kiểm tra và hoàn thiện các công việc còn dang dở."

Ứng dụng cần có khả năng:

- Nhận và hiểu nhiệm vụ.
- Tự lập kế hoạch.
- Tìm dữ liệu phù hợp.
- Nạp đúng Skills.
- Nạp đúng hướng dẫn dự án.
- Chọn Agent phù hợp.
- Gọi các công cụ cần thiết.
- Điều khiển Chrome.
- Điều khiển ứng dụng Windows.
- Mở, đọc, sửa và tạo file.
- Chạy mã nguồn.
- Phân tích dữ liệu.
- Tự kiểm tra kết quả.
- Phát hiện và sửa lỗi.
- Lưu toàn bộ tiến độ.
- Khôi phục công việc sau khi đóng ứng dụng.

Không dừng lại chỉ vì một bước nhỏ bị lỗi nếu có phương án khắc phục an toàn.

Không yêu cầu tôi liên tục nhấn "tiếp tục" khi đang thực hiện các thao tác đã được cấp quyền.

Những thao tác rủi ro cao, có thể làm mất dữ liệu, phát sinh chi phí hoặc thay đổi hệ thống bên ngoài vẫn phải xin xác nhận.

**Tiêu chuẩn đánh giá là thực hiện được công việc thực tế, không phải số lượng nút chức năng trên giao diện.**

## 3. TỰ ĐỘNG NHẬN DIỆN DỰ ÁN, SKILLS VÀ NGỮ CẢNH

Mỗi dự án phải có:

- Bộ nhớ riêng.
- Hướng dẫn riêng.
- Skills riêng.
- Tài liệu riêng.
- Lịch sử công việc.
- Danh sách công việc còn lại.
- Checkpoint.
- Ngân sách API.
- Công cụ và quyền truy cập riêng.

Khi tôi chọn dự án, ứng dụng tự tải ngữ cảnh cần thiết.

Không yêu cầu tôi phải đính kèm lại tài liệu hoặc giải thích lại toàn bộ dự án sau mỗi phiên.

Có cơ chế tìm kiếm trên dữ liệu dự án nhưng không nạp toàn bộ dữ liệu lên API mỗi lần gọi.

Hỗ trợ nhiều dự án và tự động bàn giao tiến độ giữa các phiên.

## 4. HỆ THỐNG GIỚI HẠN CHI PHÍ API – BẮT BUỘC

Xây màn hình riêng:

**API USAGE & BUDGET CONTROL**

Tôi phải tự đặt được:

1. Hạn mức USD cho mỗi yêu cầu.
2. Hạn mức USD cho mỗi công việc.
3. Hạn mức USD mỗi ngày.
4. Hạn mức USD mỗi tháng.
5. Hạn mức riêng cho từng dự án.
6. Hạn mức theo từng model.
7. Giới hạn token và số lượt gọi công cụ khi cần.
8. Giới hạn số công việc chạy song song.
9. Chọn model mặc định cho từng loại công việc.

Ví dụ cấu hình ban đầu có thể điều chỉnh:

- Tối đa 5 USD cho một công việc.
- Tối đa 10 USD mỗi ngày.
- Tối đa 150 USD mỗi tháng.
- Cảnh báo tại 70%, 90% và 100%.
- Không tự nạp thêm tiền.
- Không tự nâng hạn mức.

Các mức trên chỉ là cấu hình khởi tạo. Chủ sở hữu có thể thay đổi.

### Cơ chế dừng chi phí

Phải xây hệ thống kiểm soát thực tế ở backend:

- Tính và ghi nhận chi phí theo từng lượt gọi.
- Theo dõi token input, output và cache.
- Ước tính trước chi phí và giới hạn đầu ra.
- Dự phòng ngân sách cho các yêu cầu đang chạy.
- Không cho khởi chạy yêu cầu mới nếu không đủ ngân sách.
- Khi đạt giới hạn, dừng cấp quyền cho các lượt gọi tiếp theo.
- Cho phép hủy các yêu cầu đang chạy khi cần.
- Phòng tránh nhiều Agent chạy đồng thời vượt ngân sách.
- Lưu dữ liệu trước khi dừng.
- Hiển thị lý do dừng.
- Cho phép tiếp tục khi chủ sở hữu điều chỉnh hạn mức.

Lưu ý: Chi phí của yêu cầu đã gửi có thể phát sinh trước khi dừng. Không được cam kết giới hạn tuyệt đối nếu nhà cung cấp không hỗ trợ. Cần có ngân sách dự phòng và giới hạn bổ sung tại Claude Console.

### Bảo vệ hai lớp

**Lớp 1: Trong ứng dụng**

Kiểm soát hạn mức theo công việc, ngày, tháng, dự án, model.

**Lớp 2: Claude Console**

Hướng dẫn chủ sở hữu tạo Workspace và đặt Monthly Spend Limit chính thức. Dùng API key riêng thuộc Workspace đó.

Kiểm tra và đối soát dữ liệu sử dụng với Anthropic Usage/Cost API khi có quyền và tính năng được hỗ trợ.

Phải phân biệt:

- Tín dụng được tặng còn lại.
- Tín dụng đã mua.
- Chi phí đã sử dụng.
- Chi phí đang ước tính.
- Hạn mức cài đặt.
- Ngày hết hạn tín dụng.

Không giả lập số dư thực nếu chưa có dữ liệu từ Anthropic.

## 5. KHẢ NĂNG TIẾP TỤC DỰ ÁN CŨ

Đây là điều kiện nghiệm thu quan trọng nhất.

Phải chọn ít nhất một công việc thực tế trong từng nhóm dự án đã kiểm kê, rồi kiểm tra:

- AI có đọc đúng tài liệu không?
- AI có biết các quy tắc cũ không?
- AI có sử dụng được Skills không?
- AI có biết công việc trước đó đang làm đến đâu không?
- AI có thực hiện được thao tác như Claude hiện tại không?
- AI có lưu được kết quả và tiếp tục trong phiên tiếp theo không?
- AI có giới hạn được chi phí không?

Tạo báo cáo so sánh:

CHỨC NĂNG / CLAUDE HIỆN TẠI / AI HUB / KẾT QUẢ KIỂM THỬ / VẤN ĐỀ CÒN LẠI.

Không đánh dấu hoàn thành khi chỉ mới tạo giao diện hoặc khai báo chức năng.

Tính năng chưa thể tương đương Cowork phải được ghi rõ, không che giấu.

## 6. YÊU CẦU VỀ DỮ LIỆU VÀ NÂNG CẤP

Ứng dụng phải cho phép:

- Thêm dự án bất kỳ.
- Nhập Skills mới.
- Nhập Skills đã có.
- Đồng bộ các thay đổi từ thư mục dự án được chỉ định.
- Import/Export dữ liệu.
- Sao lưu và khôi phục.
- Đổi model.
- Thêm nhà cung cấp API khác.
- Nâng cấp phần mềm mà không mất dữ liệu.
- Phát hiện dữ liệu trùng.
- Tìm kiếm toàn bộ dự án được cấp quyền.

Tách dữ liệu khỏi thư mục cài ứng dụng.

Không đưa lại dữ liệu Thịnh Vượng vào dự án Trung Kiên.

## 7. ĐIỀU KIỆN BÀN GIAO CUỐI CÙNG

Chỉ đề nghị nghiệm thu khi:

1. Có ứng dụng Windows cài đặt được.
2. Kết nối và gọi Claude API thành công.
3. Đã nhập và kiểm thử các Skills tương thích.
4. Đã nhập hướng dẫn và quy tắc dự án.
5. Đã chuyển các dữ liệu công việc có thể truy cập.
6. Có danh sách minh bạch các mục chưa thể chuyển.
7. Có quản lý và giới hạn API hoạt động.
8. Có điều khiển Chrome thực tế.
9. Có điều khiển Windows thực tế.
10. Có hệ thống lưu trữ và khôi phục.
11. Có thể tiếp tục các công việc cũ đã được chọn để nghiệm thu.
12. Có kết quả kiểm thử thực tế.
13. Không làm mất hoặc thay đổi ngoài ý muốn dữ liệu dự án cũ.
14. Có mã nguồn, bản cài, hướng dẫn và báo cáo bàn giao đầy đủ.

**CHỈ THỰC HIỆN CHUYỂN SANG DÙNG ỨNG DỤNG MỚI LÀM CÔNG CỤ CHÍNH SAU KHI CÁC BÀI KIỂM THỬ CÔNG VIỆC THỰC TẾ ĐẠT YÊU CẦU.**

Không được xóa môi trường Claude Code/Cowork hiện tại sau khi chuyển giao.

Tiếp tục xây dựng ngay trên dự án Trung Kiên AI Hub đã có. Không tạo dự án mới trùng lặp. Tự làm liên tục qua các giai đoạn trong phạm vi phiên thực thi; tự kiểm thử, sửa lỗi và lưu checkpoint. Chỉ yêu cầu tương tác khi cần cấp quyền, cung cấp thông tin xác thực hoặc xác nhận hành động rủi ro.

Mục tiêu cuối cùng: Tôi mở Trung Kiên AI Hub, chọn dự án đang làm, giao công việc như với Claude Cowork hiện tại, AI tự sử dụng toàn bộ dữ liệu và công cụ liên quan, thực hiện và kiểm tra công việc, đồng thời không vượt ngân sách API tôi đã đặt trong giới hạn kỹ thuật có thể bảo đảm.

Tiếp tục xây dựng Trung Kiên AI Hub ngay trong môi trường Claude Code Cloud và repository GitHub hiện tại.

Yêu cầu:

1. Xây dựng toàn bộ mã nguồn, giao diện, Claude Agent SDK, Skills, MCP, quản lý dự án, bộ nhớ và giới hạn chi phí API trên Cloud.
2. Sử dụng GitHub Actions với Windows runner để build ứng dụng thành file cài đặt Windows.
3. Thiết kế Windows Automation Bridge để sau khi cài trên PC có thể điều khiển Chrome, chuột, bàn phím, ứng dụng và đọc dữ liệu trong phạm vi được cấp quyền.
4. Tạo công cụ nhập toàn bộ Skills, CLAUDE.md, hướng dẫn hệ thống, dữ liệu, mã nguồn, cấu hình và tiến độ dự án Claude hiện tại có thể truy cập hợp lệ.
5. Có giới hạn API theo ngày, tháng, công việc và dự án, kèm cơ chế dừng và cảnh báo.
6. Lưu mã nguồn và tiến độ liên tục vào GitHub, tránh mất công việc khi phiên Cloud kết thúc.
7. Tự kiểm thử mọi chức năng thực hiện được trên Cloud. Các chức năng cần máy Windows thật phải ghi rõ và chuẩn bị bài kiểm thử riêng.
8. Không được tuyên bố ứng dụng hoàn chỉnh nếu chưa kiểm thử chức năng thực tế trên Windows.
9. Không xóa hoặc ghi đè dữ liệu dự án cũ.

Ưu tiên làm ra ứng dụng có khả năng thực hiện công việc như Claude Cowork hiện tại, không chỉ tạo phần mềm chat.

Tiếp tục triển khai trong repository hiện có, không tạo dự án trùng lặp.