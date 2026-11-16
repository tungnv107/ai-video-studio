# REST API

Base `/api`. JSON, session cookie HttpOnly. Mọi POST/PUT/PATCH/DELETE yêu cầu Origin trùng APP_URL, ngoại trừ webhook có chữ ký. Error: `{error:{code,message}}`. Zod validation trả 422; chưa đăng nhập 401; thiếu quyền/CSRF 403; conflict 409; rate limit 429. OpenAPI JSON tại `GET /api/system/openapi` sau đăng nhập.

| Endpoint | Method | Quyền / body |
|---|---|---|
| auth/register | POST | {email,password ≥12 chars,name}; tạo workspace OWNER |
| auth/login, auth/logout | POST | Session thật, Redis rate limit |
| auth/me | GET | User/workspace/role hiện hành |
| workspaces | GET | Memberships của user |
| workspaces/:id | POST | Đổi workspace nếu là thành viên |
| bootstrap | GET | Dashboard dữ liệu DB, tối đa 100 video/asset/cost và 50 job/log |
| channels | GET, POST | List; OWNER/EDITOR tạo, channelSchema |
| channels/:id | PATCH, DELETE | Sửa/soft delete, tắt lịch của kênh |
| providers | POST | OWNER; providerSchema, key encrypted |
| providers/:id | PATCH, DELETE | OWNER bật/tắt hoặc xóa provider |
| ideas | GET, POST | Danh sách ý tưởng; POST {channelId,topic} + Idempotency-Key tạo background job khám phá ý tưởng bằng AI, trả 202 |
| videos | GET | page (24/page), status filter |
| videos | POST | OWNER/EDITOR; Idempotency-Key bắt buộc; trả 202 |
| videos/:id | GET | Script, versions, scenes, costs, jobs, QA |
| videos/:id/render, retry | POST | Retry checkpoint; allowAdditionalCost=false mặc định |
| videos/:id/cancel | POST | Hủy công việc nội bộ; không giả định hủy remote upload |
| videos/:id/approve | POST | OWNER/REVIEWER; {reviewed:true,rightsConfirmed:true}; QA ≥85 |
| videos/:id/reject | POST | OWNER/REVIEWER, hủy nội dung đang chờ |
| videos/:id/download | GET | Stream MP4/Range hoặc S3 signed URL 5 phút; ?save=1 tải xuống |
| videos/:id/srt, vtt, thumbnail | GET | Tài sản đúng tenant |
| scripts/:projectId | GET, PUT | PUT {script,expectedRevision}; phiên bản mới vô hiệu approval/output cũ |
| scripts/:projectId/restore | POST | {version,expectedRevision} |
| storyboards/:projectId | PATCH | {sceneOrder,locked} |
| assets/:id | GET | Tài sản riêng tư |
| schedules | POST | channelId,name,topic,cron hoặc runAt,timezone,maxRuns,targetDuration,publishDelayMinutes |
| schedules/:id | PATCH | {enabled} |
| schedules/:id/run | POST | Đưa nextRunAt về hiện tại, vẫn tuân maxRuns |
| notifications/:id | PATCH | Đánh dấu đã đọc |
| integrations/:platform/connect | POST | OWNER, trả URL OAuth |
| integrations/:platform/app | GET | OWNER đọc cấu hình của workspace hiện tại; chỉ trả Client ID/Key, hasSecret, version, callback/webhook URL, không trả secret |
| integrations/:platform/app | PUT | OWNER lưu clientId, clientSecret tùy chọn, expectedVersion và confirmDisconnect; CSRF và optimistic concurrency |
| integrations/:platform/app | DELETE | OWNER xóa secret/cấu hình với expectedVersion và confirmDisconnect=true; ngắt tài khoản và hủy consent đang chờ trong workspace |
| integrations/:platform/callback | GET | Session + state single-use + code |
| integrations/tiktok/creator?accountId= | GET | Creator info mới nhất |
| integrations/:platform/disconnect?accountId= | POST | OWNER, thu hồi cục bộ trước, thử revoke remote |
| webhooks/tiktok/:appId | POST | Không cần session; kiểm chữ ký bằng secret đúng studio, ràng buộc workspace/version và chống replay |
| publishing | POST | OWNER/REVIEWER, consent + revision + account + metadata; feature flag |
| publishing/:id/cancel | POST | Chỉ khi chưa upload |
| publishing/:id/reconcile | POST | Chỉ nếu có session hoặc remote ID, không init lại mù quáng |
| system/health | GET | Public; chỉ {ok}; DB + Redis + storage |

Ví dụ tạo video:

```json
{
  "channelId":"ID của kênh trong workspace",
  "topic":"Vì sao AI có thể trả lời sai?",
  "targetDuration":45,
  "aspectRatio":"9:16",
  "quality":"BALANCED",
  "intent":"VIDEO",
  "sources":[{"url":"https://example.org/document","title":"Tài liệu do người dùng cung cấp","excerpt":"Dán trích đoạn thực tế đã đọc."}]
}
```

Không có public API key trong browser. Không gửi key trong query string. Costs/logs và dashboard đọc qua bootstrap; analytics/template/media có routes riêng bên dưới.


## Biên tập AI và thành viên

