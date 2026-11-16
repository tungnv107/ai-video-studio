# Tiến độ và phạm vi nghiệm thu — 16/11/2026

Master prompt là đặc tả đích. Các mục dưới phân biệt code đã có, kiểm chứng local/mocked và công việc cần tài khoản bên ngoài. Không coi mock là nghiệm thu API thật.

## Đã triển khai

- [x] Core: Next.js/TypeScript, PostgreSQL/Prisma, Redis/BullMQ, worker riêng, private local/S3 storage, Docker.
- [x] Auth/session/RBAC/CSRF, lời mời và quản lý thành viên; TOTP/recovery, reset mật khẩu SMTP.
- [x] RLS cho 39 bảng với role NOBYPASSRLS; tenant pool riêng, kiểm tra role, giới hạn connection. Authentication/worker là thành phần tin cậy có quyền rộng hơn.
- [x] Kịch bản schema, biên tập scene/lock/revision, AI rewrite/hooks/resize, lịch sử và khôi phục.
- [x] Nghiên cứu RSS/article/Brave, kế hoạch câu hỏi, nguồn/excerpt/thời gian truy cập, brief đối chiếu trích dẫn.
- [x] Ý tưởng có vấn đề, khán giả, điểm phù hợp/khả thi và lý do, nguồn, dự toán theo cấu hình provider.
- [x] Topic/title dedupe, embeddings theo model/provider, exact narration dedupe; cảnh báo hình ảnh/cấu trúc lặp.
- [x] Provider priority, capability, concurrency/RPM, timeout và fallback sau từ chối xác định; unknown cost cần đối soát.
- [x] Ảnh AI + motion; Runway text/image-to-video có remote checkpoint; hybrid/footage/thẻ nội dung.
- [x] TTS tốc độ/phong cách, loudness normalization, music ducking, clipping/silence checks.
- [x] Proportional hoặc forced alignment; karaoke, Unicode ASS, SRT/VTT, font/màu/vị trí/vùng an toàn.
- [x] Pan 4 hướng, parallax hai lớp; biểu đồ thanh, infographic bước và thẻ số liệu; preview/biên tập từng scene, tôn trọng locks và revisions.
- [x] 3 tỷ lệ video, 24/25/30 FPS, cut/fade, intro/outro, overlay chữ/logo, thumbnail có tiêu đề.
- [x] Template/brand versions, media có license và ownership, snapshot cấu hình. Xuất biến thể tái dùng assets; bản TikTok bỏ logo và thẻ thương hiệu, duyệt riêng.
- [x] Technical QA bằng decode/FFprobe; rubric cấu hình; AI kiểm tra sample frames và script; approval thủ công.
- [x] Lịch cron/timezone, occurrence dedupe, lease/fencing/outbox/retry/dead-letter/restart recovery.
- [x] Mốc nghiên cứu/sản xuất/deadline/đăng riêng, tính ngược từ giờ đăng, chờ job trong DB, giữ checkpoint nghiên cứu, thông báo quá hạn một lần.
- [x] Sửa hydration do extension thêm thuộc tính body; cảnh báo mismatch bên trong ứng dụng vẫn hoạt động.
- [x] Campaign topics/window/count/budget; calendar 5 chế độ, dời lịch, pause/resume, bulk approval.
- [x] OAuth chính thức, encrypted tokens, refresh/revoke; YouTube resumable/scheduling/thumbnail; TikTok direct/inbox/chunked/resume bằng remote offset; signed webhooks/replay dedupe.
- [x] Metrics sync/leases theo giờ, null cho dữ liệu thiếu, A/B 24–48 giờ, đề xuất AI dựa trên dữ liệu thật.
- [x] Chi phí AI theo video/kênh/tháng, ngân sách atomic và dự toán trước dựng; hạ tầng có đơn giá dự toán.
- [x] Retention, archive và CLI restore/purge với dry-run, xác nhận tên và phạm vi storage.
- [x] Tài liệu, .env.example, migrations, seed presets, unit/integration/E2E và smoke scripts.
- [x] Trang `/guide` công khai bằng tiếng Việt: 10 chủ đề, tìm kiếm không dấu, mục lục/liên kết từng mục, xử lý sự cố, mobile và sáng/tối. Truy cập từ đăng nhập/menu/toolbar.
- [x] Hoàn thiện giao diện: preview clip VIDEO trong thư viện, mô tả đúng chức năng thương hiệu, chọn TikTok Upload khi không có Direct Post/quyền publish, tải lại bootstrap sau lỗi kết nối mà không giữ lỗi cũ.
- [x] Cấu hình ứng dụng OAuth YouTube/TikTok theo workspace trong Kết nối nền tảng: OWNER, secret mã hóa, RLS, giữ secret khi để trống, chống ghi đè phiên bản, hủy state/token/consent cũ khi đổi cấu hình. Callback, refresh và revoke dùng đúng ứng dụng; webhook TikTok riêng theo studio/version.

