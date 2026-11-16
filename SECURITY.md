# Security & operational boundaries

- Password scrypt + random salt; session 256-bit random, DB hash-only, HttpOnly/SameSite=Lax, Secure khi APP_URL HTTPS. Logout xóa session. Session expire 14 ngày.
- Origin bắt buộc cho mutation, kể cả login/register. RBAC OWNER/EDITOR/REVIEWER/VIEWER, tenant derive từ session. API checks + composite FK. RLS áp dụng cho tenant routes; review mọi query mới và trust boundary adminDb.
- AES-256-GCM cho provider key, OAuth app secret theo workspace, access/refresh token, OAuth verifier và resumable upload URL; ENCRYPTION_KEY 32 bytes base64. Backup encryption key bên ngoài DB, không commit. Key rotation cần re-encrypt migration có kiểm soát, chưa có UI rotation.
- Redis rate limit atomic Lua; auth theo email + global, API theo user. Redis unavailable → request fail closed. Có TOTP/recovery/reset và giới hạn số lần thử; không khóa tài khoản vĩnh viễn.
- Provider URL chỉ HTTPS, không credential/port/query/hash, hostname allowlist do operator cấu hình. Nguồn nghiên cứu được tải qua safeFetch, allowlist chính xác và DNS public IP pinning. Allowlist hostname không phải giải pháp cho arbitrary endpoint; chỉ thêm nhà cung cấp tin cậy.
- Storage private, local traversal guard; route kiểm tra tenant trước streaming. S3 URL ký 5 phút. Không public-read bucket. MP4 local có HTTP Range.
- FFmpeg spawn argv, không shell interpolation. ASS escape user markup. Worker CPU/RAM hạn chế qua Compose; upload TikTok chia chunk nhưng hiện vẫn đọc toàn bộ MP4 vào RAM; sizing worker phải tính đến kích thước video và concurrency.
- Logs không chứa key/token/password; audit action/entity/worker metadata. Error provider chỉ code HTTP, không echo raw response.
- Paid API timeout giữ UNKNOWN và budget; manual cost consent mới gọi lại. Publishing timeout giữ session/remote ID và đối soát, không retry init mù.
- Không tự deploy/push/publish. Xuất bản disabled mặc định. TikTok Direct Post disabled riêng.

## Trước production

Đổi APP_URL thành HTTPS; đặt REGISTRATION_ENABLED=false nếu studio nội bộ; dùng reverse proxy TLS, secrets manager, DB/Redis private networking, storage lifecycle, backup restore drill và giám sát log/health. Không dùng ảnh/media fixture làm số liệu sản xuất. Audit dependencies bằng npm audit và cập nhật lockfile có kiểm thử.

Giới hạn vận hành cần đánh giá tại production: CSP nonce nghiêm ngặt, direct-to-S3 multipart từ browser, antivirus sandbox cho media, Prometheus exporter và memory streaming cho video lớn. RLS, 2FA/reset, retention đã triển khai; không suy ra chứng nhận an toàn tuyệt đối.


## Thành viên và lời mời

Lời mời dùng token ngẫu nhiên 256-bit, DB lưu hash, token trả một lần trong URL fragment /join#invite=… để không gửi vào URL request máy chủ. Token hết hạn 7 ngày, chỉ nhận một lần bởi tài khoản có email khớp; tạo lại thu hồi lời mời cũ. Chủ sở hữu tự chia sẻ liên kết cho người nhận; SMTP dùng cho reset mật khẩu; lời mời vẫn chia sẻ liên kết thủ công và chưa có workflow xác minh email riêng. Trình duyệt giữ lời mời pending trong sessionStorage qua login rồi xóa sau khi nhận. Không ghi token vào audit.

Mutation membership đọc lại quyền OWNER trong transaction và lock workspace. Không được xóa/hạ role owner cuối. Session lookup đọc role hiện tại mỗi request; xóa member xóa session của user trong workspace đó. Biên tập AI chỉ cho OWNER/EDITOR; worker kiểm tra membership trước gọi trả phí; thao tác apply vẫn kiểm tra tenant/revision/locks.


## Bảo mật bổ sung

RLS là defense in depth, không thay RBAC: owner/editor/reviewer/viewer được kiểm tra tại API; tenant DB không được SUPERUSER/BYPASSRLS. SQL injection và adminDb misuse vẫn cần code review. DATABASE_URL chỉ cho web auth/worker/migrations tin cậy.

TOTP SHA1 30 giây, cửa sổ ±1, counter chống replay; secret AES-GCM, recovery code hash dùng một lần. Enable/disable/reset revokes sessions và challenges. Password check được đối chiếu lại dưới user advisory lock; MFA challenge consumption + tạo session trong một transaction. Reset token random 256 bit, hash, 15 phút, gửi URL fragment, không log/token trong response. MFA vẫn bắt buộc khi reset mật khẩu.

SSRF guard: HTTPS/host allowlist chính xác; DNS tất cả địa chỉ phải public; request pin IP, redirects kiểm tra lại; response có hạn byte/time/mime. API JSON/media có streaming size bounds. Media lưu license và normalize ảnh, probe audio/video.

Retention mặc định tắt; tối thiểu 7 ngày, chỉ xóa media đã soft-delete và không còn tham chiếu channel/project/template/brand/experiment. Archive dừng lịch/job/phiên; purge CLI yêu cầu đã archive, không job chạy, đúng tên, --apply. Local storage từ chối symlink root và path ngoài workspace; S3 chỉ xóa prefix workspace.

Không có key thực, password hay upload-session URL trong docs/artifacts report. File .env và data/artifacts bị loại khỏi Docker build context.
