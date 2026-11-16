# Yêu cầu sản phẩm

Nguồn đầy đủ: `AI_Video_Automation_Studio_Master_Prompt.md`. Tài liệu đó là baseline; các mục chưa hoàn thành vẫn được giữ trong backlog, không bị xóa khỏi phạm vi.

Luồng core đã triển khai: người dùng xác thực, tạo kênh, cấu hình AI phía server, nhập chủ đề, tạo/chỉnh sửa kịch bản theo scene, sinh ảnh và lời đọc thật, dựng MP4 với phụ đề Unicode, QA, duyệt và tải tài sản. Có lịch sản xuất bền vững, retry và ngân sách. UI tiếng Việt, timezone Asia/Ho_Chi_Minh, responsive và light/dark.

Không có fake production data. Mọi màn hình rỗng phải hướng dẫn bước cần thiết. Khi thiếu provider/key, job báo lỗi cấu hình; không tự thay bằng mock. Không tự đăng chỉ vì đã OAuth. Social connection và consent cho mỗi nội dung là hai quyền riêng biệt. TikTok privacy phải do người dùng chọn từ creator_info mới. Upload ≠ published. Mọi số liệu tài chính là USD cents, các khoản ước tính phải được ghi rõ.

Nghiệm thu live có hai cấp: (1) kiểm thử kỹ thuật với mock API và media fixture; (2) chạy AI trả phí và đăng thật với credentials/quyền. Chỉ cấp (2) chứng minh kết quả ngoài nền tảng.

Phần nâng cao gồm research/RSS/search, embeddings/dedupe, AI clip/hybrid, media/license/brand presets, forced alignment/ducking/QA, campaign/calendar/bulk approval, metrics/recommendations/A-B, RLS/MFA/reset và lifecycle. Các ranh giới thực tế và điều kiện nghiệm thu ngoài môi trường ghi ở IMPLEMENTATION_PLAN.md.
