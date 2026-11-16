# AI Video Automation Studio

Ứng dụng Next.js/TypeScript tiếng Việt, có PostgreSQL/Prisma, Redis/BullMQ, worker riêng và FFmpeg. Được xây dựng từ `AI_Video_Automation_Studio_Master_Prompt.md`.

> Cập nhật 16/11/2026: đã sửa hydration trên trang đăng nhập khi extension thêm thuộc tính body; hoàn thiện mốc lịch, đánh giá ý tưởng và đồ họa/motion từng scene.

> Bổ sung hướng dẫn: [Hướng dẫn sử dụng](http://localhost:3000/guide) mở được trước khi đăng nhập, có tìm kiếm có/không dấu, mục lục và xử lý sự cố. Có liên kết từ trang đăng nhập, menu và thanh trên cùng của studio. Thư viện đã xem được clip tạo ra, form TikTok chọn luồng theo quyền thực tế và studio có nút thử tải lại khi kết nối tạm lỗi.

> Trạng thái: đã triển khai core, sản xuất nâng cao, nghiên cứu, chiến dịch, publishing adapters và bảo mật đa workspace. Các luồng local có kiểm thử thực tế; API AI trả phí và đăng lên tài khoản social thật chưa được nghiệm thu vì chưa có credentials. Media trong artifacts là fixture kiểm thử. Xem phạm vi và điều kiện nghiệm thu trong [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Chạy local

Yêu cầu Node.js 24 LTS, Docker Desktop/Engine. Windows có thể dùng Chrome đã cài để chạy E2E.

```sh
npm ci
npm run setup:local
docker compose up -d postgres redis
npm run db:migrate
npm run db:rls
npm run db:seed
npm run dev
```

Terminal thứ hai:

```sh
npm run worker
```

Mở [http://localhost:3000](http://localhost:3000), chọn **Tạo tài khoản**, tạo kênh, thêm provider và nhập chủ đề để tạo video. Dùng đúng origin trong APP_URL; `127.0.0.1` và `localhost` không được coi là cùng origin cho CSRF.

Seed không tạo mật khẩu mặc định hoặc video giả. Bảy template được tạo khi đăng ký workspace. `setup:local` sinh encryption key và mật khẩu ngẫu nhiên, không ghi đè .env đã tồn tại.

FFmpeg/FFprobe: trên Windows dev dùng package ffmpeg-static/ffprobe-static; Linux dùng binary hệ thống. Có thể đặt FFMPEG_PATH/FFPROBE_PATH. Cài fonts-dejavu-core trên Linux để render dấu tiếng Việt. Dockerfile đã cài chúng.

## Luồng hoạt động

1. Tạo kênh: chủ đề, khán giả, phong cách, giọng, ngân sách tháng.
2. Thêm provider OpenAI: API key chỉ được lưu mã hóa server-side. Chọn model bạn có quyền sử dụng. Endpoint compatible chỉ hỗ trợ LLM cho adapter này.
3. Tạo video: nhập chủ đề, nguồn tham khảo, thời lượng 10–900 giây, tỷ lệ và chất lượng ảnh. Chọn chỉ tạo script hoặc tạo toàn bộ video.
4. API lưu job vào PostgreSQL; worker đưa vào BullMQ, gọi AI, lưu từng asset, dựng FFmpeg, kiểm tra file và track.
5. Mở video: sửa scene, pan/parallax, biểu đồ/infographic, chuyển cảnh từng scene, khóa scene, lưu/khôi phục phiên bản; dựng phiên bản đã lưu; xem QA và tải MP4/SRT/VTT.
6. Phê duyệt nội dung sau khi xem preview và kiểm tra quyền. Kết nối mạng xã hội không tự tạo consent cho nội dung.
7. Lịch hỗ trợ cron/timezone hoặc một lần, tính ngược nghiên cứu/sản xuất/deadline từ giờ đăng và nhả worker trong lúc chờ; sau restart đọc lại DB. Lịch xuất bản là bước riêng và phải được duyệt.

## Biên tập AI và cộng tác

Trong chi tiết video, **Trợ lý biên tập AI** có ba thao tác: viết lại một scene, tạo 3 hook mở đầu hoặc đổi tổng thời lượng. Lưu bản sửa tay trước khi gửi yêu cầu. Worker trả các phương án để xem trước; **Áp dụng** tạo revision mới, giữ scene khóa và vô hiệu output/approval cũ. Bản gốc đổi trong lúc AI chạy thì đề xuất cũ hết hiệu lực. Mỗi yêu cầu giữ ngân sách ước tính một lần viết kịch bản; ba hook giữ ba lần mức này. Timeout không tự gọi lại; muốn thử mới phải chấp nhận chi phí bổ sung nếu có khoản chưa xác định.

Trong **Cài đặt tài khoản**, chủ sở hữu tạo liên kết mời theo email/vai trò, thu hồi lời mời, đổi vai trò và xóa thành viên. Liên kết dùng một lần, hết hạn sau 7 ngày; bạn tự chia sẻ liên kết, hệ thống chưa gửi email. Người nhận đăng nhập/đăng ký đúng email rồi chọn **Tham gia workspace**. Có bộ chọn để chuyển giữa các workspace. Workspace luôn phải còn ít nhất một chủ sở hữu; xóa thành viên thu hồi các phiên truy cập vào workspace đó.

## Kiểm thử

```sh
npm run typecheck
npm test
npm run test:integration
npm run test:render
npm run test:e2e
npm run build
```

Integration cần PostgreSQL/Redis và **không chạy production worker đồng thời**: test dùng worker trực tiếp và mock paid API. E2E cần web đang chạy. Các test tạo workspace TEST rồi xóa dữ liệu DB của workspace đó. Không chạy integration trên database có dữ liệu production. File media fixture được giữ trong artifacts để kiểm tra.

Windows: Prisma query engine DLL có thể bị khóa khi web/worker đang dùng. Dừng các process đó trước khi `npm run db:generate`. `npm run build` dùng Webpack vì Turbopack gặp lỗi subprocess trên máy kiểm thử. Có thể dùng NEXT_DIST_DIR=.next-build nếu muốn build trong khi server dev đang chạy; chạy production bằng cùng biến này.

## Tài liệu

- [Trang hướng dẫn sử dụng](http://localhost:3000/guide): 10 chủ đề từ thiết lập đến xuất bản, cộng tác và 10 câu hỏi xử lý sự cố. Trên máy chủ khác, mở `/guide` tại origin của ứng dụng.
- [Kiến trúc](ARCHITECTURE.md), [yêu cầu](PRODUCT_REQUIREMENTS.md), [kế hoạch thực tế](IMPLEMENTATION_PLAN.md)
- [Database](DATABASE_SCHEMA.md), [API](API_SPECIFICATION.md), [AI pipeline](AI_PIPELINE.md)
- [Render](VIDEO_RENDERING.md), [social publishing](SOCIAL_PUBLISHING.md)
- [Bảo mật](SECURITY.md), [triển khai/backup](DEPLOYMENT.md), [kiểm thử](TEST_PLAN.md)

Không tự động deploy, push hoặc đăng nội dung khi khởi động dự án. `PUBLISHING_ENABLED=false` và `TIKTOK_DIRECT_POST_ENABLED=false` mặc định.


## Các chức năng nâng cao

- **Thương hiệu & mẫu:** cấu hình theo kênh; logo, nhạc nền ducking, footage có giấy phép; intro/outro, fade, FPS, font/màu/vùng an toàn phụ đề, lưu và áp dụng phiên bản template/brand kit. Cấu hình được snapshot khi tạo video.
- **Sản xuất:** ảnh AI, Runway text/image-to-video, hybrid, footage hoặc thẻ nội dung; overlay chữ, phụ đề từng từ qua ElevenLabs forced alignment. Không dùng dữ liệu giả khi provider thất bại.
- **Nghiên cứu:** RSS/bài viết từ host cho phép; Brave Search nếu không có nguồn; lưu excerpt, thời gian truy cập, brief và bằng chứng. SUPPORTED cần trích dẫn khớp từ ít nhất hai host, vẫn phải được người kiểm tra. Embeddings và kiểm tra kịch bản/hình ảnh lặp.
- **Lịch:** tháng/tuần/ngày/danh sách/Kanban, kéo hoặc nhập ngày để dời lần chạy kế tiếp; chiến dịch với chủ đề/ngân sách/số video; duyệt nhiều video đã xem. Lưới ngày dùng UTC, sự kiện ghi múi giờ của lịch.
- **Bản xuất:** mở chi tiết video → Chi phí dự kiến & xuất phiên bản. Bản TikTok bỏ logo, intro/outro; từng bản có QA và approval riêng.
- **Analytics:** sync số liệu chính thức theo giờ, biểu đồ, A/B theo nhóm video, đề xuất AI có dẫn ID bài đăng làm bằng chứng. Chỉ số chưa có quyền/API trả về hiển thị trống.
- **Bảo mật:** RLS với role riêng, Authenticator/TOTP và recovery code dùng một lần, reset mật khẩu bằng SMTP, archive/restore/purge workspace, retention media đã xóa mềm.

## Cấu hình dịch vụ

**OAuth theo từng studio:** chủ sở hữu mở **Kết nối nền tảng → Cấu hình ứng dụng YouTube/TikTok** để nhập Client ID/Key và Client Secret. Secret được mã hóa, không trả lại trình duyệt. Mỗi workspace có cấu hình độc lập; bốn biến YOUTUBE_CLIENT_ID/SECRET và TIKTOK_CLIENT_KEY/SECRET trong `.env` không còn được dùng cho OAuth. Sao chép Redirect URI và Webhook URL TikTok được hiển thị vào ứng dụng developer. Lưu xong có thể kết nối ngay, không cần khởi động lại.

Khi nâng cấp, chạy migration `202611160002_workspace_oauth` và `npm run db:rls`, sau đó nhập cấu hình cho từng studio và kết nối lại tài khoản cũ. Đổi/xóa cấu hình cần xác nhận ngắt tài khoản và hủy các yêu cầu đăng đang chờ của riêng studio/nền tảng đó; đang upload thì chưa cho đổi. Secret trống giữ nguyên khi Client ID/Key không đổi. Các cờ `PUBLISHING_ENABLED` và `TIKTOK_DIRECT_POST_ENABLED` vẫn là công tắc của người vận hành máy chủ; lưu credentials không tự bật xuất bản.

Chạy db:rls sau migration để cấp policy và ghi TENANT_DATABASE_URL vào .env. Production từ chối tenant role SUPERUSER/BYPASSRLS. Worker và authentication dùng DATABASE_URL tin cậy. Nếu .env đã có trước bản nâng cấp, bổ sung các biến mới từ .env.example; setup:local không ghi đè secrets hiện có.

Thêm key trong UI cho OpenAI, Runway, ElevenLabs hoặc Brave. RESEARCH_ALLOWED_HOSTS và GENERATED_MEDIA_ALLOWED_HOSTS là danh sách **host chính xác**, không wildcard. DNS private/loopback bị chặn và IP được pin cho mỗi lượt tải. SMTP phải được cấu hình để gửi email reset; TLS được yêu cầu mặc định.

Model mặc định tạo ảnh mới là gpt-image-2.5-flare. Cấu hình model đã lưu không bị đổi ngầm; hãy sửa model đã ngừng phục vụ trong Provider Settings. Kiểm tra vòng đời model trước khi chạy lâu dài: gpt-4.1-mini và gpt-4o-mini-tts có lịch ngừng API vào tháng 1/2027. Xem [tài liệu provider](AI_PIPELINE.md).

Các đơn giá là ước tính do người vận hành nhập. RENDER_COST_CENTS_PER_MINUTE và STORAGE_COST_CENTS_PER_GB_MONTH bổ sung dự toán hạ tầng; không phải invoice nhà cung cấp.

Chi phí RENDER/STORAGE được ghi vào CostUsage theo đơn giá cấu hình (ước tính); render lỗi vẫn giữ chi phí hạ tầng đã thực hiện. Storage tính một tháng theo byte MP4/thumbnail/assets, chưa đối soát invoice. Đơn giá 0 nghĩa là chưa cấu hình giá hạ tầng.
