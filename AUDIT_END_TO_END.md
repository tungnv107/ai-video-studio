# Rà soát luồng đầu cuối — 16/11/2026

Phạm vi: ứng dụng trong repository này và bản Docker tại `studio.tungnv.com`. Mã triển khai: `6333426`. Kiểm thử dữ liệu giả lập chạy trên PostgreSQL/Redis local; kiểm thử video thật chạy trên server bằng tài sản và provider đã được người dùng cho phép.

## Những lỗi đã xử lý

1. **Ảnh bị HTTP 400 trên 9router:** tên model trần `gpt-image-2.5-flare` được relay định tuyến sang OpenAI API, nhưng relay chỉ có kết nối Codex. Cấu hình thật đã chuyển sang `cx/gpt-image-2.5-flare`.
2. **Thiếu OpenAI API cho giọng đọc:** chuyển sang `edge-tts/vi-VN-HoaiMyNeural` theo lựa chọn của người dùng. Tên giọng trong model quyết định giọng Edge; thông tin asset lưu đúng giọng đã dùng.
3. **Thông báo provider quá chung:** lỗi nay chỉ rõ bước, model, HTTP status và hướng xử lý khi relay thiếu kết nối hoặc sai model. Nội dung lỗi upstream chỉ được đọc tối đa 4 KB để phân loại, không trả nguyên văn prompt/key/URL nội bộ cho giao diện.
4. **Phát sinh kịch bản rồi mới phát hiện thiếu cấu hình dựng:** kiểm tra provider và logo/nhạc/footage cần thiết trước phần sản xuất. Tài sản đã lưu được bỏ qua khi kiểm tra khả năng AI không còn cần dùng.
5. **Xin xác nhận phí dù đã có checkpoint:** kịch bản, ảnh/audio đã lưu và khoản của revision cũ không chặn việc tiếp tục. Các khoản UNKNOWN vẫn được giữ để đối soát; chỉ bước thiếu kết quả mới yêu cầu xác nhận gọi lại.
6. **Thời lượng audio vượt kế hoạch:** thêm lựa chọn “Khớp thời lượng cảnh”, tăng tốc audio tại FFmpeg tối đa 1,5× và căn lại cả phụ đề ước lượng/word timestamps. Không cắt lời, không sửa file TTS gốc và không gọi TTS thêm. Chế độ nhịp tự nhiên vẫn là mặc định; thẻ mở/kết được cộng thêm vào thời lượng.

Form provider và trang hướng dẫn có ví dụ cấu hình Codex + Edge TTS. Nút điền model không giữ Base URL OpenAI chính thức khi chọn bộ model dành cho relay, tránh tạo một cấu hình sai tuyến khác.

## Kết quả kiểm thử

| Kiểm tra | Kết quả | Bằng chứng local |
|---|---|---|
| TypeScript | Đạt | `npm run typecheck` |
| Unit | 82/82 | `artifacts/audit-unit.log` |
| Integration, DB/Redis/RLS/FFmpeg thật | 78/78, 9 file | `artifacts/audit-integration-final.log` |
| Chrome desktop/mobile | 15/15 | `artifacts/audit-e2e-final.log` |
| Kiểm lại UI timing và xác nhận phí sau sửa cuối | 4/4 | `artifacts/audit-e2e-timing.log` |
| Render thương hiệu/phụ đề | 9:16, 16:9, 1:1; 24/25/30 fps; QA 100 | `artifacts/render-advanced/verification.json` |
| Pan/parallax/BARS/STEPS/STAT | 3 tỷ lệ; QA 100; khung hình chuyển động khác nhau thực tế | `artifacts/render-motion/verification.json` |
| Căn audio vượt thời lượng | MP4 đúng 5 giây từ hai đoạn audio dài hơn cảnh; audio gốc giữ nguyên | `tests/integration/speech-render.test.ts` |
| API load local | 80/80 HTTP 200, đồng thời 8; p95 784 ms | `artifacts/load-smoke.json` |
| Backup/restore local | Khôi phục vào DB tạm; so sánh 43 bảng, 6 migrations, 40 RLS policies; dọn DB tạm | `artifacts/backup-restore-smoke.json` |
| Workspace lifecycle | Dry-run/restore/purge đạt; dữ liệu workspace bên cạnh giữ nguyên | `artifacts/lifecycle-smoke.json` |
| Dependency audit | 0 advisory tại thời điểm chạy | `artifacts/audit-dependencies.json` |
| Production build | Local Webpack đạt; Docker Linux ARM64 build đạt | `artifacts/audit-build.log`, Docker build trên server |

Không chạy worker local cùng integration tests: worker có thể lấy fixture jobs từ cùng database. Lỗi giới hạn provider ở lần chạy nền ban đầu hết sau khi tạm dừng worker và chạy lại bộ test. Backup cũng được kiểm lại khi fixture tests đã kết thúc để so sánh cùng trạng thái DB. Worker local được khôi phục sau kiểm thử.

## Ma trận luồng nghiệp vụ