## Kiểm chứng local

Xem [TEST_PLAN.md](TEST_PLAN.md) và artifacts/*.json. Kết quả milestone trước: 48 unit, 56 integration, 5 E2E. Lượt cuối 16/11: 57 unit, 59 integration, 8 E2E và typecheck đều qua; Docker production build qua. Bộ motion/graphics ba tỷ lệ đạt QA 100 trên Windows/Linux, thêm bản 1080×1920. Chi tiết trong TEST_PLAN.md và artifacts/verification-finalization.json. Linux authenticated RLS/bootstrap, web/worker/FFmpeg, full-HD advanced render đã kiểm chứng. Đã kiểm chứng các nhóm: Windows FFmpeg 3 tỷ lệ có fade/logo/ducking/overlay/karaoke; SMTP local; RLS trên PostgreSQL thật; backup/restore database riêng; tải API có giới hạn; Chrome desktop/mobile; MinIO private storage và restart từ milestone trước.

## Điều kiện ngoài môi trường hiện tại

Bổ sung cuối 16/11: trang hướng dẫn và các sửa giao diện đã qua typecheck, 57 unit, 59 integration, 11 Chrome E2E và production build. Đã kiểm tra HTTP trang `/guide` trên bản production local. Xem TEST_PLAN.md và artifacts/verification-guide.json.

- [ ] AI paid API thật: cần key, quyền model, ngân sách thực tế do chủ studio cấu hình.
- [ ] YouTube/TikTok live OAuth/upload/metrics/webhook: cần app và tài khoản được cấp quyền, callback HTTPS, scope và TikTok eligibility/audit.
- [ ] Domain public, TLS, production S3/SMTP, DNS, secrets backup, monitoring và tải ở quy mô VPS mục tiêu. Không tự deploy/publish/push.

## Giới hạn sản phẩm minh bạch

- Giao diện dùng React/Tailwind/CSS riêng; không tích hợp shadcn registry. Hybrid có clip/ảnh/footage/đồ họa dữ liệu; có chỉnh chuyển động và chuyển cảnh theo scene. Parallax dùng ảnh nổi trên nền mờ chuyển động, không tự phân tách chiều sâu hay tách chủ thể. Không phải trình dựng nhiều track tự do.
- Nghiên cứu AI không chứng minh sự thật tuyệt đối. Hai host khác nhau chưa chắc là hai tổ chức độc lập; người duyệt phải kiểm tra nguồn, đặc biệt nội dung nhạy cảm. Không có feed xu hướng riêng nếu chưa cấu hình nguồn được cấp phép.
- Độ tương đồng ảnh dùng hash thang xám 8×8 để cảnh báo; không phải nhận diện mọi trường hợp sao chép. Cấu trúc lặp cảnh báo theo mẫu nhịp/motion/transition.
- Rubric kỹ thuật đo tín hiệu, decode, timestamp và tốc độ chữ; AI chỉ xem sample frames. Không thay thế kiểm tra toàn bộ video/quyền sử dụng/độ chính xác.
- A/B là phân bổ các video khác nhau và so sánh theo tuổi bài; chưa phải thử nghiệm phân phối thumbnail trên cùng một video. Không kết luận quan hệ nhân quả.
- Calendar lưu mốc kế hoạch và thực tế riêng. Deadline là mục tiêu và có cảnh báo quá hạn; không cam kết thời gian xử lý AI. Không tự đăng video chưa duyệt/chưa đạt QA.
- Chi phí storage/render là dự toán hạ tầng, chưa đối soát hóa đơn hay đo CPU billing. LLM/TTS hiện dùng endpoint còn hỗ trợ nhưng cần migration trước lịch ngừng tháng 1/2027.

Chi phí RENDER/STORAGE được ghi vào CostUsage theo đơn giá cấu hình (ước tính); render lỗi vẫn giữ chi phí hạ tầng đã thực hiện. Storage tính một tháng theo byte MP4/thumbnail/assets, chưa đối soát invoice. Đơn giá 0 nghĩa là chưa cấu hình giá hạ tầng.
