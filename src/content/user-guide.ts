export type GuideSection = {
  id: string;
  title: string;
  summary: string;
  steps: { title: string; text: string }[];
  notes?: string[];
  links: { label: string; href: string }[];
};

export const guideSections: GuideSection[] = [
  {
    id: 'bat-dau', title: 'Bắt đầu với video đầu tiên',
    summary: 'Đi từ một chủ đề đến video có thể tải về. Bạn có thể đọc hướng dẫn này trước khi đăng nhập.',
    steps: [
      { title: 'Tạo tài khoản hoặc tham gia workspace', text: 'Ở trang đăng nhập, chọn Tạo tài khoản, nhập họ tên, email và mật khẩu từ 12 ký tự. Nếu được mời, mở liên kết mời và dùng đúng email được mời; vào Cài đặt tài khoản để tham gia workspace.' },
      { title: 'Tạo kênh nội dung', text: 'Vào Kênh nội dung → Tạo kênh. Nhập chủ đề, khán giả, phong cách, ngôn ngữ, giọng đọc và ngân sách tháng bằng USD. Kênh nội dung tổ chức công việc trong studio; tài khoản YouTube/TikTok được kết nối riêng.' },
      { title: 'Kết nối nhà cung cấp AI', text: 'Chủ sở hữu vào Nhà cung cấp AI → Thêm provider, nhập API key và model mà tài khoản có quyền dùng. Để sản xuất bằng ảnh AI và giọng đọc, cần đủ khả năng viết kịch bản, tạo ảnh và TTS. OpenAI-compatible hiện chỉ cung cấp phần viết kịch bản.' },
      { title: 'Tạo kịch bản trước', text: 'Chọn Tạo video, chọn kênh, nhập chủ đề, thời lượng và tỷ lệ khung hình. Chọn Chỉ tạo kịch bản trước nếu muốn sửa nội dung trước khi tạo ảnh và âm thanh. Có thể bổ sung URL, tên nguồn và trích đoạn bạn đã kiểm tra.' },
      { title: 'Biên tập, dựng và tải về', text: 'Mở video trong Kịch bản AI hoặc Xưởng video. Sửa các scene, bấm Lưu phiên bản rồi Dựng phiên bản đã lưu. Bấm Làm mới video để xem tiến độ. Khi có thành phẩm, xem toàn bộ preview và tải MP4, SRT hoặc VTT.' },
    ],
    notes: ['Web và worker phải cùng hoạt động để xử lý hàng đợi. Nếu chưa cấu hình AI, bạn vẫn có thể thiết lập kênh và đọc hướng dẫn; công việc sản xuất sẽ chưa chạy thành công.'],
    links: [{ label: 'Mở studio', href: '/' }, { label: 'Tạo tài khoản / đăng nhập', href: '/login' }],
  },
  {
    id: 'kenh-provider', title: 'Kênh, provider và ngân sách',
    summary: 'Thiết lập cách sản xuất và giới hạn chi phí trước khi giao việc cho AI.',
    steps: [
      { title: 'Chọn chế độ của kênh', text: 'Thủ công: lịch dừng ở kịch bản. Bán tự động và Tự động sản xuất: lịch có thể tạo video hoàn chỉnh. Cả hai vẫn cần người có quyền duyệt và đồng ý xuất bản. Tạo video thủ công dùng lựa chọn Quy trình trong form.' },
      { title: 'Chọn provider theo công việc', text: 'OpenAI hỗ trợ kịch bản, ảnh và TTS; Runway tạo clip; ElevenLabs căn lời đọc theo từng từ; Brave Search tìm nguồn. Trong Thương hiệu & mẫu → Provider ưu tiên của kênh, chọn cấu hình riêng hoặc để hệ thống theo thứ tự của workspace.' },
      { title: 'Khớp thời lượng mục tiêu', text: 'Trong Thương hiệu & mẫu, chọn Thời lượng lời đọc → Khớp thời lượng cảnh để giữ thời lượng từng cảnh. Hệ thống tăng tốc audio đã lưu tối đa 1,5 lần và căn lại phụ đề, không cắt lời đọc và không gọi TTS thêm. Nếu lời thoại quá dài, cần rút ngắn kịch bản hoặc giữ nhịp tự nhiên. Thẻ mở đầu/kết thúc được cộng thêm vào thời lượng video. Cấu hình kênh áp dụng cho video mới.' },
      { title: '9router, Codex và giọng Việt', text: 'Dùng adapter OpenAI với Base URL và key của relay được quản trị cho phép. Ảnh Codex cần tiền tố cx/, ví dụ cx/gpt-image-2.5-flare; thiếu tiền tố có thể bị chuyển sang OpenAI API chưa kết nối. Edge TTS tiếng Việt dùng edge-tts/vi-VN-HoaiMyNeural (nữ) hoặc edge-tts/vi-VN-NamMinhNeural (nam). Model TTS này quyết định giọng đọc thay cho giọng OpenAI của kênh. Kiểm tra danh sách model và kết nối của relay. Gói ChatGPT Plus không cấp API credit cho api.openai.com.' },
      { title: 'Điều chỉnh cấu hình đã lưu', text: 'Trong Nhà cung cấp AI → Điều phối & cập nhật provider, sửa model, timeout, số lượt đồng thời, request/phút và đơn giá ước tính. Số ưu tiên nhỏ được dùng trước. Ô đổi API key để trống sẽ giữ key hiện tại; key đã lưu không được hiển thị lại.' },
      { title: 'Theo dõi khoản giữ ngân sách', text: 'Sử dụng & chi phí hiển thị chi phí ước tính và khoản giữ chỗ. Đơn giá provider dùng US cents: 100 cents = 1 USD. Trong chi tiết video, mở Chi phí dự kiến & xuất phiên bản để xem dự toán. Ngân sách kênh được kiểm tra khi công việc chạy.' },
    ],
    notes: ['Chi phí là dự toán theo cấu hình, không phải hóa đơn của nhà cung cấp. Khi timeout, lời gọi có thể đã bị tính phí; kiểm tra khoản Chưa xác định trước khi chấp nhận gọi lại.'],
    links: [{ label: 'Kênh nội dung', href: '/?view=channels' }, { label: 'Nhà cung cấp AI', href: '/?view=providers' }, { label: 'Sử dụng & chi phí', href: '/?view=costs' }],
  },
  {
    id: 'y-tuong', title: 'Ý tưởng và nghiên cứu nguồn',
    summary: 'Từ gợi ý chủ đề đến nguồn tham khảo có thể kiểm tra.',
    steps: [
      { title: 'Khám phá ý tưởng', text: 'Chọn kênh trong Khám phá ý tưởng và bấm Khám phá 5 ý tưởng. Xem vấn đề, khán giả, góc khai thác, hook, điểm phù hợp/khả thi và dự toán. Bấm Phát triển thành video để đưa chủ đề vào form tạo video.' },
      { title: 'Bật nghiên cứu theo kênh', text: 'Vào Thương hiệu & mẫu → Nghiên cứu, tránh trùng và QA. Bật Đọc nguồn và đối chiếu bằng AI trước khi viết, nhập tối đa 10 URL bài viết/RSS, mỗi dòng một URL, rồi lưu cấu hình. Nếu không có URL, cần provider Brave để tìm nguồn.' },
      { title: 'Đọc bằng chứng trước khi duyệt', text: 'Mở chi tiết video → Nghiên cứu và đối chiếu nguồn để đọc brief, trích đoạn và liên kết gốc. Host nguồn cần được quản trị viên cho phép. Có thể bật embeddings để cảnh báo chủ đề gần trùng; chức năng này có thêm chi phí AI.' },
    ],
    notes: ['Gợi ý AI không phải dữ liệu xu hướng thời gian thực. Điểm đánh giá và hai nguồn trích dẫn không bảo đảm thông tin chính xác; người biên tập vẫn cần đọc nguồn.'],
    links: [{ label: 'Khám phá ý tưởng', href: '/?view=topics' }, { label: 'Thiết lập nghiên cứu', href: '/?view=templates' }],
  },
  {
    id: 'kich-ban', title: 'Kịch bản, storyboard và trợ lý AI',
    summary: 'Chỉnh từng phân cảnh, giữ phiên bản và chủ động kiểm soát nội dung AI.',
    steps: [
      { title: 'Sửa và lưu từng phiên bản', text: 'Mở một video trong Kịch bản AI, Storyboard hoặc Xưởng video. Sửa tiêu đề, lời thoại, chữ trên màn hình, prompt ảnh và thời lượng scene. Bấm Lưu phiên bản để lưu vào hệ thống; Dựng phiên bản đã lưu sử dụng bản đã lưu gần nhất.' },
      { title: 'Thiết kế chuyển động và đồ họa', text: 'Mỗi scene có lựa chọn chuyển động như pan hoặc parallax, chuyển cảnh cắt/hòa trộn và đồ họa thanh, các bước hoặc thẻ số liệu. Nhập tiêu đề, nhãn và giá trị, xem preview rồi lưu. Parallax là hiệu ứng hai lớp từ cùng ảnh, không tự tách chủ thể.' },
      { title: 'Khóa và khôi phục scene', text: 'Dùng nút khóa để bảo vệ scene khỏi thay đổi. Mở khóa trước khi sửa scene đó. Danh sách Khôi phục phiên bản giúp lấy lại nội dung cũ thành revision mới; hãy lưu bản đang sửa trước khi tải lại hoặc khôi phục.' },
      { title: 'Dùng Trợ lý biên tập AI', text: 'Lưu sửa tay trước, sau đó chọn viết lại một scene, tạo ba hook hoặc đổi thời lượng. Xem đề xuất rồi bấm Áp dụng. Scene khóa được giữ nguyên. Nếu kịch bản đã đổi trong lúc AI chạy, đề xuất cũ không còn áp dụng được. Ba hook giữ ngân sách bằng ba lần mức viết kịch bản.' },
    ],
    notes: ['Sửa hoặc áp dụng đề xuất tạo revision mới, vô hiệu đầu ra và phê duyệt cũ. Cần dựng, xem và duyệt lại đúng phiên bản.'],
    links: [{ label: 'Kịch bản AI', href: '/?view=scripts' }, { label: 'Storyboard', href: '/?view=storyboard' }],
  },
  {
    id: 'thuong-hieu', title: 'Thương hiệu, giọng đọc và tài sản',
    summary: 'Chuẩn hóa hình ảnh, âm thanh và phụ đề cho các video mới của kênh.',
    steps: [
      { title: 'Tải tài sản có quyền sử dụng', text: 'Trong Thư viện tài sản → Tài sản có quyền sử dụng, chọn logo PNG/JPEG/WebP, nhạc MP3/WAV hoặc footage MP4 H.264. Mỗi file tối đa 30 MB. Nhập nguồn/giấy phép và xác nhận quyền sử dụng trước khi tải lên.' },
      { title: 'Lưu cấu hình dựng cho kênh', text: 'Vào Thương hiệu & mẫu → Thiết lập dựng phim & thương hiệu, chọn kênh. Chọn ảnh AI, clip, hybrid, thẻ nội dung hoặc footage; đặt FPS, chuyển cảnh, logo, nhạc nền, intro/outro và màu sắc. Footage cần tài sản video đã tải lên; tạo clip cần Runway.' },
      { title: 'Chọn giọng và phụ đề', text: 'Giọng đọc được chọn trong Cấu hình kênh. Trong thiết lập dựng, điều chỉnh tốc độ và hướng dẫn giọng, font/màu/lề phụ đề. Căn thời gian Ước lượng theo audio không cần alignment; Theo từng từ cần ElevenLabs và cho phép tô từ theo lời đọc.' },
      { title: 'Tái sử dụng mẫu và bộ thương hiệu', text: 'Đặt tên rồi Lưu phiên bản mẫu hoặc Lưu bộ thương hiệu. Khi nạp mẫu, bấm Lưu cấu hình dựng để áp dụng cho kênh. Cấu hình được chụp lại khi tạo video mới; video đã tồn tại giữ cấu hình riêng.' },
    ],
    notes: ['Thư viện cũng hiển thị ảnh, âm thanh và clip thật theo scene/revision sau sản xuất. Khi xóa một tài sản đã tải lên, kiểm tra lại các cấu hình kênh đang tham chiếu đến tài sản đó.'],
    links: [{ label: 'Thương hiệu & mẫu', href: '/?view=templates' }, { label: 'Thư viện tài sản', href: '/?view=assets' }, { label: 'Giọng đọc & âm thanh', href: '/?view=voices' }],
  },
  {
    id: 'kiem-tra', title: 'Dựng, kiểm tra QA và tải video',
    summary: 'Biết khi nào thành phẩm sẵn sàng và cần làm gì trước khi phê duyệt.',
    steps: [
      { title: 'Theo dõi quá trình sản xuất', text: 'Xưởng video hiển thị trạng thái từng video. Trong chi tiết, bấm Làm mới video để xem kết quả mới. Hàng đợi xuất bản có cả Hàng đợi sản xuất với bước hiện tại, số lần thử và lỗi.' },
      { title: 'Kiểm tra thành phẩm', text: 'Khi có preview, xem toàn bộ video, nghe giọng đọc/nhạc, đọc phụ đề và kiểm tra chữ, hình, nguồn. QA kiểm tra kỹ thuật như track, thời lượng và phụ đề; điểm QA không thay thế việc kiểm tra nội dung.' },
      { title: 'Phê duyệt đúng phiên bản', text: 'Chủ sở hữu hoặc Người duyệt mở video Chờ phê duyệt, xác nhận đã xem video và có quyền sử dụng tài sản, rồi Phê duyệt video. Video chưa đạt QA cần được sửa và dựng lại trước khi duyệt.' },
      { title: 'Tải file và tạo bản xuất', text: 'Dùng MP4 để tải video, SRT/VTT để tải phụ đề. Trong Chi phí dự kiến & xuất phiên bản, có thể tạo bản xuất khác. Bản TikTok bỏ logo và thẻ intro/outro thương hiệu; mỗi bản phải được xem, kiểm tra và duyệt riêng.' },
    ],
    notes: ['Bạn có thể tải MP4 để đăng thủ công khi xuất bản API chưa bật. Phê duyệt trong studio chưa tự tạo bài đăng trên mạng xã hội.'],
    links: [{ label: 'Xưởng video', href: '/?view=production' }, { label: 'Xem hàng đợi', href: '/?view=publishing' }],
  },
  {
    id: 'lich', title: 'Lịch nội dung và chiến dịch',
    summary: 'Tính ngược thời gian chuẩn bị từ giờ dự kiến đăng và theo dõi từng mốc.',
    steps: [
      { title: 'Tạo một lịch sản xuất', text: 'Vào Lịch nội dung → Tạo lịch. Chọn kênh, chủ đề, thời lượng và tên lịch. Chọn mốc Giờ dự kiến đăng để tính ngược, hoặc Giờ bắt đầu nghiên cứu. Nhập cron 5 trường và múi giờ, hoặc chọn thời điểm chạy một lần; lịch một lần được ưu tiên nếu nhập cả hai.' },
      { title: 'Chừa thời gian chuẩn bị và duyệt', text: 'Ví dụ: dự kiến đăng 12:00, tổng chuẩn bị 270 phút, nghiên cứu trước sản xuất 30 phút và duyệt trước đăng 30 phút → nghiên cứu 07:30, sản xuất 08:00, deadline 11:30. Khi tạo lịch, cả mốc nghiên cứu phải còn ở tương lai.' },
      { title: 'Chọn múi giờ chính xác', text: 'Cron 0 7,14 * * * nghĩa là 07:00 và 14:00 mỗi ngày theo múi giờ đã chọn, ví dụ Asia/Ho_Chi_Minh. Ô ngày giờ một lần dùng giờ trên máy của bạn. Lưới lịch nhóm theo ngày UTC; xem mốc và múi giờ ghi trên sự kiện để đối chiếu.' },
      { title: 'Quản lý các lần chạy', text: 'Chuyển giữa Tháng, Tuần, Ngày, Danh sách và Kanban; tạm dừng/tiếp tục hoặc dời lần chạy kế tiếp. Chiến dịch gom chủ đề, thời gian, số video và ngân sách; tạo lịch gắn với chiến dịch để chạy. Chỉ duyệt hàng loạt những video đã xem.' },
    ],
    notes: ['Giờ dự kiến đăng trong lịch sản xuất là mốc kế hoạch. Gửi bài lên nền tảng là bước riêng sau phê duyệt. Deadline có cảnh báo quá hạn, không bảo đảm AI sẽ xử lý xong đúng giờ.'],
    links: [{ label: 'Lịch nội dung', href: '/?view=calendar' }],
  },
  {
    id: 'xuat-ban', title: 'Kết nối và xuất bản YouTube / TikTok',
    summary: 'Kết nối tài khoản, xem lại nội dung và đồng ý gửi đúng video tới đúng nơi.',
    steps: [
      { title: 'Kết nối nền tảng', text: 'Chủ sở hữu vào Kết nối nền tảng → Cấu hình ứng dụng YouTube/TikTok. Nhập Client ID hoặc Client Key và Client Secret của studio, rồi Lưu cấu hình. Sao chép Redirect URI vào ứng dụng developer; TikTok có thêm Webhook URL riêng sau khi lưu. Bấm Kết nối để cấp quyền cho tài khoản. Mỗi studio lưu cấu hình riêng, không cần sửa file .env. Trạng thái Xuất bản API đang tắt vẫn cần người vận hành bật khi sẵn sàng.' },
      { title: 'Chuẩn bị bài đăng', text: 'Chủ sở hữu hoặc Người duyệt mở video Đã duyệt → Chuẩn bị xuất bản. Xem preview, chọn tài khoản đích, tiêu đề/caption, mô tả, tags, quyền riêng tư và khai báo nội dung dành cho trẻ em. Video được khai báo là có nội dung tạo bởi AI.' },
      { title: 'Chọn luồng phù hợp', text: 'YouTube cho phép gửi thumbnail và hẹn công khai; khi hẹn giờ cần chọn private. TikTok có Direct Post khi ứng dụng/tài khoản đủ điều kiện, hoặc Gửi hộp thư TikTok để bạn hoàn tất trong ứng dụng TikTok. Tài khoản cần quyền phù hợp với luồng đã chọn.' },
      { title: 'Xác nhận và theo dõi', text: 'Xác nhận đã xem preview, quyền âm thanh và đồng ý gửi. Bấm Đồng ý và xếp lịch gửi, rồi theo dõi Hàng đợi xuất bản. Hoàn tất trong TikTok nghĩa là bạn còn phải mở TikTok; Đã tải lên riêng tư chưa có nghĩa là video đã công khai.' },
    ],
    notes: ['Secret không hiển thị lại; để trống khi lưu sẽ giữ secret hiện tại nếu Client ID/Key không đổi. Đổi hoặc xóa cấu hình sẽ yêu cầu xác nhận ngắt tài khoản của studio và hủy yêu cầu đăng đang chờ; sau đó kết nối lại. Khi trạng thái Cần đối soát xuất hiện, dùng Đối soát để kiểm tra kết quả trên nền tảng trước khi gửi lại. Chỉ hủy trong studio khi yêu cầu chưa bắt đầu upload; nội dung đã gửi cần được quản lý trực tiếp trên nền tảng.'],
    links: [{ label: 'Kết nối nền tảng', href: '/?view=connections' }, { label: 'Hàng đợi xuất bản', href: '/?view=publishing' }],
  },
  {
    id: 'cong-tac', title: 'Thành viên, vai trò và bảo mật',
    summary: 'Chia sẻ workspace với đúng quyền và bảo vệ tài khoản của bạn.',
    steps: [
      { title: 'Hiểu bốn vai trò', text: 'Chủ sở hữu quản lý workspace, provider, kết nối và thành viên, đồng thời được sản xuất/duyệt. Biên tập viên tạo và sửa nội dung, cấu hình sản xuất và lịch. Người duyệt xem, phê duyệt và xuất bản. Người xem đọc dữ liệu và tải tài sản trong workspace; không được thay đổi nội dung.' },
      { title: 'Mời và quản lý thành viên', text: 'Chủ sở hữu mở Cài đặt tài khoản, nhập email/vai trò để tạo liên kết mời rồi tự chia sẻ. Liên kết dùng một lần, hết hạn sau 7 ngày; hệ thống chưa tự gửi email mời. Có thể thu hồi lời mời, đổi vai trò hoặc xóa thành viên; luôn phải còn ít nhất một chủ sở hữu.' },
      { title: 'Chuyển workspace', text: 'Dùng bộ chọn trong Cài đặt tài khoản. Dữ liệu kênh, video, provider và chi phí thuộc workspace đang chọn. Nếu không thấy nội dung mong đợi, kiểm tra workspace và tài khoản trước.' },
      { title: 'Bật xác thực hai bước', text: 'Trong Bảo mật tài khoản, nhập mật khẩu hiện tại, thiết lập Authenticator, xác nhận mã rồi lưu mã khôi phục ở nơi an toàn. Mã khôi phục dùng một lần. Đăng nhập lại sau khi bật. Quên mật khẩu sử dụng email reset nếu máy chủ đã cấu hình SMTP; tài khoản bật 2FA vẫn cần mã xác thực.' },
    ],
    links: [{ label: 'Cài đặt tài khoản', href: '/?view=settings' }],
  },
  {
    id: 'hieu-qua', title: 'Hiệu quả, thông báo và nhật ký',
    summary: 'Đọc số liệu thật và tìm nguyên nhân khi quy trình cần được xử lý.',
    steps: [
      { title: 'Đọc analytics', text: 'Phân tích hiệu quả đồng bộ số liệu chính thức của bài đăng theo giờ khi tài khoản đã có đủ quyền. Số liệu chưa được API cung cấp hiển thị trống. Đề xuất AI cần dữ liệu bài đăng và provider; yêu cầu phân tích có thể phát sinh phí.' },
      { title: 'So sánh A/B', text: 'Tạo thử nghiệm theo kênh với hai hướng viết A/B và chỉ số cần theo dõi. Hệ thống phân bổ video mới giữa các nhánh, so sánh theo tuổi bài 24–48 giờ. Đây là so sánh các video khác nhau, không phải thử hai thumbnail trên cùng video.' },
      { title: 'Xử lý thông báo', text: 'Thông báo báo video sẵn sàng, lỗi hoặc quá hạn. Đánh dấu đã đọc sau khi xử lý. Nhật ký hệ thống giúp truy vết thao tác và đối tượng thay đổi; khi báo lỗi, gửi mã video/job và thông báo lỗi, không gửi API key hay mã khôi phục.' },
    ],
    links: [{ label: 'Phân tích hiệu quả', href: '/?view=analytics' }, { label: 'Thông báo', href: '/?view=notifications' }, { label: 'Nhật ký hệ thống', href: '/?view=logs' }],
  },
];