| Luồng | Đã kiểm chứng | Ranh giới kiểm chứng |
|---|---|---|
| Đăng ký, đăng nhập, logout, CSRF | Chrome/API và session DB; origin không hợp lệ bị chặn | SMTP phục hồi dùng SMTP local trong test |
| MFA, mã khôi phục, reset mật khẩu | TOTP/replay/expiry/revoke session, UI login hai bước | Không gửi email thật cho người khác |
| Workspace và cộng tác | Mời/tham gia/chuyển workspace; quyền OWNER/EDITOR/REVIEWER/VIEWER; last owner; RLS | Dữ liệu fixture riêng, được dọn sau test |
| Kênh, ngân sách, cấu hình provider | CRUD, mã hóa key, allowlist HTTPS, ưu tiên/concurrency/RPM, budget atomic | Khả năng model remote xác nhận bằng lượt video thật được cho phép |
| Ý tưởng, nghiên cứu và nguồn | Schema, trích dẫn, nguồn giả, SSRF, trùng nội dung, dữ liệu ý tưởng | Brave/embeddings/LLM nghiên cứu dùng mock, chưa gọi live trong đợt này |
| Kịch bản và storyboard | Schema/thời lượng, chỉnh scene/hook/resize, khóa scene, version conflict/restore | Tái sử dụng kịch bản thật đã lưu; không phát sinh LLM mới |
| Tạo ảnh và giọng | Codex qua relay và Edge TTS Việt trả dữ liệu thật, được lưu theo scene/revision | Đúng 3 ảnh + 3 đoạn đọc được cho phép |
| Dựng và QA | FFmpeg H.264/AAC; motion/graphics; intro/outro/logo/ducking; phụ đề; kiểm đen/im lặng/clipping | QA kỹ thuật không xác nhận tính đúng đắn nội dung hay quyền tác giả |
| Retry, cancel, worker recovery | Claim/lease, chạy trùng, crash/reconcile, giữ assets, giữ chi phí UNKNOWN, không lặp LLM | Lần dựng lại thật chặn mọi request AI mới |
| Media, template và phiên bản | Upload/quyền sử dụng, phạm vi workspace, saved template/brand, variants | Clip Runway và forced alignment ElevenLabs dùng HTTP fixture |
| Lịch và chiến dịch | Mốc nghiên cứu/sản xuất/đăng dự kiến, timezone, chống tick trùng, budget/max runs | Không tự bật lịch đăng bài thật |
| Duyệt và xuất bản | QA gate, phiên bản, consent, OAuth state/refresh, resume upload, polling/webhook replay | YouTube/TikTok OAuth/post/upload dùng mock; chưa đăng bài thật |
| Analytics, A/B, retention | Sync mẫu API, lịch sử metrics, quota và retention scope | Chưa nghiệm thu analytics từ tài khoản social thật |
| Vận hành | Health, build/deploy, DB restore và lifecycle fixture, API load có giới hạn | Không phải chứng nhận tải lớn, nhiều host hoặc video 15 phút |

## Video thật và kiểm tra domain

Ba ảnh và ba đoạn đọc đã được tạo qua provider thật, tất cả trả HTTP 200. Lượt kiểm thử có bộ đếm cứng: tối đa 3 request ảnh và 3 request TTS. Không tạo lại kịch bản. Bản nhịp đọc tự nhiên dài 34,9 giây, QA kỹ thuật 100/100; audio nguồn lần lượt 10,512 / 10,944 / 12,960 giây.

Bản cuối dài **30,000 giây**, 1080×1920, H.264/AAC, QA kỹ thuật **100/100**, trạng thái **AWAITING_APPROVAL**. Ba audio gốc được giữ nguyên; hệ số tempo lần lượt 1,067 / 1,111 / 1,316. Dựng lại từ 6 assets đã lưu thực hiện **0 request AI**.

Chrome đã phát MP4 trên domain thật, kiểm tra duration=30, kích thước 1080×1920, không có lỗi page/video; tải MP4 4.885.239 bytes và SRT thành công (HTTP 200); HTTP Range trả 206; chưa đăng nhập trả 401. Mobile 390×844 không tràn ngang. Phiên kiểm thử tạm đã bị thu hồi. Báo cáo: `artifacts/audit-production-browser.json`; video: `artifacts/production-video-30s.mp4`; ảnh giao diện: `artifacts/audit-production-playback.png`, `artifacts/audit-production-mobile.png`.

SHA-256 MP4 tải qua HTTPS: `5c715e09daebac35e71fa6cd66b4854e8add5d22e633b84fcf551d9682a72851`. Web/worker/PostgreSQL/Redis đều healthy và `/api/system/health` trả `ok: true` sau dựng. Image Docker có thể rollback: `ai-video-studio:before-audit-6333426`.

Bằng chứng server nằm dưới `/app/data/diagnostics/audit-video-20261116/`, quyền hạn chế; không đưa key, token hoặc dữ liệu người dùng vào repository.

Đơn giá trong app là ước tính ngân sách do người dùng cấu hình, không phải hóa đơn. Các khoản UNKNOWN lịch sử vẫn được giữ. Gói ChatGPT Plus và API tại `api.openai.com` có cơ chế thanh toán riêng theo [OpenAI Help Center](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus). Việc dùng relay đã kết nối Codex có thể tiêu thụ hạn mức tài khoản; không suy ra rằng API là miễn phí.

## Chưa nghiệm thu bằng tài khoản bên ngoài

- Đăng bài thật lên YouTube/TikTok, callback OAuth live, webhook/analytics live cần tài khoản và ứng dụng đã cấp quyền; đợt rà soát không thực hiện đăng bài.
- Runway, ElevenLabs forced alignment, Brave, embeddings và AI review dùng mock; không được đánh dấu live từ kết quả test này.
- SMTP public, private S3 trên môi trường production, video dài và tải lớn cần lượt nghiệm thu riêng ở môi trường tương ứng.
- Nội dung video hiện vẫn chờ người dùng xem và duyệt. Cờ `UNVERIFIED_FACTS` và `HUMAN_FACT_REVIEW` được giữ nguyên.
