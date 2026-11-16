# MASTER PROMPT – AI VIDEO AUTOMATION STUDIO

> **Mục tiêu:** Xây dựng nền tảng tự động lên lịch nội dung, dùng AI nghiên cứu chủ đề, viết kịch bản, sản xuất video, kiểm tra chất lượng và phân phối lên YouTube, TikTok qua API chính thức khi đáp ứng đầy đủ điều kiện.
>
> **Ngôn ngữ giao diện:** Tiếng Việt · **Timezone mặc định:** `Asia/Ho_Chi_Minh` · **Định hướng:** Production-ready, Multi-channel, AI-first.

## 1. Vai trò và nhiệm vụ

Bạn là **Principal Software Architect, Senior Full-Stack Developer, AI Engineer, Video Processing Engineer và DevOps Engineer**, có kinh nghiệm xây dựng hệ thống AI Agent, tự động hóa sản xuất nội dung số và tích hợp API mạng xã hội.

Hãy **thiết kế và triển khai một ứng dụng Web SaaS hoàn chỉnh có tên AI Video Automation Studio**.

Phần mềm cho phép người dùng thiết lập một hoặc nhiều chủ đề nội dung, cấu hình lịch sản xuất và xuất bản. Hệ thống sử dụng AI để tự động nghiên cứu chủ đề, viết kịch bản, tạo giọng đọc, tạo hình ảnh/video minh họa, dựng video hoàn chỉnh, tạo metadata và phân phối lên YouTube, TikTok theo lịch.

Yêu cầu xây dựng **phần mềm thực sự hoạt động, không chỉ tạo giao diện demo**.

**Các nguyên tắc bắt buộc:**

- **Automation-first:** Tối đa hóa công việc tự động.
- **AI-first:** Ứng dụng AI xuyên suốt toàn bộ vòng đời nội dung.
- **Human-in-the-loop:** Hỗ trợ phê duyệt khi cần thiết.
- **Multi-channel:** Quản lý nhiều kênh và nhiều nền tảng.
- **Provider-agnostic:** Thay đổi nhà cung cấp AI mà không phải viết lại toàn bộ phần mềm.
- **Cost-aware:** Tối ưu chi phí AI và dựng video.
- **Production-ready:** Triển khai ổn định trên Docker/VPS.
- **Compliance-first:** Tích hợp mạng xã hội bằng API chính thức, tuân thủ yêu cầu xác thực, đồng ý đăng tải, nội dung và bản quyền.

## 2. Mục tiêu và các chế độ vận hành

### 2.1. Kịch bản sử dụng điển hình

Người dùng cấu hình:

- Chủ đề: Kiến thức công nghệ và ứng dụng AI.
- Đối tượng: Người xem 18–35 tuổi.
- Ngôn ngữ: Tiếng Việt.
- Phong cách: Hấp dẫn, dễ hiểu, mang tính giáo dục.
- Thời lượng: 45–60 giây.
- Tần suất: Hai video mỗi ngày.
- Giờ sản xuất: 07:00 và 14:00.
- Giờ đăng: 11:30 và 19:30.
- Nền tảng: YouTube Shorts và TikTok.
- Định dạng: Video dọc 9:16.
- Giọng đọc: Nam hoặc nữ, tiếng Việt tự nhiên.
- Phụ đề: Tự động.
- Chế độ: Sản xuất tự động, xuất bản theo chính sách và quyền của từng nền tảng.

**Hệ thống tự động:**

1. Kích hoạt công việc theo lịch.
2. Phân tích chủ đề, lịch sử video và các nội dung đã sản xuất.
3. Đề xuất một vấn đề cụ thể, tránh trùng lặp.
4. Nghiên cứu thông tin, kiểm tra nguồn và xây dựng ý tưởng.
5. Viết kịch bản có hook mở đầu, nội dung chính và CTA.
6. Chia kịch bản thành các phân cảnh.
7. Sinh hình ảnh hoặc video minh họa cho từng phân cảnh.
8. Sinh giọng đọc và đồng bộ âm thanh.
9. Dựng video, chèn phụ đề, hiệu ứng chuyển cảnh và nhạc nền.
10. Kiểm tra lỗi, chất lượng và chính sách nội dung.
11. Tạo tiêu đề, mô tả, hashtag và thumbnail.
12. Đưa vào hàng đợi xuất bản.
13. Xuất bản hoặc yêu cầu người dùng phê duyệt theo quy định của nền tảng.
14. Kiểm tra kết quả đăng tải và cập nhật trạng thái.
15. Thu thập số liệu, đánh giá hiệu quả và cải thiện nội dung tiếp theo.

### 2.2. Ba chế độ vận hành

**Manual Mode:** Người dùng tự chọn chủ đề và bấm tạo video. Hệ thống tạo toàn bộ nội dung nhưng chỉ xuất bản sau khi người dùng phê duyệt.