export const troubleshooting = [
  { question: 'Video đứng ở Trong hàng đợi hoặc Đã lên lịch?', answer: 'Kiểm tra mốc nghiên cứu/sản xuất đã đến chưa. Nếu đã đến, kiểm tra Hàng đợi sản xuất và nhờ người vận hành xác nhận worker, PostgreSQL và Redis đang chạy. Trên máy local, worker chạy bằng npm run worker ở terminal riêng. Bấm Làm mới video để cập nhật chi tiết.' },
  { question: 'API key sai, model không dùng được hoặc thiếu provider?', answer: 'Chủ sở hữu kiểm tra Nhà cung cấp AI: cấu hình có đang bật, key còn dùng được, model và loại adapter có đúng khả năng cần thiết. Kiểm tra provider ưu tiên của kênh. Sau khi sửa, mở video lỗi và Thử lại từ checkpoint. Không đưa API key vào nội dung video hoặc nhật ký chia sẻ.' },
  { question: 'Vượt ngân sách hoặc chi phí Chưa xác định?', answer: 'Mở Sử dụng & chi phí và kiểm tra ngân sách tháng của kênh. Timeout có thể xảy ra sau khi nhà cung cấp đã tính tiền. Đối chiếu ở nhà cung cấp trước; chỉ chọn Cho phép chi phí bổ sung và thử lại khi chấp nhận khả năng bị tính thêm trong ngân sách.' },
  { question: 'Không lưu được vì phiên bản đã thay đổi?', answer: 'Một người khác hoặc công việc AI có thể đã cập nhật video. Sao chép phần sửa tay cần giữ, tải lại video, so sánh với bản mới rồi sửa và lưu lại. Không áp dụng đề xuất AI đã hết hiệu lực lên bản mới.' },
  { question: 'Không đọc được URL nguồn hoặc không tải được media?', answer: 'Kiểm tra URL công khai và host chính xác đã có trong danh sách cho phép của máy chủ. Địa chỉ nội bộ bị chặn. Với file tải lên, kiểm tra định dạng, giới hạn 30 MB và quyền sử dụng. Với clip AI, người vận hành cần cho phép host trả media của provider.' },
  { question: 'Video Chưa đạt QA hoặc phụ đề/âm thanh lệch?', answer: 'Mở video và đọc từng kiểm tra QA hoặc lỗi. Rút gọn lời thoại quá dài, điều chỉnh thời lượng scene, tốc độ giọng và vùng an toàn phụ đề rồi lưu/dựng lại. Nếu cần căn từng từ, chọn ElevenLabs trong cấu hình cho video mới. Luôn xem thành phẩm sau khi dựng.' },
  { question: 'Tạo lịch báo thời điểm ở quá khứ?', answer: 'Khi dùng mốc giờ đăng, hệ thống trừ toàn bộ thời gian chuẩn bị. Ví dụ muốn đăng sau 1 giờ nhưng đặt chuẩn bị 270 phút thì giờ nghiên cứu đã qua. Dời giờ đăng xa hơn hoặc giảm thời gian chuẩn bị hợp lý, đồng thời kiểm tra múi giờ.' },
  { question: 'Không thấy nút đăng hoặc tài khoản TikTok chưa đăng công khai?', answer: 'Video phải đạt QA, được duyệt đúng revision, tài khoản có quyền và xuất bản API được bật. Direct Post còn cần điều kiện riêng. Với Gửi hộp thư TikTok, mở ứng dụng TikTok để hoàn tất; kiểm tra Hàng đợi xuất bản để biết trạng thái thật.' },
  { question: 'Không có quyền thực hiện thao tác?', answer: 'Kiểm tra workspace đang chọn và vai trò trong Cài đặt tài khoản. Nhờ chủ sở hữu cấp quyền phù hợp: Biên tập viên sản xuất, Người duyệt phê duyệt/xuất bản, Chủ sở hữu quản lý provider và thành viên.' },
  { question: 'Không nhận được email đặt lại mật khẩu?', answer: 'Kiểm tra email đăng ký và thư rác. Email reset cần SMTP hoạt động trên máy chủ; nhờ người vận hành kiểm tra cấu hình nếu không nhận được thư. Liên kết mời workspace được người mời tự chia sẻ và không dùng luồng email reset.' },
];