| Endpoint | Method | Nội dung |
|---|---|---|
| scripts/:id/edits | GET | Danh sách 20 đề xuất gần nhất đúng workspace |
| scripts/:id/edits | POST | OWNER/EDITOR, Idempotency-Key; {kind:SCENE/HOOKS/RESIZE,expectedRevision,instruction?,sceneOrder?,targetDuration?,allowAdditionalCost?}; trả 202 |
| scripts/:id/edits | PATCH | {jobId,proposal:0..2}; chỉ READY, revision còn khớp; tạo ScriptVersion |
| scripts/:id/edits | DELETE | {jobId}; bỏ đề xuất hoặc hủy công việc nền |
| members | GET | Danh sách thành viên; chỉ OWNER thấy danh sách lời mời; không trả token |
| members/:userId | PATCH, DELETE | OWNER; PATCH {role}; DELETE xóa member và session workspace; bảo vệ last owner |
| invitations | POST | OWNER; {email,role}; trả liên kết một lần, expiresAt 7 ngày |
| invitations/:id | DELETE | OWNER thu hồi lời mời chưa nhận |
| invitations/accept | POST | {token}; user đăng nhập đúng email, chưa hết hạn/thu hồi/đã dùng |

GET /join là trang nhận lời mời; token nằm trong fragment và được chuyển bằng body POST sau khi người dùng xác nhận. Nhận lời mời không tự cấp quyền trên workspace khác.

## Routes nâng cao

| Endpoint | Method | Payload / kết quả |
|---|---|---|
| auth/mfa | POST | challenge + code; tạo session sau factor |
| auth/reset-request | POST | email; response chung, gửi SMTP nếu cấu hình |
| auth/reset | POST | token + password + code nếu MFA |
| security | GET | enabled, recoveryRemaining, emailConfigured |
| security/setup, enable, disable | POST | password + code; enable trả recovery codes một lần |
| media | GET/POST | list hoặc multipart file/name/kind/license/rightsConfirmed |
| media/:id | GET/DELETE | đọc riêng tư hoặc soft-delete |
| production-settings/:channelId | GET/PUT | settings + expectedUpdatedAt |
| template-versions, brand-kits | GET/POST | name/slug/config; version mới bất biến |
| campaigns | GET/POST | channelId/name/topics/startsAt/endsAt/budgetCents/maxVideos |
| campaigns/:id | PATCH | status ACTIVE/PAUSED/COMPLETED |
| campaigns/:id/schedule | POST | scheduleId cùng kênh |
| calendar | GET | from/to ISO, tối đa 93 ngày |
| calendar/:scheduleId | PATCH | at ISO + expectedUpdatedAt |
| bulk-approval | POST | reviewed/rightsConfirmed=true + videos[id,revision] |
| analytics | GET | channelId/campaignId optional, tối đa 500 posts |
| analytics/sync | POST | yêu cầu sync ở worker |
| experiments | GET/POST | channelId/name/variants/minimumSamples/metric |
| experiments/:id | PATCH | PAUSED/COMPLETED |
| recommendations | GET/POST | channelId, Idempotency-Key; task AI nền |
| videos/:id/estimate | GET | chi phí dự kiến + ngân sách còn lại |
| videos/:id/variants | POST | revision/aspectRatio/platform; Idempotency-Key |
| publishing/:id/thumbnail | POST | retry thumbnail FAILED đã có consent |
| publishing/:id/reconcile | POST | đối soát remote ID/session; có thể resume upload |
| webhooks/tiktok/:appId | POST | raw JSON + TikTok-Signature; secret, workspace và version của appId; không dùng session/Origin |
| lifecycle | GET/PATCH | OWNER, retentionDays=0 hoặc 7–3650 |
| lifecycle/workspace/archive | POST | OWNER, password + đúng name workspace |

Biến thể platform: GENERIC/YOUTUBE/TIKTOK. Variant không thừa hưởng approval/consent. API JSON giới hạn 1.5MB; media tối đa 30MB, multipart bound 32MB. BigInt metrics trả chuỗi thập phân. Payload/provider secrets không bao giờ trả lại.

## Mốc lịch và đồ họa scene (16/11/2026)

POST /schedules thêm anchor: RESEARCH | PUBLISH; publishDelayMinutes là tổng chuẩn bị (15–43200), productionDelayMinutes là khoảng nghiên cứu (0–43199), approvalBufferMinutes là thời gian duyệt (1–43199). Tổng hai khoảng sau phải nhỏ hơn publishDelayMinutes. Mặc định API cũ: RESEARCH/0/5; UI mới chọn PUBLISH/30/30 với tổng 270 phút. runAt hoặc cron biểu diễn mốc anchor; nextRunAt trả về mốc nghiên cứu. Không chấp nhận lịch một lần nếu giờ bắt đầu nghiên cứu đã qua. GET /calendar trả thêm researchAt/productionAt/deadlineAt/publishAt. PATCH dời lịch vẫn nhận giờ nghiên cứu at, có expectedUpdatedAt.

GET /videos/{id} trả mốc thực tế và publishingJobs.post.publishedAt theo từng tài khoản. POST /ideas vẫn là background job; các ý tưởng GET/ bootstrap có các trường đánh giá và dự toán mới.

Script scene.camera_motion thêm pan-left/pan-right/pan-up/pan-down/parallax; transition thêm template bên cạnh cut/fade. graphic tùy chọn hoặc null: {kind: BARS|STEPS|STAT, title, unit, items: [{label,value}], sourceUrl: HTTP(S) URL|null}. Tối đa 6 mục, value hữu hạn 0–1e12. STAT dùng mục đầu tiên; giao diện chỉ tạo một mục. Các chỉnh sửa đi qua PUT /scripts/{id} và expectedRevision/scene locks như trước. Không có endpoint cho phép bỏ qua QA hoặc consent.
