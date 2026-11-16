# Kiểm thử và bằng chứng

Cập nhật 16/11/2026. Kết quả rà soát mới nhất: [AUDIT_END_TO_END.md](AUDIT_END_TO_END.md). 82 unit, 78 integration, 15 Chrome E2E đã qua; video thật 30 giây bằng Codex + Edge TTS Việt đã được phát/tải qua domain production. Social live chưa được nghiệm thu. Các fixture tests chỉ chạy trên database local; tạm dừng worker local để worker không lấy fixture jobs.

| Nhóm | Lệnh | Phạm vi |
|---|---|---|
| TypeScript | npm run typecheck | source/test types |
| Unit | npm test | 57 ca: schema, crypto/CSRF/RBAC, subtitle, AI edits, provider HTTP, TOTP/signature, SSRF, alignment, chunking |
| Integration | npm run test:integration | 59 ca với PostgreSQL/Redis/RLS thật: pipeline/render/recovery, budget/leases, collaboration, MFA, SMTP, campaign, fallback, retention, variants, analytics history, resume TikTok mocked và webhook replay/revocation DB |
| Browser | npm run test:e2e | 8 Chrome workflows: core, collaboration, AI proposal, advanced settings/media/calendar/A-B mobile, MFA login |
| Render | npm run test:render:advanced | 3 tỷ lệ × 24/25/30FPS, fade, cards/logo, overlay, ducking, karaoke tiếng Việt |
| API load | npm run test:load | 80 requests, concurrency 8, response validation; local bounded test |
| Backup | npm run test:backup | pg_dump/restore vào DB test riêng, compare + cleanup |
| Lifecycle | npx tsx --env-file=.env scripts/lifecycle-smoke.ts | dry-run/restore/purge; neighbor storage preserved |
| Docker | docker build + scripts/container-smoke.ts | Linux production Next, worker/DB/Redis/FFmpeg health |
| Dependencies | npm audit | 0 advisory tại lần kiểm tra |

## Bằng chứng

- artifacts/render-advanced/verification.json và */review.jpg, styled-thumbnail.jpg: video fixture 10s, QA kỹ thuật 100 ở ba tỷ lệ.
- artifacts/load-smoke.json: 80/80 status 200; p95 611ms trong lần chạy local trước final build.
- artifacts/backup-restore-smoke.json: 42 tables, 4 migrations, 39 RLS policies khôi phục thành công.
- artifacts/lifecycle-smoke.json: chỉ xóa workspace fixture chỉ định.
- artifacts/npm-audit-advanced.json: báo cáo dependency audit.
- artifacts/ui-advanced-*.png và playwright-report: desktop/mobile, các thao tác thực ghi vào DB.
- artifacts/container-smoke-advanced.json: lần chạy production Linux cuối.
- artifacts/storage-smoke.json, restart-smoke.json và container-smoke-collaboration.json: milestone trước, MinIO private/download và restart persistence.

## Các tình huống lỗi được phủ

Key sai/429, network timeout chưa rõ phí, corrupt provider payload; job claim hai worker, cancel/fencing, thiếu ngân sách, stale revision/locked scene, last owner, invitation replay, OAuth state replay/refresh, token revoked; cross-tenant SQL reads/writes dưới RLS; invalid/expired/replayed MFA/reset, raw webhook signature/replay window; source private IP/redirect/size/entity; invalid alignment/transcript; TikTok chunk planning/resume ACK; QA thiếu track/duration/độ phân giải/black/silence/đọc phụ đề; backup restore và workspace purge scope.

Bộ test phát hiện và đã sửa: RLS làm user không còn visible sau khi remove membership; calendar không refresh sau tạo rule; settings async response ghi đè lựa chọn; FFmpeg final args lẫn inputs làm video chỉ còn intro; black-frame QA tính nhầm thẻ nền tối chủ ý; login trước hydration; mẫu A/B mất branding; sample 24h bị rơi khỏi 48 snapshot mới.

## Nghiệm thu ngoài môi trường

Không đánh dấu live AI/Runway/ElevenLabs/Brave, OAuth/posting/analytics social hoặc email SMTP public là đã kiểm chứng chỉ từ mocks/local SMTP. Cần credentials/app quyền, callback HTTPS, host allowlist, ngân sách và nội dung được người dùng cho phép. Public S3/domain/TLS, memory khi video dài, multi-host scale và quota thực phải thử trên staging mục tiêu.

## Milestone 15/11/2026

Typecheck, 48/48 unit, 56/56 integration và 5/5 Chrome E2E đều qua trên mã cuối. Docker image manifest sha256:5f0bed7f845cf832dab6ea2773f259423d984b721cc4650c82283072c5e7588f build thành công; Linux web/worker/DB/Redis/FFmpeg và đăng ký/bootstrap với RLS thật đều qua. Linux fixture QA 92 (phụ đề fixture rất ngắn có cảnh báo tốc độ chữ), không bỏ qua ngưỡng/chặn kỹ thuật.

Render nâng cao 1080×1920 @24FPS, 10 giây có overlay/logo/fade/intro-outro/ducking/karaoke đạt QA 100; đã xem frame. Bằng chứng artifacts/render-advanced-hd/verification.json.

Sau test kéo dài, đã sửa tenant pool bị tạo lại qua hot reload; lần chạy E2E cuối không còn cạn connection. Tổng hợp máy đọc được: artifacts/verification-advanced.json.

## Bổ sung 16/11/2026

Lượt hoàn thiện bổ sung 9 unit, 3 integration và 3 browser workflows. Typecheck, 57 unit và 59 integration đã qua. E2E kiểm tra body attribute extension trước hydration và khi reload; một ca cố ý tạo mismatch trong form xác nhận cảnh báo React bên dưới body vẫn được giữ. Có ca thao tác thật tính ngược lịch/đồ họa scene/khóa scene/metadata ý tưởng.