**Semi-Auto Mode:** Hệ thống tự đề xuất chủ đề, tạo kịch bản và dựng video theo lịch. Người dùng có thể chỉnh sửa trước khi phê duyệt.

**Auto Mode:** Hệ thống tự thực hiện những giai đoạn đã được người dùng cho phép. Việc đăng tải chỉ diễn ra tự động trên nền tảng, tài khoản và luồng công việc đáp ứng đầy đủ yêu cầu API và chính sách tương ứng.

> Không được coi việc liên kết tài khoản OAuth là sự đồng ý vô điều kiện cho mọi nội dung trong tương lai.

## 3. Kiến trúc công nghệ

Sử dụng stack ưu tiên:

| Thành phần | Công nghệ |
|---|---|
| Frontend | Next.js, TypeScript |
| UI | Tailwind CSS, shadcn/ui |
| Backend | Next.js API hoặc Node.js services |
| Database | PostgreSQL |
| ORM | Prisma |
| Queue | Redis + BullMQ |
| Scheduler | BullMQ Job Schedulers hoặc cơ chế tương đương |
| Render | FFmpeg + FFprobe |
| Storage | S3-compatible, MinIO |
| Authentication | Auth.js hoặc giải pháp tương đương |
| AI | Multi-provider API adapters |
| Deployment | Docker Compose |
| Monitoring | Structured logging, metrics, health checks |

Tách các thành phần thành các module độc lập:

- Web Application
- API Service
- AI Orchestrator
- Content Research Service
- Script Generation Service
- Asset Generation Service
- Text-to-Speech Service
- Video Rendering Worker
- Quality Assurance Service
- Publishing Service
- Analytics Service
- Scheduler & Queue Worker
- Notification Service

Các tác vụ dài phải chạy trong **background worker độc lập**, không block request HTTP. Thiết kế để có thể mở rộng thành nhiều worker dựng video khi tăng số lượng kênh.

## 4. Phân hệ quản lý chủ đề và kênh nội dung

### 4.1. Content Channels

Cho phép tạo nhiều dự án/kênh nội dung độc lập, ví dụ:

- Kênh 1: AI và công nghệ.
- Kênh 2: Khoa học thường thức.
- Kênh 3: Kiến thức kinh tế.
- Kênh 4: Lịch sử Việt Nam.
- Kênh 5: Mẹo và kỹ năng cuộc sống.

Mỗi kênh có cấu hình riêng:

- Tên, mô tả, avatar.
- Chủ đề và chủ đề con.
- Độc giả mục tiêu.
- Ngôn ngữ và thị trường.
- Phong cách nội dung.
- Bộ nhận diện.
- Giọng đọc mặc định.
- Template video.
- Lịch đăng.
- Nhà cung cấp AI.
- Ngân sách.
- Tài khoản YouTube/TikTok được liên kết.
- Chế độ phê duyệt.

### 4.2. Content Topic Generator

AI có khả năng tạo ý tưởng từ:

- Chủ đề do người dùng nhập.
- Danh sách từ khóa.
- Câu hỏi người dùng cung cấp.
- RSS feeds.
- Website/tài liệu tham khảo hợp lệ.
- Danh sách nội dung trước đó.
- Nguồn xu hướng được cấp quyền truy cập hợp pháp.

Mỗi ý tưởng gồm:

- Tiêu đề đề xuất.
- Vấn đề chính.
- Góc khai thác nội dung.
- Hook mở đầu.
- Đối tượng khán giả.
- Nguồn tham khảo.
- Độ phù hợp với kênh.
- Khả năng dựng thành video.
- Ước tính chi phí sản xuất.
- Điểm ưu tiên.

Không tự nhận có dữ liệu xu hướng thời gian thực khi chưa có nguồn hoặc API tương ứng.

### 4.3. Content Deduplication

Ngăn việc tạo các video trùng ý tưởng. Kiểm tra:

- Trùng tiêu đề.
- Trùng chủ đề.
- Trùng nội dung ngữ nghĩa.
- Trùng kịch bản.
- Trùng nội dung đã đăng.
- Lặp lại quá nhiều hình ảnh hoặc cấu trúc.

Sử dụng embeddings và semantic similarity khi thích hợp. Cho phép người dùng đặt thời gian tránh lặp nội dung: 7, 30, 60 hoặc 90 ngày.

## 5. Phân hệ AI Research & Script Writer

### 5.1. Research Agent

Tự động nghiên cứu trước khi viết kịch bản:

1. Nhận chủ đề.
2. Tách các câu hỏi cần tìm hiểu.
3. Tìm nguồn đáng tin cậy.
4. Trích xuất thông tin.
5. Phân loại dữ kiện và nhận định.
6. Kiểm tra mâu thuẫn giữa các nguồn.
7. Tổng hợp thành research brief.
8. Chuyển kết quả cho Script Agent.

Lưu URL, tên nguồn và thời gian truy cập. Với nội dung thời sự, pháp luật, y tế, tài chính hoặc khoa học, ưu tiên xác minh dữ kiện trước khi sản xuất. Không tự tạo số liệu, nghiên cứu, phát ngôn hoặc nguồn trích dẫn không tồn tại.

