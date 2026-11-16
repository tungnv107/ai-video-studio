# Official social publishing

Mặc định PUBLISHING_ENABLED=false. Không có credential OAuth thật trong môi trường kiểm thử. Adapter/mocks không chứng minh đã upload hoặc công khai trên tài khoản thật.

## OAuth

Cấu hình Google/TikTok developer app tại **Kết nối nền tảng → Cấu hình ứng dụng** của từng workspace. Chỉ OWNER được đọc/sửa cấu hình và liên kết/ngắt tài khoản. Client ID/Key và secret được lưu riêng theo workspace/nền tảng; secret dùng AES-256-GCM, API chỉ trả `hasSecret`. Không còn fallback sang bốn biến OAuth toàn cục trong `.env`.

Redirect URI phải khớp APP_URL + /api/integrations/youtube/callback hoặc /api/integrations/tiktok/callback. UI hiển thị URL chính xác để sao chép. Web production dùng HTTPS. Cấu hình đổi bằng `expectedVersion`; để trống secret chỉ giữ nguyên khi Client ID/Key không đổi. Đổi/xóa cấu hình tăng version, hủy state đang chờ, xóa token cục bộ và hủy yêu cầu đăng đang chờ trong đúng studio/nền tảng; nếu có UPLOADING thì từ chối thay đổi. Không xóa bài đã đăng trên nền tảng.

OAuth state và SocialAccount ghi version ứng dụng; callback kiểm tra cả trước và sau network exchange, refresh dùng credentials đúng studio/version. Token legacy chưa có version chỉ dùng đến khi hết hạn hoặc bị chủ sở hữu thay cấu hình; refresh yêu cầu cấu hình mới và kết nối lại. Lưu cấu hình không tự bật các công tắc xuất bản toàn máy chủ.

State ngẫu nhiên, lưu DB 10 phút, gắn user + workspace + platform; consume atomic chống replay. Google dùng PKCE S256. Token mã hóa AES-GCM, refresh trước expiry, refresh token mới thay token cũ. Ngắt kết nối có hiệu lực cục bộ trước khi gọi remote revoke; queued consent bị hủy. Reconnect yêu cầu OAuth lại.

## Consent và hàng đợi

Video phải đúng revision đã APPROVED/QA. UI có preview, account, title/caption, privacy, tương tác, AI/brand/children disclosures, quyền âm nhạc và consent. Canonical hash ràng buộc output + revision + account + metadata. Worker kiểm tra lại quyền reviewer, connection và hash. Không dùng OAuth thay cho consent. Hai nền tảng có PublishingJob riêng.

## YouTube

Official videos.insert resumable. Lưu session **mã hóa** trước khi gửi bytes; PUT empty Content-Range để hỏi offset/session completion trước khi gửi tiếp. Upload interrupted → RECONCILIATION_REQUIRED, không tạo upload mới tự động. Poll videos.list status/processingDetails; private/processing/scheduled khác PUBLISHED. PublishAt chỉ dùng video mới với privacy=private và ngày tương lai. Payload có containsSyntheticMedia và selfDeclaredMadeForKids.

Thumbnail và analytics có các luồng riêng mô tả bên dưới. Quota/rate-limit phải kiểm tra trên project Google thực tế; không hardcode một số quota cũ.

## TikTok

Direct Post chỉ bật khi operator xác nhận app/use case đáp ứng điều kiện. OAuth video.publish; creator_info trước UI và trước gửi, privacy không có lựa chọn mặc định, comment/duet/stitch mặc định tắt và khóa theo creator. is_aigc=true; brand toggles riêng. Kiểm tra duration và quyền. Không quảng bá logo/watermark trong renderer.

Upload flow dùng video.upload và inbox video init khi đủ scope; người dùng hoàn tất trong TikTok. Không giả định có native schedule endpoint. Lịch nội bộ chỉ trì hoãn gửi và revalidate consent. Trạng thái SEND_TO_USER_INBOX là AWAITING_USER_POST, không phải published. Chỉ coi PUBLISHED khi status có publicaly_available_post_id (tên field API giữ nguyên chính tả); PUBLISH_COMPLETE chưa có public ID dùng POSTED_NONPUBLIC.

FILE_UPLOAD hỗ trợ file đến 4 GB, chunk tuần tự tối đa 64 MB, checkpoint theo ACK. Mất kết nối ở init không có publish ID → cần kiểm tra remote thủ công. Không tự init lại. Sau khi có ID dùng status để đối soát. Webhook có kiểm chữ ký/timestamp/replay; trạng thái public vẫn phải đối soát qua API.

App chỉ phục vụ tài khoản nội bộ có thể không đủ điều kiện TikTok audit. Export MP4/SRT/VTT vẫn dùng được khi API chưa cho phép.

## Tài liệu đã tra cứu

- [YouTube videos.insert](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert)
- [Resumable protocol](https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol)
- [TikTok Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post)
- [Creator info](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info)
- [Post status](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status)
- [Sharing guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines)
- [OAuth token lifecycle](https://developers.tiktok.com/docs/en/oauth-user-access-token-management)

Tra cứu 15/11/2026; phải kiểm tra lại policies/quyền khi go-live.



## Thumbnail, upload recovery, webhook và analytics

YouTube thumbnail là task độc lập sau remote video ID; chỉ chạy nếu consent uploadThumbnail và đúng revision/account/quyền. Lỗi có thể retry từ hàng đợi mà không upload lại video.

TikTok FILE_UPLOAD chia chunk tuần tự; checkpoint offset sau ACK. Reconcile chỉ khi RECONCILIATION_REQUIRED: gọi status, nếu PROCESSING_UPLOAD thì uploaded_bytes phải là ranh giới chunk hợp lệ. Tiếp tục cùng session/publish_id; không blind init mới. FAILED remote giữ lỗi để người dùng kiểm tra.

POST /api/webhooks/tiktok/{appId} dùng URL riêng được hiển thị trong cấu hình TikTok của studio. Kiểm chữ ký HMAC bằng secret của đúng ứng dụng, raw body, timestamp 5 phút và client_key; hash chống replay được ràng buộc workspace/version. Worker chỉ xử lý tài khoản của workspace và version đó, bỏ qua event legacy không có phạm vi hoặc event từ phiên bản cũ. Endpoint cũ không có appId từ chối xác thực. Event chỉ kích hoạt đối soát; status API mới xác nhận trạng thái public. auth removed thu hồi token/job trong đúng studio.

Worker sync metrics mỗi giờ, dùng lease và unique hour snapshot. YouTube watch metrics cần yt-analytics.readonly; TikTok cần video.list. Null không biến thành zero. Đã liên kết trước đây phải OAuth lại để thêm scope. A/B giữ sample 24–48h ngay cả khi đã có hơn 48 snapshot mới.

Các tích hợp được kiểm chứng bằng mock API và database thật. Chưa upload thật hoặc gọi số liệu tài khoản thật.