Render motion: artifacts/render-motion/verification.json — 3 tỷ lệ ở 24/25/30FPS, mỗi video 15 giây, QA 100; artifacts/render-motion-hd/verification.json — 1080×1920 @24FPS, QA 100. Đã xem ảnh pan/parallax/biểu đồ/bước/số liệu và đo pixel khác nhau giữa hai thời điểm. Các đầu ra là fixture, không phải kết quả AI trả phí.

Bộ integration mới kiểm chứng checkpoint nghiên cứu chỉ gọi một lần qua hai giai đoạn, job không bị claim trước availableAt, xử lý cạnh tranh, cảnh báo deadline một lần, cùng render đầy đủ hai scene đồ họa khi mọi provider đã tắt và chỉ có audio cache.

Một lượt E2E gặp HTTP 500 từ Next dev loadManifest (JSON đang ghi), trước khi API ứng dụng thực thi; request PATCH chứa đúng role EDITOR. Lượt kiểm chứng lại và production Linux được ghi trong artifacts/verification-finalization.json. Không sửa logic phân quyền để che lỗi môi trường này.

Lượt E2E cuối 16/11: 8/8 qua; image Docker local sha256:df472524988dc18022be97cb0db81f65e8188cc934813d1066f0c678bf8d94a5 build thành công. Linux FFmpeg cũng dựng bộ motion/graphics ba tỷ lệ, mỗi video 15s, QA 100; artifacts/render-linux-motion/verification.json. Toàn bộ năm migrations đã áp dụng và prisma validate/migrate status đều qua.

Backup/restore sau migration mới đã qua: 42 bảng, 5 migrations, 39 policies. Production Linux login/register/bootstrap dưới RLS và health worker qua; smoke 1s QA 92 do phụ đề fixture ngắn, bộ motion 15s QA 100. Báo cáo tổng hợp: artifacts/verification-finalization.json. Web và worker local đã được bật lại; chưa deploy/publish/push.

## Trang hướng dẫn và hoàn thiện giao diện — 16/11/2026

- Typecheck, 57/57 unit, 59/59 integration và 11/11 Chrome E2E qua. Ba luồng trong `tests/e2e/guide.spec.ts` cũng được chạy lại sau khi chuyển sang tự tạo fixture MP4 bằng FFmpeg; không cần artifacts từ lần chạy trước.
- `/guide` trả 200 khi chưa đăng nhập; tìm kiếm có/không dấu, không có kết quả, mục lục/hash và mở câu hỏi sự cố đã được kiểm tra. Mobile 390×844 không tràn ngang, sáng/tối giữ lựa chọn sau reload; đã xem ảnh chụp desktop/mobile.
- Liên kết từ đăng nhập và studio hoạt động. Bootstrap giả lập lỗi 503 rồi phục hồi bằng Thử tải lại, không giữ thông báo lỗi cũ. Clip VIDEO phát thật qua API tài sản. Form TikTok tự chọn Upload khi Direct Post tắt hoặc tài khoản thiếu `video.publish`, không gọi creator API trong trường hợp đó.
- Test TikTok chỉ giả lập capability trên response bootstrap và dùng tài khoản fixture, không tạo publishing job, không OAuth hoặc gửi bài thật. Các kiểm thử AI vẫn dùng mock/fixture; không phải nghiệm thu dịch vụ trả phí.
- Production Webpack build vào `.next-build` thành công. `next start` local tạm thời trên cổng 3105: `/guide` trả 200 với đủ nội dung và `/api/system/health` thành công; server kiểm chứng đã dừng. Bằng chứng: `artifacts/guide-production-smoke.json`, `artifacts/ui-guide-*.png`, `artifacts/ui-generated-clip.png`, `artifacts/verification-guide.json`.

## Cấu hình OAuth theo studio — 16/11/2026

Migration `202611160002_workspace_oauth` đã được áp dụng trên database local; Prisma validate/migrate status và RLS 40 bảng qua. Toàn bộ 57 unit, 70 integration và 13 E2E đã qua; typecheck thành công. Bản production build và API smoke qua: tạo/đọc/xóa cấu hình trong workspace TEST, secret mã hóa/không trả ra JSON, bootstrap trả capability theo studio, URL OAuth đúng Client ID và OpenAPI có endpoint mới. Không thực hiện OAuth hay đăng bài lên nền tảng thật.

Các ca mới kiểm tra RLS giữa hai studio, OWNER/EDITOR/REVIEWER/VIEWER, không fallback secret `.env`, giữ secret khi để trống, cần secret mới khi đổi client, xung đột version, xác nhận ngắt tài khoản, chặn đổi key lúc upload, vô hiệu callback đang chạy, refresh/revoke theo đúng app, webhook theo workspace/version và chống replay. E2E kiểm tra form, reload, mobile 390px, hai studio độc lập, CSRF, URL redirect được chặn bằng fixture và form cũ không ghi đè cấu hình mới.

Kiểm thử đã phát hiện và sửa phản hồi GET cũ ghi đè Client ID đang nhập, cùng việc dữ liệu tải muộn tự đóng phần cấu hình người dùng vừa mở. Bằng chứng: `artifacts/ui-oauth-settings-desktop.png`, `artifacts/ui-oauth-settings-mobile.png`, `artifacts/oauth-production-smoke.json` và báo cáo tổng hợp `artifacts/verification-oauth-settings.json`.

Sau kiểm thử, web và worker local đã được khôi phục, health đều trả `ok: true`, trang `/guide` trả HTTP 200. Bằng chứng: `artifacts/oauth-local-health.json`.