### 5.2. Script Writing Agent

Sinh kịch bản theo cấu trúc:

**Hook → Context → Main Content → Key Insight → CTA**

Tối ưu cho từng loại video:

- 15–30 giây.
- 30–60 giây.
- 60–180 giây.
- Video dài 5–15 phút.
- Định dạng tùy chỉnh.

Hỗ trợ nhiều phong cách: kể chuyện, giáo dục, giải thích khoa học, phóng sự ngắn, top list, hỏi đáp, hướng dẫn, bình luận/phân tích, storytelling documentary.

Đầu ra bắt buộc là dữ liệu có cấu trúc, được kiểm tra bằng schema.

Mỗi kịch bản gồm:

- `script_id`
- `title`
- `topic`
- `target_audience`
- `language`
- `target_duration`
- `tone`
- `hook`
- `full_narration`
- `scenes`
- `closing_cta`
- `source_references`
- `compliance_flags`
- `estimated_cost`

Mỗi scene gồm:

- `scene_id`
- `scene_order`
- `duration_seconds`
- `narration_text`
- `visual_description`
- `image_generation_prompt`
- `video_generation_prompt`
- `camera_motion`
- `transition`
- `on_screen_text`
- `subtitle_segments`
- `background_music_hint`
- `visual_asset_source`

Tổng thời lượng các phân cảnh phải nhất quán với thời lượng mục tiêu.

### 5.3. Script Editor

Xây dựng giao diện chỉnh sửa kịch bản:

- Chỉnh sửa từng scene.
- Viết lại từng đoạn bằng AI.
- Thay đổi độ dài.
- Đổi giọng văn.
- Sinh nhiều phương án hook.
- Khóa scene không muốn chỉnh sửa.
- Phê duyệt kịch bản.
- Xem lịch sử phiên bản.
- Khôi phục phiên bản trước.

## 6. Phân hệ AI Video Production

Đây là phân hệ trọng tâm.

### 6.1. Production Pipeline

**Script → Storyboard → Visual Assets → Voiceover → Timeline → Subtitles → Effects → Rendering → QA → Final Video**

Mỗi bước có trạng thái và kết quả riêng. Hỗ trợ chạy lại một bước thất bại mà không phải tạo lại toàn bộ video.

### 6.2. AI Visual Generation

Hỗ trợ ba phương pháp:

**A. AI Images + Motion**

- AI tạo ảnh tương ứng các scene.
- Sử dụng zoom, pan, parallax, animation và chuyển cảnh.
- Dựng thành video với FFmpeg.
- Ưu tiên làm MVP vì dễ kiểm soát chi phí.

**B. Text/Image-to-Video**

- Gửi prompt tới nhà cung cấp video AI có API phù hợp.
- Nhận video clip.
- Ghép theo storyboard.
- Kiểm soát thời lượng, kích thước và chất lượng clip.

**C. Hybrid Production**

Kết hợp ảnh AI, video AI, footage có giấy phép, infographic, text animation, charts và motion graphics.

Cho phép lựa chọn chất lượng **Economy / Balanced / Premium**. Không gắn cứng phần mềm với một dịch vụ AI. Xây dựng các adapter riêng cho từng provider; chỉ tích hợp những API thực sự được nhà cung cấp hỗ trợ.

### 6.3. Voiceover & Audio

Tính năng:

- Text-to-Speech tiếng Việt và tiếng Anh.
- Lựa chọn giọng nam/nữ.
- Điều chỉnh tốc độ nói.
- Điều chỉnh phong cách.
- Tự động ngắt câu.
- Tạo audio từng scene.
- Căn chỉnh audio với timeline.
- Điều chỉnh nhạc nền.
- Audio ducking khi có lời thoại.
- Chuẩn hóa âm lượng.
- Kiểm tra clipping.

Ưu tiên sử dụng voiceover có quyền sử dụng hợp lệ. Không tự mô phỏng giọng nói của người thật nếu không có sự cho phép cần thiết.

### 6.4. Subtitle Engine

Tự động:

- Tạo phụ đề từ kịch bản và audio.
- Đồng bộ timestamp.
- Xuất SRT/VTT.
- Burn phụ đề vào video.
- Hỗ trợ chữ chạy theo từng từ.
- Highlight từ khóa.
- Tùy chỉnh font, màu, kích thước, vị trí.
- Tự động xuống dòng.
- Kiểm tra tràn chữ.
- Tôn trọng vùng an toàn của giao diện TikTok/Shorts.

Đặc biệt phải xử lý tốt dấu tiếng Việt và font Unicode.

### 6.5. Video Rendering

Sử dụng FFmpeg để dựng video hoàn chỉnh. Hỗ trợ:

