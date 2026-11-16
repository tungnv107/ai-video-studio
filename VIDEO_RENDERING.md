# Video rendering

Dựng video bằng FFmpeg + FFprobe; output private MP4/H.264/AAC, thumbnail, ASS nội bộ, SRT/VTT. Cấu hình mặc định 1080×1920, 1920×1080 hoặc 1080×1080.

## Renderer nâng cao

Settings snapshot theo video: fps, cut/fade, logo, intro/outro, subtitle, music, visual mode, QA. Asset chọn từ thư viện private phải cùng workspace và loại MIME. Thẻ GRAPHICS dựng bằng SVG/Sharp; không gọi API ảnh.

FFmpeg dựng từng scene, chuẩn hóa audio, tpad/xfade giữ timeline lời thoại, ASS overlay chữ có fade, logo và nhạc sidechaincompress. Chữ tiếng Việt dùng DejaVu. Intro/outro im lặng có khoảng riêng; black/silence QA loại phần chủ ý này. Nhạc không che được lời thoại im lặng trong phép đo QA.

Forced alignment gọi ElevenLabs và kiểm tra transcript/word order/end time; karaoke theo word timestamp. PROPORTIONAL chỉ ước lượng từ thời lượng audio, không giả chính xác từng từ.

Export variants dùng chung asset bất biến cùng workspace nhưng có output/QA/approval riêng. TikTok variant bỏ logo/intro/outro và tăng safe margins. Preview và quyền tài sản vẫn phải được duyệt.

artifacts/render-advanced/verification.json: 3 tỷ lệ, 24/25/30fps, video fixture 10 giây QA 100; frame review.jpg và styled-thumbnail.jpg. Smoke 1080×1920 cơ bản nằm ở artifacts/render-smoke từ milestone trước.

Giới hạn: chưa có editor timeline nhiều lớp, parallax hoặc chart library tổng quát. Glyph overflow dùng giới hạn cỡ chữ/margin, nhóm 7 từ và kiểm tra tốc độ chữ; không phải phép đo glyph đầy đủ. Phải xem toàn bộ video trước phê duyệt.

Render full-HD nâng cao mới: artifacts/render-advanced-hd/9x16/final.mp4 (1080×1920, 24fps, 10s), QA 100; frame/thumbnail đã kiểm tra.

## Pan, parallax, đồ họa và chuyển cảnh theo scene

Pan bốn hướng dùng zoompan với khoảng tiến độ dựa trên thời lượng/FPS, không nhận biểu thức FFmpeg từ người dùng. Parallax là ảnh nổi trên nền blur có chuyển động tương đối giữa hai lớp. Clip vẫn chạy theo chuyển động của video gốc. Scene.graphic tạo SVG Unicode đã escape rồi rasterize bằng Sharp; hỗ trợ BARS/STEPS/STAT, giới hạn nhãn và số mục, nguồn hiển thị dưới đồ họa. Biểu đồ dùng reveal fade và bố cục chừa vùng phụ đề, mặc định tĩnh để số liệu không bị crop.

Mỗi scene chọn cut/fade/template. Khi trộn cut và fade, renderer ghép hình theo từng cạnh, pad frame cho fade và nối audio độc lập để giữ tổng timeline; intro/outro kế thừa preset. Script cũ vẫn đọc được. Dựng thử: npm run test:render:motion; RENDER_FULL_RES=true và RENDER_SMOKE_ASPECT=9:16 cho 1080×1920. Fixture có pan, parallax, ba loại đồ họa, chuyển cảnh hỗn hợp; đo chênh lệch pixel để kiểm tra pan thật, FFprobe/decode/QA và ảnh review. Không có AI paid call trong smoke này.
