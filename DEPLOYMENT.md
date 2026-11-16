# Deployment & operations

Compose có web, worker, migration, PostgreSQL, Redis và MinIO tùy chọn; dùng persistent volumes, restart policy, log rotation và worker resource limits. Redis AOF/noeviction, PostgreSQL data volume. Cấu hình production bỏ host ports của PostgreSQL/Redis và nối riêng web vào mạng của Nginx Proxy Manager.

## Oracle VPS / studio.tungnv.com

Domain đang dùng là `https://studio.tungnv.com`. `APP_URL` phải trùng chính xác origin trình duyệt (scheme, hostname và port). Khi đổi domain, cập nhật `.env` rồi chạy `docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --no-deps --force-recreate web worker` để đăng ký, đăng nhập và OAuth dùng đúng origin; chỉ restart container sẽ không nạp lại biến môi trường.

- Repository: https://github.com/tungnv107/ai-video-studio (nhánh `main`).
- Server: `ubuntu@161.118.222.102`, thư mục `/home/ubuntu/ai-video-studio`.
- `.env` riêng trên server: `APP_URL=https://studio.tungnv.com`, `WEB_PORT=3005`, `NPM_NETWORK=npm_proxy`. Tạo secrets ngẫu nhiên riêng, không copy dữ liệu/credentials kiểm thử local. Giữ `.env` quyền `600` và backup encryption key cùng database/media.
- Dùng cả hai file Compose trong mọi lệnh production. Build image một lần qua service web; migrate/web/worker dùng cùng image.

```sh
cd /home/ubuntu/ai-video-studio
git pull --ff-only origin main
docker compose -f docker-compose.yml -f docker-compose.production.yml build web
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --no-build
docker compose -f docker-compose.yml -f docker-compose.production.yml ps -a
curl --fail http://127.0.0.1:3005/api/system/health
```

Lần cập nhật có migration: backup trước, build trước, dừng web/worker cũ, chạy lại migrate rồi khởi động web/worker; không chạy đồng thời worker cũ và mới. Không dùng `down -v` vì sẽ xóa dữ liệu persistent.

### Nginx Proxy Manager

Tạo DNS A record `studio.tungnv.com` → `161.118.222.102`, rồi thêm Proxy Host:

| Trường | Giá trị |
| --- | --- |
| Domain Names | `studio.tungnv.com` |
| Scheme | `http` |
| Forward Hostname / IP | `ai-video-studio-web` |
| Forward Port | `3000` |
| Cache Assets | Tắt |
| Block Common Exploits | Bật |
| Websockets Support | Bật |
| SSL | Request a new SSL Certificate / Let's Encrypt |
| Force SSL / HTTP/2 Support | Bật sau khi cấp chứng chỉ |

NPM chạy trong container trên mạng `npm_proxy`; hostname ở trên là alias Docker cố định. `127.0.0.1:3005` chỉ để kiểm tra từ host VPS, không phải upstream bên trong container NPM. Cổng ứng dụng không cần mở ra Internet.

Advanced:

```nginx
client_max_body_size 100m;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
proxy_buffering off;
```

Sau khi HTTPS hoạt động, mở `/login` để tạo tài khoản studio và cấu hình API provider qua giao diện. `APP_URL` đã dùng HTTPS nên session cookie yêu cầu HTTPS. OAuth callback lấy trực tiếp trong phần Kết nối nền tảng. Chưa có SMTP/API keys thì các chức năng cần nhà cung cấp đó chưa thể hoạt động.

## Ubuntu VPS (operator thực hiện khi được cho phép)

1. Cài Docker Engine + Compose plugin, trỏ domain và reverse proxy HTTPS đến 127.0.0.1:3000.
2. Copy source; npm run setup:local hoặc tạo .env từ .env.example. Cấu hình APP_URL=https://domain, secrets ngẫu nhiên, provider allowlist, OAuth callback và registration.
3. Build/chạy: docker compose up -d --build. Service migrate phải hoàn tất trước web/worker. Không sửa database URL host ngoài compose; compose override hostname postgres/redis.
4. Tạo tài khoản, kênh và provider. Chạy video thử trên quyền thực tế. Bật PUBLISHING_ENABLED chỉ sau khi kiểm tra consent/QA và OAuth. TikTok flag riêng không thay thế app audit.
5. Theo dõi docker compose logs -f web worker; /api/system/health và worker :3001. Kiểm tra restart persistence trên môi trường staging trước production.