- 1080 × 1920, tỷ lệ 9:16.
- 1920 × 1080, tỷ lệ 16:9.
- 1080 × 1080, tỷ lệ 1:1.
- MP4, H.264, AAC.
- 24/25/30 FPS theo preset.
- Chuyển cảnh.
- Text overlay.
- Intro/outro tùy chỉnh.
- Phụ đề.
- Nhạc nền.
- Video preview.
- Xuất nhiều phiên bản.

Kiểm tra bằng FFprobe sau render. Không coi công việc thành công nếu file không tồn tại, không phát được hoặc thiếu track âm thanh bắt buộc.

## 7. Brand Kit & Video Templates

Cho phép thiết kế template phù hợp từng kênh.

Cấu hình:

- Bảng màu.
- Font chữ.
- Phong cách subtitle.
- Intro và outro.
- Logo tùy chọn.
- Animation.
- Hiệu ứng.
- Nhạc nền.
- Thumbnail style.
- Cách trình bày tiêu đề.
- Phong cách infographic.

Tạo sẵn template:

1. Modern Technology.
2. Educational Explainer.
3. Documentary.
4. News Brief.
5. Cinematic Storytelling.
6. Minimal Knowledge.
7. Dynamic Short Video.

Các template phải hỗ trợ chỉnh sửa và lưu phiên bản. Cho phép áp dụng cấu hình riêng cho từng nền tảng, bao gồm loại bỏ watermark/logo quảng bá không được TikTok cho phép khi chia sẻ qua API.

## 8. Smart Content Calendar

Xây dựng lịch nội dung dạng **Month View, Week View, Day View, List View và Kanban View**.

Người dùng có thể:

- Tạo lịch một lần.
- Lặp mỗi ngày.
- Lặp theo ngày trong tuần.
- Lặp theo cron expression hợp lệ.
- Giới hạn số lượng video.
- Đặt thời gian bắt đầu và kết thúc chiến dịch.
- Tạm dừng lịch.
- Chạy ngay.
- Dời lịch.
- Phê duyệt lịch hàng loạt.

Phân biệt:

- Giờ bắt đầu nghiên cứu.
- Giờ bắt đầu sản xuất.
- Deadline hoàn tất video.
- Giờ dự kiến đăng.
- Giờ đăng thực tế.

Tự động tính thời gian chuẩn bị trước khi đăng. Khi render thất bại hoặc đến giờ nhưng video chưa đạt yêu cầu, không tự đăng video lỗi.

Scheduler phải:

- Hoạt động ổn định sau khi restart.
- Lưu lịch trong database.
- Không chạy trùng.
- Hỗ trợ timezone.
- Có distributed lock.
- Có idempotency.
- Có retry/backoff.
- Có dead-letter queue.
- Phục hồi công việc sau lỗi.

## 9. YouTube Integration

Tích hợp chính thức qua YouTube Data API và OAuth 2.0.

### Chức năng

- Kết nối nhiều kênh YouTube được người dùng cấp quyền.
- Hiển thị thông tin kênh.
- Quản lý token.
- Tải video lên bằng resumable upload.
- Thiết lập tiêu đề, mô tả, tags.
- Thiết lập thumbnail khi API hỗ trợ.
- Thiết lập trạng thái riêng tư/công khai.
- Hẹn giờ công khai video.
- Kiểm tra trạng thái xử lý.
- Đồng bộ video ID, URL.
- Kiểm tra lỗi đăng.
- Thu thập số liệu qua API được cấp quyền.

### Scheduled Publishing

Sử dụng:

- `videos.insert`
- `status.privacyStatus = private`
- `status.publishAt` theo ISO 8601

Chỉ dùng `publishAt` theo các điều kiện hiện hành của YouTube, đặc biệt video phải chưa từng được công khai.

Phân biệt trạng thái đã tải lên, đang xử lý, đã hẹn lịch và đã công khai. Không giả định API upload thành công đồng nghĩa video đã được xuất bản.

Hỗ trợ trường disclosure phù hợp, bao gồm `status.containsSyntheticMedia` đối với nội dung tổng hợp/chỉnh sửa thuộc diện yêu cầu khai báo.

Kiểm tra hạn mức API hiện hành và xử lý quota exceeded.

## 10. TikTok Integration

Tích hợp TikTok Content Posting API chính thức. Đây là module phải tuân thủ đúng chính sách nền tảng.

### 10.1. Kết nối

- OAuth.
- Kiểm tra scope.
- `video.publish` cho Direct Post khi được phê duyệt.
- `video.upload` cho luồng chuyển video sang TikTok để người dùng hoàn tất.
- Token refresh.
- Token revocation.
- Quản lý tài khoản và phạm vi quyền.

### 10.2. Direct Post

Quy trình:

