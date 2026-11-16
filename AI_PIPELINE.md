# AI pipeline và các adapter

## Luồng

Topic → research plan → retrieval → research brief → structured script → scene assets → TTS/alignment → render → QA → human approval. IDEAS dừng sau ý tưởng; SCRIPT dừng ở script; VIDEO thực hiện toàn bộ. Không có mock trong luồng production.

Worker claim bằng DB lease và UUID fencing token, heartbeat 20s. Stage/audit ghi attempt, worker và job. Asset checkpoint theo project/revision/scene/kind. Retry tái sử dụng checkpoint; timeout paid API giữ UNKNOWN và ngân sách, cần chấp nhận chi phí bổ sung. Asset không hợp lệ sau HTTP thành công vẫn có thể bị tính phí.

## Provider thật

| Loại | Adapter | Năng lực |
|---|---|---|
| OPENAI | chat/completions, images/generations, audio/speech, embeddings | LLM, ảnh, TTS, embedding, QA hình |
| OPENAI_COMPATIBLE | chat/completions | LLM structured output, embedding nếu endpoint có hỗ trợ |
| RUNWAY | /v1/text_to_video, /v1/image_to_video, /v1/tasks/:id | gen4.5 clip 2–10 giây; remote ID checkpoint |
| ELEVENLABS | /v1/forced-alignment | Timestamp từng từ cho audio và transcript |
| BRAVE | /res/v1/web/search | Kết quả tìm kiếm chính thức, snippet chưa xác minh |

Provider chọn theo capability, ưu tiên workspace hoặc providerId của kênh; Redis kiểm soát RPM/concurrency. Production LLM/image/TTS chuyển provider khi từ chối chắc chắn; timeout/response không hợp lệ không fallback mù. Runway giữ provider gắn với remote task; script-edit có retry cùng provider. Không đảm bảo mọi model của endpoint compatible thực thi JSON schema.

## Nghiên cứu và tránh lặp

Nguồn do người dùng nhập hoặc tải bài/RSS qua allowlist HTTPS, DNS pinning, timeout/size/MIME bounds; không chạy HTML/JS/XML entity. Nếu bật research mà không có nguồn/URL, tạo research plan và gọi Brave tối đa 3 query. Nguồn lưu URL/title/excerpt/accessedAt/provenance, verified=false. Brief có claims, verdict, exact quotes, policy flags, recommendations. Quote sai hoặc URL không có trong nguồn bị từ chối; SUPPORTED cần hai host. Nội dung nguồn là dữ liệu không phải chỉ dẫn.

Topic/title hash tránh lặp trong 7/30/60/90 ngày; optional embeddings so cosine cùng model/provider. Kịch bản mới bị chặn khi narration trùng; scene structure lặp nhiều và ảnh hash thang xám gần trùng là cảnh báo người duyệt. Embedding và ảnh hash không chứng minh bản quyền/độc lập nguồn.

## Biên tập và QA

AI biên tập SCENE/HOOKS/RESIZE lưu proposal; không auto-apply. Apply kiểm tra revision, role và scene locks, tạo version mới và hủy approval/output cũ. Hook giữ 3× scriptCostCents. Thời lượng script tối đa 900 giây, 120 scenes; số từ và audio thực tế vẫn có thể lệch nên renderer kiểm QA.

QA nội dung tùy chọn gửi script/sources và 3 khung hình sample cho LLM vision. Kết quả kèm rubric có thể cấu hình; false safeToReview chặn approval. Technical checks vẫn độc lập. Tất cả video cần người duyệt, nhất là y tế/tài chính/pháp luật.

## Chi phí

paidStep giữ ngân sách transaction + channel advisory lock trước gọi API. Monthly/campaign caps tính cả RESERVED/UNKNOWN/COMPLETED. Không xóa phí cũ khi cho phép gọi lại. Dự toán /videos/:id/estimate dùng số scene/assets còn thiếu/đơn giá cấu hình, cộng render và một tháng storage theo giả định bitrate; chưa phải invoice hoặc measured compute billing.

## Vòng đời API được kiểm tra 15/11/2026

Default cấu hình ảnh mới dùng gpt-image-2.5-flare; model gpt-image-1 đã shutdown 23/10/2026. Model đã lưu không bị thay ngầm. Các speech model cũ còn dùng được tại thời điểm kiểm tra nhưng dự kiến shutdown 06/01/2027; gpt-4.1-mini dự kiến 14/01/2027. Cần migration adapter khi đổi sang Realtime speech, không chỉ đổi tên model trong /audio/speech. Sora Videos API không được tích hợp vì đã shutdown.

Tài liệu chính thức: [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations), [Image API](https://developers.openai.com/api/reference/resources/images/methods/generate), [Speech API](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create), [Runway API](https://docs.dev.runwayml.com/api/), [Runway output URLs](https://docs.dev.runwayml.com/assets/outputs/), [ElevenLabs forced alignment](https://elevenlabs.io/docs/api-reference/forced-alignment/create), [Brave Search](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started).

HTTP payload/error/adapter tests dùng mocks, không chứng minh tài khoản đã có quyền model hoặc giá tính tiền thực.

Chi phí RENDER/STORAGE được ghi vào CostUsage theo đơn giá cấu hình (ước tính); render lỗi vẫn giữ chi phí hạ tầng đã thực hiện. Storage tính một tháng theo byte MP4/thumbnail/assets, chưa đối soát invoice. Đơn giá 0 nghĩa là chưa cấu hình giá hạ tầng.

## Hoàn thiện 16/11/2026

Ý tưởng trả schema có problem/audience/channelFit/feasibility/feasibilityReason; điểm 0–100 là đánh giá AI, không phải dữ liệu đo. Backend lọc URL theo nguồn đã nhận, lưu channelId và dự toán sản xuất từ đơn giá provider, thời lượng và phương pháp dựng. Thiếu provider cần thiết thì chi phí là null, không tự bịa giá.

ScheduleRule có anchor RESEARCH/PUBLISH, productionDelayMinutes và approvalBufferMinutes. nextRunAt luôn là giờ nghiên cứu UTC; với PUBLISH, cron được tính tại múi giờ của giờ đăng rồi trừ tổng thời gian chuẩn bị. Sau nghiên cứu, ProductionJob nhả lease về QUEUED với availableAt và queueVersion mới; dispatcher/claim đều bỏ qua trước giờ này. Không giữ một worker ngủ, không gọi lại phần nghiên cứu đã checkpoint; thời gian chờ không tăng attempts. Mốc thực tế lưu riêng trong VideoProject. Deadline bị lỡ tạo một thông báo dưới guard transaction, không đổi QA hoặc tự xuất bản.

Biên tập hỗ trợ đủ 120 scenes và 900 giây. graphic thiếu ở script cũ tương đương null khi so sánh scene khóa; schema gửi AI mới yêu cầu graphic rõ ràng. Đồ họa BARS/STAT do AI sinh cần URL thuộc nguồn cung cấp; vẫn cần người duyệt kiểm chứng số liệu. Scene đồ họa bỏ qua lời gọi IMAGE/VIDEO và dự toán không tính các assets này.