## Storage

Mặc định local volume media_data dùng chung web/worker trên một Docker host. Scale nhiều host phải dùng STORAGE_DRIVER=s3 với endpoint/credentials của S3-compatible service bạn đã chọn. S3_ENDPOINT dùng để ký URL và phải truy cập được từ browser. S3_INTERNAL_ENDPOINT là tùy chọn cho mạng nội bộ, mặc định dùng S3_ENDPOINT; Compose không ghi đè external endpoint.

MinIO chỉ nằm trong profile tùy chọn `s3-local`; không khởi động mặc định. Kiểm tra ngày 15/11/2026: image legacy trên Docker Hub/Quay không pull được, và [repository chính thức](https://github.com/minio/minio) đã archived/source-only. Không coi legacy image là lựa chọn production được duy trì. Nếu operator có image/build phù hợp, đặt MINIO_IMAGE rồi chạy `docker compose --profile s3-local up -d minio`, tạo bucket private studio qua console localhost:59001; trong container đặt S3_INTERNAL_ENDPOINT=http://minio:9000, còn S3_ENDPOINT là URL browser truy cập. Không có bucket tự tạo. Dùng credential giới hạn bucket thay cho root cho production.

`scripts/storage-smoke.ts` đã kiểm tra thành công put/read/signed URL và cấm anonymous trên bucket test riêng với image có sẵn `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`. Đây là image bên thứ ba dùng cho kiểm thử local, không phải bảo đảm hỗ trợ production. Bucket test được dọn và container test được dừng; không sử dụng dữ liệu MinIO của dự án khác. Local storage đã được kiểm chứng qua integration/render tests. Domain public/TLS và nhà cung cấp S3 production vẫn cần nghiệm thu riêng.

## Backup

Không in secrets trong command. Database dump vào file trong container rồi copy ra để tránh PowerShell làm hỏng binary:

```sh
docker compose exec postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/studio.dump'
docker compose cp postgres:/tmp/studio.dump ./studio.dump
```

Backup media_data hoặc S3 versioned objects và ENCRYPTION_KEY riêng. DB backup không có key sẽ không giải mã credentials được. Đặt lịch backup ở hạ tầng, kiểm tra checksum và mã hóa bản sao.

## Restore (môi trường mới, không ghi đè live)

Tạo PostgreSQL rỗng và cùng schema version. Copy dump vào container rồi dùng pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner /tmp/studio.dump; restore storage và encryption key; chạy migration mới nếu cần. Khởi động worker sau khi kiểm tra consent/job state. Upload pending cần đối soát; không ép thành PUBLISHED. Không dùng --clean trên database live.

## Shutdown/recovery

Worker SIGTERM đóng intake và đợi job, Compose stop_grace_period=15m. Crash giữ checkpoint; lease quá hạn được dispatcher phục hồi, tối đa 3 attempts. Scheduler bounded catch-up: một missed occurrence, rồi nextRunAt sau now để tránh bùng chi phí. Hết maxRuns/endsAt tắt lịch. FAILED/dead-letter không tự xóa.

## Kiểm tra Docker

Đã build image `ai-video-studio:verified` và chạy container Linux thật: Prisma kết nối PostgreSQL, Redis PING, FFmpeg render phụ đề tiếng Việt, production web/login và worker health đều qua. Bằng chứng trong `artifacts/container-smoke.json` và `artifacts/docker-build.log`. Đã restart PostgreSQL/Redis và xác nhận lịch/job tồn tại. MinIO private signed download trên loopback cũng đã qua. Chưa deploy VPS hoặc kiểm tra TLS public. Backup restore drill local đã thực hiện, xem cập nhật bên dưới.

Sau milestone biên tập AI/cộng tác, đã rebuild cùng tag với mã cuối (bao gồm khóa apply/dismiss) và chạy lại container smoke. Hai bảng ScriptEditJob/WorkspaceInvitation, trang /join, web/worker và FFmpeg đều qua. Bằng chứng mới: `artifacts/docker-build-collaboration-final.log`, `artifacts/container-smoke-collaboration.json`. Migration `202611150002_collaboration` đã áp dụng lên database local; operator chạy `npm run db:migrate` khi cập nhật môi trường khác.


## Nâng cấp advanced

1. Backup DB/storage/encryption key. Bổ sung TENANT_DB_PASSWORD và các biến mới từ .env.example, giữ secrets hiện có.
2. npm run db:migrate rồi npm run db:rls. Compose migrate chạy cả migrations và setup-rls. Web cần TENANT_DATABASE_URL dùng studio_tenant, worker giữ DATABASE_URL trusted.
3. RLS role password phải giống giữa migrate và web; không dùng owner/superuser cho TENANT_DATABASE_URL. URL password cần URL-safe; setup-local tạo password hex.
4. Cấu hình SMTP thật/TLS, nguồn allowlist, Runway output hosts và provider keys qua UI. Chạy video nghiệm thu có ngân sách giới hạn trước khi bật lịch.
5. OAuth lại tài khoản cũ nếu cần scope analytics; TikTok webhook URL được hiển thị riêng trong cấu hình ứng dụng của studio (APP_URL/api/webhooks/tiktok/{appId}).

Backup drill đã chạy pg_dump custom rồi pg_restore vào database studio_restore_test_<random>, so sánh tables/migrations/videos/policies và xóa database/dump test. Bằng chứng artifacts/backup-restore-smoke.json. Khi restore sang cluster mới, tạo tenant role bằng setup-rls trước restore hoặc restore không ACL, rồi chạy setup-rls để cài lại grant/policy. ENCRYPTION_KEY và object storage vẫn phải restore riêng.

CLI lifecycle: npm run workspace:lifecycle -- --id ID mặc định dry-run; --restore --apply khôi phục workspace đã archive (lịch giữ paused). Purge cần --purge --confirm "Tên workspace" --apply. Không xóa bài đăng trên nền tảng. Chỉ operator có DATABASE_URL trusted sử dụng CLI.

Load smoke local 80 requests / concurrency 8 không có lỗi. Đây không phải capacity test cho VPS: benchmark theo kích thước video, ffmpeg threads, RAM và paid provider quotas; production role tenant pool giới hạn 2 connections/workspace, tối đa 16 cached clients/process, admin pool mặc định 8. Upload MP4 vẫn buffer toàn file trong RAM dù gửi TikTok theo chunk.

## Nâng cấp mốc lịch/ý tưởng (16/11/2026)

Chạy migration 202611160001_schedule_ideas trước khi khởi động mã mới. Đây là các cột bổ sung, giữ nguyên dữ liệu/lịch cũ và RLS; không cần đổi secrets. Worker mới đọc availableAt để nhả/chờ giữa nghiên cứu và sản xuất. Không chạy worker bản cũ cùng worker bản mới: bản cũ không hiểu availableAt và có thể lấy job quá sớm. Dừng các worker cũ, migrate rồi khởi động web/worker mới trong cùng lần nâng cấp.

## Nâng cấp OAuth theo studio (16/11/2026)

Dừng web/worker cũ, chạy `npm run db:generate`, `npm run db:migrate` (migration `202611160002_workspace_oauth`) và `npm run db:rls`, rồi khởi động lại web/worker cùng phiên bản. Bảng WorkspaceOAuthApp có RLS theo workspace; tổng 40 bảng được cấp policy. Migration chỉ bổ sung bảng/cột, không sao chép bốn biến OAuth `.env` vào các studio và không xóa dữ liệu hiện có.

Chủ sở hữu nhập Client ID/Key và Client Secret ở Kết nối nền tảng của từng studio. Sao chép Redirect URI, và Webhook URL riêng nếu dùng TikTok, vào ứng dụng developer; kết nối lại tài khoản sau nâng cấp. Webhook cũ `/api/webhooks/tiktok` không xác định được studio nên không được chấp nhận. Token cũ không có version chỉ dùng đến khi hết hạn hoặc cấu hình thay đổi, không tự refresh bằng credentials toàn cục. Khi thay đổi cấu hình trong UI không cần restart. Các công tắc cho phép xuất bản vẫn do người vận hành máy chủ quản lý.