1. Người dùng xem video preview.
2. Hệ thống gọi creator_info API để lấy thông tin mới nhất.
3. Hiển thị tài khoản đích.
4. Người dùng chỉnh sửa caption, hashtag và tùy chọn bài đăng.
5. Người dùng tự chọn mức riêng tư trong các lựa chọn được TikTok trả về, không mặc định chọn hộ.
6. Hiển thị quyền comment, duet và stitch phù hợp.
7. Hiển thị disclosure quảng cáo, thương mại và AI.
8. Lấy sự đồng ý rõ ràng của người dùng cho nội dung cần đăng.
9. Tạo publishing request.
10. Gửi video theo phương thức API phù hợp.
11. Theo dõi kết quả qua status API hoặc webhook.

Với video AI, thiết lập trường `is_aigc` khi thích hợp.

### 10.3. TikTok Scheduling

Thiết kế lịch nội bộ. Cho phép người dùng chuẩn bị và phê duyệt nội dung cụ thể trước giờ gửi, nếu luồng thực tế đáp ứng các yêu cầu của TikTok.

Không giả định TikTok có endpoint hẹn giờ công khai tương đương YouTube. Không tự động gửi video chưa có sự đồng ý rõ ràng.

### 10.4. Fallback

Nếu ứng dụng chưa được TikTok phê duyệt hoặc không đáp ứng điều kiện Direct Post:

- Hỗ trợ xuất MP4.
- Hỗ trợ chuẩn bị caption/hashtags.
- Hỗ trợ luồng Upload API khi đủ điều kiện.
- Hiển thị yêu cầu người dùng hoàn tất đăng bài trên TikTok.
- Gửi thông báo để người dùng thực hiện.
- Không hiển thị trạng thái đã đăng khi chưa có xác nhận thực tế.

Không sử dụng browser automation, cookie scraping, token không chính thức, CAPTCHA bypass hoặc cách lách hạn chế API.

Cần lưu ý TikTok có điều kiện về đối tượng sử dụng ứng dụng và có thể không phê duyệt tiện ích chỉ dùng để quản lý tài khoản nội bộ. Hệ thống phải hỗ trợ phương án hợp lệ nếu trường hợp sử dụng không đủ điều kiện.

## 11. Quality Assurance & Content Safety

Xây dựng AI Quality Checker.

**Script QA**

- Đúng chủ đề.
- Nội dung logic.
- Không lặp.
- Ngữ pháp chuẩn.
- Lời thoại phù hợp thời lượng.
- Không có dữ kiện bịa đặt.
- Kiểm tra nguồn.

**Visual QA**

- Đúng nội dung scene.
- Không có ảnh hỏng.
- Không có hình méo bất thường.
- Không có text lỗi.
- Không sử dụng tài sản thiếu quyền.

**Audio QA**

- Có âm thanh.
- Giọng đọc đầy đủ.
- Âm lượng phù hợp.
- Không bị cắt lời.
- Không có khoảng im lặng bất thường.

**Video QA**

- Đúng resolution.
- Đúng aspect ratio.
- Đúng duration tolerance.
- Không có black frame lỗi.
- Không lỗi encoding.
- Phụ đề hiển thị đầy đủ.

**Policy QA**

- Nội dung tổng hợp AI.
- Bản quyền hình ảnh/âm nhạc.
- Nội dung dễ gây hiểu nhầm.
- Thông tin nhạy cảm.
- Disclosure tài trợ.
- Quy định riêng của YouTube/TikTok.

Chấm điểm QA từ 0–100 theo rubric có thể cấu hình; ngưỡng mặc định đề xuất **85**. Không coi điểm QA của AI là bảo đảm nội dung đúng tuyệt đối. Những nội dung rủi ro cao phải được phê duyệt thủ công.

## 12. Publishing Queue & Workflow Engine

Các trạng thái công việc:

```text
DRAFT
SCHEDULED
RESEARCHING
RESEARCH_COMPLETED
SCRIPT_GENERATING
SCRIPT_READY
ASSET_GENERATING
AUDIO_GENERATING
RENDERING
RENDERED
QA_RUNNING
QA_FAILED
AWAITING_APPROVAL
APPROVED
READY_TO_PUBLISH
UPLOADING
PLATFORM_PROCESSING
PLATFORM_SCHEDULED
PUBLISHED
FAILED
CANCELLED
```

Mỗi trạng thái phải lưu:

- Timestamp.
- Job ID.
- Attempt count.
- Worker ID.
- Lỗi kỹ thuật.
- Chi phí.
- Kết quả.
- Bước tiếp theo.

Không được retry mù quáng việc đăng tải sau timeout. Phải kiểm tra remote ID, upload session và trạng thái trên nền tảng trước khi gửi lại để tránh đăng trùng. Mỗi nền tảng có publishing job và trạng thái độc lập.

## 13. Dashboard & UI/UX

Thiết kế SaaS dashboard chuyên nghiệp, phù hợp desktop, tablet và mobile.

Phong cách:

- Modern AI SaaS.
- Premium dashboard.
- Light/Dark Mode.
- Sidebar gọn gàng.
- Màu chủ đạo xanh đậm, cyan và violet.
- Card rõ ràng.
- Micro-interactions hợp lý.
- Loading/skeleton states.
- Responsive toàn diện.

