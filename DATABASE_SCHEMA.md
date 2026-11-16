# Database schema

Nguồn chuẩn: `prisma/schema.prisma`. Migration SQL: `prisma/migrations/202611150001_initial/migration.sql`. PostgreSQL 16; Prisma 6.19.3. Mọi quan hệ có foreign key trong migration, indexes cho truy vấn tenant/trạng thái/thời gian.

| Nhóm | Models | Quan hệ / invariant chính |
|---|---|---|
| Identity | User, Session, Workspace, WorkspaceMember | Email unique, session token hash unique, workspace/user unique; role theo workspace |
| Content | ContentChannel, ContentTopic, ContentIdea, ResearchSource | Channel thuộc workspace; nguồn thuộc project, URL unique trong project |
| Production | VideoProject, Script, ScriptVersion, VideoScene | Composite channel(id,workspaceId); script/project unique; version unique; scene order unique |
| Assets | GeneratedAsset, AudioAsset, VoiceProfile | Asset unique theo project/revision/scene/kind, audio metadata 1:1 |
| Brand | VideoTemplate, BrandKit | Version unique theo workspace + slug/name |
| Work | ProductionJob, RenderJob | Idempotency key unique; lease/workerId; render unique theo job/revision |
| Schedule | ScheduleRule, ScheduledOccurrence | Lịch trong DB; occurrence unique(schedule,scheduledFor), project unique |
| Review | ApprovalRequest | Unique(project,revision,type), actor, decidedAt |
| Publishing | SocialAccount, SocialAccountCredential, OAuthState, PublishingJob, PublishedPost | Account unique tenant/platform/remote; credential encrypted; consent snapshot; remote session persisted |
| OAuth theo studio | WorkspaceOAuthApp | Unique workspaceId/platform; clientId, encryptedSecret AES-GCM, version. Xóa cấu hình giữ bản ghi rỗng và tăng version để vô hiệu callback/token cũ |
| Analytics | PlatformMetricSnapshot | Nullable metric nếu API không cung cấp; raw payload, capturedAt |
| Providers/Cost | AIProvider, AIModelConfig, CostUsage | Key encrypted; budget theo channel; step idempotency; cost estimate và outcome trạng thái riêng |
| Ops | Notification, AuditLog | Index tenant/time; không chứa secret |

## Tenant isolation

API derive workspace từ session và membership, không nhận workspaceId do client quyết định. Project → channel, script → project, asset/job/cost → project dùng composite FK gồm workspaceId. Các model con không có workspaceId được truy vấn qua project/account/template đã kiểm tra tenant. Session workspace đổi chỉ khi user có membership. PostgreSQL RLS dùng studio_tenant bổ sung application checks và composite FK; các truy vấn mới phải duy trì cả ba lớp.

## Concurrency

- PostgreSQL advisory transaction lock cho channel create/dedupe và budget reservation.
- Transaction lock cho lịch; unique occurrence là lớp bảo vệ cuối.
- Production lease: owner token, expiresAt, heartbeat; job RUNNING không thể claim khi lease còn hiệu lực.
- Script editor dùng expectedRevision để chống lost update; scene khóa được so sánh trước khi lưu.
- Consent digest dùng canonical JSON vì PostgreSQL JSONB có thể sắp lại thứ tự key.

## Lifecycle

Channel/VideoProject hỗ trợ deletedAt. Workspace cascade xóa nội dung nội bộ; việc xóa tài sản storage và remote posts là quy trình riêng, không tự xóa khỏi nền tảng. Job failed được giữ để điều tra. Lịch sử script và audit không tự purge. Production cần quy định retention/backup theo nhu cầu tổ chức.


## Migration 202611150002_collaboration

- WorkspaceInvitation: workspace FK cascade, email chuẩn hóa, role, tokenHash unique, createdBy, expiresAt, acceptedAt/acceptedBy và revokedAt. Index workspace/email. Không lưu token thô.
- ScriptEditJob: composite FK (projectId,workspaceId), actorId, baseRevision, request/result JSONB, idempotencyKey unique, status/attempts/queueVersion/lease, appliedRevision. Trạng thái QUEUED/RUNNING → READY → APPLIED; có FAILED/STALE/DISMISSED. Index tenant/time và status/lease.
- Lock workspace bảo vệ cập nhật membership và việc dùng invitation một lần; lock project bảo vệ áp dụng đề xuất, save/restore và thay đổi scene lock.


## Schema nâng cao và RLS

Migration 202611150003_advanced bổ sung AuthChallenge, MediaItem, Campaign, Experiment, AutomationTask, WebhookEvent; TOTP/recovery ở User; productionConfig/researchBrief/embedding/campaign/experiment ở VideoProject; settings ở kênh/provider; metrics chia sẻ/watchtime/sync leases. Migration 202611150004_model_default đổi default imageModel cho cấu hình mới.

RLS được cài bởi scripts/setup-rls.mjs sau migrate, cho 40 bảng; role không có quyền AuthChallenge/WebhookEvent. OAuthState có policy workspace vì connect/callback chạy trong tenant API. User chỉ SELECT cho thành viên cùng workspace. Prisma migrations không tự tạo tenant login/password.

Template/BrandKit immutable theo version. Metric snapshot unique(postId,periodKey); WebhookEvent unique payload hash; AutomationTask unique key; AuthChallenge hash token + expiry + usedAt. Lịch và database là nguồn sự thật, Redis là dispatcher.

## Migration 202611160001_schedule_ideas

Bổ sung VideoProject.productionAt/deadlineAt, researchStartedAt/researchCompletedAt/productionStartedAt/completedAt/deadlineMissedAt; scheduledAt tiếp tục là mốc nghiên cứu và publishAt là mục tiêu đăng. ProductionJob.availableAt có index (status, availableAt). ScheduleRule thêm anchor mặc định RESEARCH, productionDelayMinutes=0, approvalBufferMinutes=5 để tương thích lịch cũ; không dịch giờ của lịch đã lưu. ContentIdea thêm channelId, problem, audience, channelFit, feasibility, feasibilityReason, estimatedCostCents và estimateBasis, đều nullable cho dữ liệu cũ. Các bảng giữ nguyên RLS hiện có; không thêm bảng hay cấp quyền tenant mới.