### Các màn hình cần xây dựng

1. Dashboard tổng quan.
2. AI Topic Explorer.
3. Content Channels.
4. AI Script Studio.
5. Storyboard Editor.
6. Video Production Studio.
7. Voice & Audio Library.
8. Brand Kit & Templates.
9. Content Calendar.
10. Publishing Queue.
11. YouTube/TikTok Connections.
12. Asset Library.
13. Video Analytics.
14. AI Provider Settings.
15. Usage & Cost Dashboard.
16. Notifications.
17. System Logs.
18. User Settings.

### Dashboard tổng quan

Hiển thị:

- Video đã tạo hôm nay.
- Video đang sản xuất.
- Video chờ phê duyệt.
- Video đã xuất bản.
- Video lỗi.
- Lịch đăng sắp tới.
- Tổng chi phí AI.
- Tỷ lệ job thành công.
- Dung lượng storage.
- Số lượng kênh.
- Biểu đồ sản lượng.
- Xu hướng hiệu quả kênh.

Có nút thao tác nhanh: **Tạo video, Tạo kênh, Lên lịch, Tạo chiến dịch, Xem queue**.

## 14. AI Provider Management

Cho phép khai báo các nhà cung cấp:

- LLM cho nghiên cứu và viết kịch bản.
- AI image generation.
- AI video generation.
- Text-to-Speech.
- Speech-to-Text.
- Embeddings.
- Search/Retrieval.

Thiết lập cho từng provider:

- API key.
- Base URL.
- Model.
- Timeout.
- Concurrency.
- Rate limits.
- Cost configuration.
- Fallback model.
- Retry policy.

Tất cả chi tiết tích hợp phải căn cứ tài liệu API thực tế, không tự tạo endpoint. Hỗ trợ mô hình dự phòng khi provider không khả dụng.

### Cost Optimizer

Ước tính chi phí trước khi render. Ghi nhận:

- Chi phí LLM.
- Chi phí ảnh.
- Chi phí video AI.
- Chi phí TTS.
- Chi phí storage.
- Chi phí render.
- Chi phí mỗi video.
- Chi phí mỗi kênh.
- Tổng chi phí tháng.

Đặt ngân sách tối đa cho từng kênh. Khi vượt ngân sách, chuyển trạng thái chờ phê duyệt chi phí hoặc tạm dừng, không tự tiếp tục chi tiêu.

## 15. Analytics & Continuous Optimization

Thu thập những chỉ số mà API chính thức cho phép, như:

- Lượt xem.
- Lượt thích.
- Bình luận.
- Chia sẻ.
- Thông tin tương tác.
- Hiệu suất từng video.
- Hiệu suất từng chủ đề.
- Khung giờ đăng.
- Thời lượng video.

Không hiển thị chỉ số không được API thực tế cung cấp dưới dạng số liệu đã xác minh.

AI phân tích để đề xuất:

- Chủ đề có hiệu quả tốt.
- Cách cải thiện hook.
- Độ dài phù hợp.
- Kiểu thumbnail.
- Phong cách dựng.
- Khung giờ nên thử nghiệm.

Có thể tích hợp A/B testing khi API và phương thức phân phối cho phép. Không tạo lượt xem, lượt thích hoặc tương tác giả.

## 16. Database Design

Thiết kế schema PostgreSQL/Prisma với các entity tối thiểu:

- User
- Workspace
- WorkspaceMember
- ContentChannel
- SocialAccount
- SocialAccountCredential
- ContentTopic
- ContentIdea
- ResearchSource
- VideoProject
- Script
- ScriptVersion
- VideoScene
- GeneratedAsset
- VoiceProfile
- AudioAsset
- VideoTemplate
- BrandKit
- ProductionJob
- RenderJob
- ScheduleRule
- ScheduledOccurrence
- ApprovalRequest
- PublishingJob
- PublishedPost
- PlatformMetricSnapshot
- AIProvider
- AIModelConfig
- CostUsage
- Notification
- AuditLog

Yêu cầu:

- Foreign keys và indexes.
- Unique constraints.
- Soft delete khi phù hợp.
- Timestamps.
- Truy vết thay đổi.
- Tenant isolation.
- Idempotency keys.
- Không lưu token OAuth dạng plaintext.
- Không lưu API key trong client-side bundle.

Có migration và seed data.

## 17. API Design

Thiết kế REST API có OpenAPI documentation.

Các nhóm API:

```text
/api/auth
/api/workspaces
/api/channels
/api/topics
/api/ideas
/api/scripts
/api/storyboards
/api/assets
/api/videos
/api/render
/api/schedules
/api/approvals
/api/publishing
/api/integrations/youtube
/api/integrations/tiktok
/api/analytics
/api/providers
/api/costs
/api/notifications
/api/system
```

Bắt buộc thực hiện:

- Request validation.
- RBAC.
- Rate limiting.
- Error handling.
- Pagination.
- Filtering.
- Idempotency.
- API documentation.
- Audit logging.

## 18. Security & Reliability

Áp dụng:

- OAuth 2.0 với state và PKCE khi phù hợp.
- Mã hóa token lưu trữ.
- Secrets quản lý phía server.
- RBAC.
- CSRF protection.
- Input validation.
- Signed storage URLs.
- Kiểm soát quyền truy cập tài sản.
- SSRF protection đối với URL nhập vào.
- Webhook signature verification khi được hỗ trợ.
- Retry với exponential backoff.
- Rate-limit-aware workers.
- Queue monitoring.
- Health checks.
- Log rotation.
- Database backup.
- Storage lifecycle management.
- Graceful shutdown.
- Error notification.

Không hardcode credentials. Không tự đăng nội dung khi user đã thu hồi quyền hoặc tài khoản bị ngắt kết nối.

## 19. Docker Deployment

Tạo Docker Compose production gồm:

- `web`
- `worker`
- `postgres`
- `redis`
- `minio` hoặc S3 external
- `reverse proxy` (nếu cần)

Yêu cầu:

- Multi-stage Dockerfile.
- FFmpeg/FFprobe sẵn có trong worker.
- Health checks.
- Persistent volumes.
- Environment configuration.
- Restart policies.
- Migration script.
- Backup/restore instructions.
- Log rotation.
- Giới hạn CPU/RAM cho render workers.
- Hướng dẫn triển khai Ubuntu VPS.

Tạo file `.env.example` đầy đủ nhưng không chứa secret thật.

## 20. Kế hoạch triển khai

Triển khai theo các giai đoạn sau.

### Phase 1 – Core Platform

- Khởi tạo source code.
- Authentication.
- Database.
- Dashboard.
- Content Channels.
- AI Provider Settings.
- Content Topic Generator.
- Script Generator.
- Script Editor.
- Scheduler cơ bản.

**Tiêu chí hoàn thành:** Tạo kênh, thiết lập lịch và sinh được kịch bản thật qua AI API.

### Phase 2 – Video Production MVP

- Storyboard.
- AI image generation.
- TTS.
- Audio synchronization.
- Subtitle generation.
- FFmpeg renderer.
- Templates.
- Video preview.
- Asset management.
- QA cơ bản.

**Tiêu chí hoàn thành:** Người dùng nhập một chủ đề và xuất được một video MP4 9:16 có hình ảnh, lời thoại và phụ đề, không cần xử lý thủ công.

### Phase 3 – Scheduling & Publishing

- Publishing Queue.
- YouTube OAuth.
- YouTube Upload.
- YouTube Scheduled Publishing.
- TikTok OAuth.
- TikTok API integration.
- Consent/Approval workflow.
- Fallback export/manual posting.
- Notifications.
- Retry/recovery.

**Tiêu chí hoàn thành:** Hệ thống chạy được quy trình sản xuất theo lịch, đăng được lên YouTube đã cấp quyền, và hỗ trợ các luồng TikTok phù hợp với trạng thái phê duyệt API thực tế.

### Phase 4 – Advanced AI Automation

- Multi-agent orchestration.
- Research + fact-check.
- Text/Image-to-Video providers.
- Multi-channel.
- Campaign automation.
- Cost optimizer.
- Advanced QA.
- Analytics.
- AI performance recommendations.
- Production hardening.

**Tiêu chí hoàn thành:** Hệ thống có thể vận hành nhiều kênh, tự động hóa các tác vụ được cấp phép, khôi phục khi lỗi và theo dõi hiệu quả theo từng chiến dịch.

## 21. Testing & Acceptance Criteria

Bắt buộc có:

- Unit tests.
- Integration tests.
- Worker tests.
- Scheduler tests.
- Database tests.
- API tests.
- Render smoke tests.
- End-to-end tests.
- OAuth callback tests.
- Queue recovery tests.
- Publishing failure tests.

Các tình huống cần kiểm thử:

1. Sinh video thành công từ một câu chủ đề.
2. Không có dữ liệu nguồn đáng tin cậy.
3. AI trả JSON sai schema.
4. Provider AI timeout.
5. TTS thất bại ở một scene.
6. Render lỗi giữa chừng.
7. Restart worker khi render đang chạy.
8. Schedule trùng thời điểm.
9. Token mạng xã hội hết hạn.
10. API mạng xã hội trả 429.
11. Upload bị ngắt mạng.
12. Video được tải lên nhưng chưa công khai.
13. TikTok chưa được cấp quyền Direct Post.
14. Người dùng từ chối phê duyệt.
15. Ngân sách không đủ.
16. Video vi phạm yêu cầu QA.
17. Hai worker xử lý cùng một job.
18. Hệ thống nhận webhook lặp.
19. Xóa video khỏi queue.
20. Khôi phục hệ thống sau restart Docker.

Sử dụng mock API cho kiểm thử; chỉ coi là đã kiểm chứng đăng thật sau khi thực hiện thành công trên tài khoản được cấp quyền. Không được giả lập kết quả xuất bản thành công trong môi trường production.

## 22. Yêu cầu đối với AI Coding Agent

Hãy triển khai dự án với các nguyên tắc:

1. Kiểm tra repository và môi trường hiện tại trước khi thay đổi.
2. Xây dựng kiến trúc và implementation plan.
3. Chia thành milestone nhỏ, rõ ràng.
4. Triển khai code thực tế theo thứ tự phụ thuộc.
5. Không chỉ tạo mockup hoặc trang giao diện tĩnh.
6. Không sử dụng mock data làm kết quả sản xuất thật.
7. Không hardcode kết quả AI.
8. Không bỏ qua error handling.
9. Không tạo kết nối API giả.
10. Không bỏ qua tests.
11. Không đánh dấu hoàn thành khi chưa kiểm thử.
12. Mỗi module phải có cấu hình và tài liệu sử dụng.
13. Cập nhật checklist tiến độ sau từng milestone.
14. Ưu tiên hoàn thành end-to-end MVP trước khi mở rộng.
15. Nếu thiếu API key hoặc chưa được cấp quyền nền tảng, vẫn triển khai adapter, mock tests và hướng dẫn cấu hình, nhưng phải phân biệt rõ chưa được kiểm chứng thực tế.
16. Không tự ý giảm phạm vi tính năng mà không ghi rõ.
17. Không thay thế API không được phê duyệt bằng browser automation hoặc giải pháp lách chính sách.
18. Khi phát hiện lỗi, phân tích root cause và sửa, không chỉ bỏ qua bài kiểm thử.

### Deliverables

Tạo đầy đủ:

- `README.md`
- `ARCHITECTURE.md`
- `PRODUCT_REQUIREMENTS.md`
- `IMPLEMENTATION_PLAN.md`
- `DATABASE_SCHEMA.md`
- `API_SPECIFICATION.md`
- `AI_PIPELINE.md`
- `VIDEO_RENDERING.md`
- `SOCIAL_PUBLISHING.md`
- `SECURITY.md`
- `DEPLOYMENT.md`
- `TEST_PLAN.md`
- `.env.example`
- `docker-compose.yml`
- Source code hoàn chỉnh.
- Database migrations.
- Tests.
- Seed data mẫu.

### Yêu cầu khởi động

**Bắt đầu bằng việc xây dựng kiến trúc hệ thống, database schema và implementation plan chi tiết. Sau đó triển khai ngay Phase 1 và Phase 2 để tạo ra MVP có khả năng sinh video thực tế.**

Tập trung vào luồng quan trọng nhất:

**Người dùng nhập chủ đề → AI viết kịch bản → AI tạo hình ảnh → AI đọc lời thoại → Dựng video → Tạo phụ đề → Xuất MP4 → Lên lịch → Đăng tải qua API chính thức khi đáp ứng điều kiện.**

Tiếp tục triển khai tuần tự các milestone, thực hiện kiểm thử và cập nhật tiến độ dựa trên kết quả thực tế.

---

## Phụ lục A. Ví dụ cấu hình vận hành

| Cấu hình | Giá trị |
|---|---|
| Chủ đề | Khoa học và công nghệ |
| Tần suất | 2 video/ngày |
| Thời lượng | 45–60 giây |
| Chất lượng | 1080p, 9:16 |
| Giờ sản xuất | 07:00, 14:00 |
| Giờ dự kiến đăng | 11:30, 19:30 |
| Nền tảng | YouTube Shorts, TikTok |
| Phương pháp dựng MVP | AI Images + Motion + TTS + FFmpeg |

**Ví dụ lịch vận hành** (thời điểm minh họa, không phải cam kết thời gian xử lý):

1. 07:00 – AI nghiên cứu và viết kịch bản.
2. 07:10 – Sinh tài sản, giọng đọc, phụ đề và dựng video.
3. 07:30 – Kiểm tra chất lượng, chuẩn bị phê duyệt/xuất bản.
4. 11:30 – Công khai video YouTube đã hẹn lịch; xử lý đăng TikTok theo luồng được phép.
5. 14:00 – Bắt đầu video thứ hai.
6. 19:30 – Xuất bản video thứ hai theo cấu hình.

## Phụ lục B. Tài liệu API chính thức

- YouTube Data API – Videos: https://developers.google.com/youtube/data/reference/rest/v3/videos
- TikTok Content Posting API: https://developers.tiktok.com/docs/en/content-posting-api-get-started
- TikTok Content Sharing Guidelines: https://developers.tiktok.com/docs/en/content-sharing-guidelines

> **Lưu ý:** Chính sách, scope và điều kiện phê duyệt của nền tảng có thể thay đổi. Trước khi triển khai, cần kiểm tra tài liệu và quyền API thực tế; không hứa hẹn tự đăng TikTok khi ứng dụng chưa đủ điều kiện.
