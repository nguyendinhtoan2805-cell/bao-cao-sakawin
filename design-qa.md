# Order Design & Media — QA bản phát triển 09/09/2026

## Phạm vi và bằng chứng

Đây là báo cáo cho module Order trên nhánh codex/order-design-media, chưa phải xác nhận production.
Đã đối chiếu ảnh phương án kết hợp được chọn với ảnh desktop thực tế trong cùng một lượt xem ảnh.
Tham chiếu: exec-ea8dd40a-4851-4bee-8f0a-df641c928877.png trong thư mục generated_images của phiên thiết kế.
Viewport kiểm tra: desktop 1546 × 1017, laptop 1265 × 712, điện thoại 390 × 844. Đã reset viewport sau kiểm tra.

Ảnh tại tests/order-ui-evidence/: desktop.png, mobile.png, design.png, script-link.png, detail-table.png.
Ảnh chỉ chứa dữ liệu giả. API của preview dùng service thật với adapter bộ nhớ; không gọi Lark.

## Kết quả thị giác

- Giữ đúng bố cục báo cáo chung, hai tab, danh sách buổi quay bên trái và bốn cột tiến độ bên phải; bảng chi tiết nằm dưới theo yêu cầu bổ sung.
- Giữ logo và họa tiết có sẵn của Sakawin, kiểu chữ Be Vietnam Pro và màu sắc workspace hiện có.
- Có khác biệt chủ động so với hình: trạng thái kết nối và giải thích kỳ báo cáo làm phần đầu cao hơn; thẻ hiển thị số liệu tính từ fixture, không dùng số minh hoạ vẽ trong ảnh.
- Menu chỉ hiển thị trang mà tài khoản mẫu được phép xem. Không hiển thị giả các trang tài chính/nhân sự.
- P2 đã sửa và xem lại: logo chiếm toàn chiều ngang làm menu điện thoại bị khuất; trường tháng bị cắt chữ; vùng nhập kịch bản có thể bị tiêu đề sticky che; laptop không đủ chỗ cho bốn cột.
- Desktop không tràn ngang toàn trang. Trên điện thoại, bảng báo cáo, lịch và kanban cuộn bên trong; menu chính đã hiện đủ với tài khoản mẫu.
- Header cột có flex-shrink bằng 0, danh sách thẻ có vùng cuộn riêng, giữ màu/tiêu đề khi nhiều task.
- P3 còn khác với ảnh ý tưởng: icon trang trí và avatar trong thẻ giản lược, mật độ thẻ nhỏ hơn; đây chưa phải bản sao pixel tuyệt đối của ảnh.
- Không còn lỗi P0/P1/P2 được quan sát trong các màn đã kiểm tra. Chưa kiểm tra thiết bị di động thật hay các bộ dữ liệu Lark lớn.

## Kiểm tra tương tác

- Chọn buổi lọc đồng thời bảng tiến độ và bảng chi tiết.
- Chọn nhiều kịch bản và chuyển buổi, đọc lại thấy liên kết mới.
- Tạo order bằng dữ liệu giả; kiểm tra ngày bắt buộc.
- Tạo buổi quay trên viewport điện thoại, nhập giờ bắt đầu/kết thúc, Host và người quay; buổi mới xuất hiện trong danh sách.
- Theo quyết định mới, bỏ editor 7 phần. Đã thử lưu link kịch bản rồi mở lại đúng giá trị; không còn form viết nội dung. Kiểm tra báo cáo lấy người viết từ NGƯỜI ORDER, không phát sinh lỗi console.
- Đổi qua Design và Media; kiểm tra bảng chi tiết và form đọc/sửa.
- Không có warning/error trong log trình duyệt khi kiểm tra.
- 62 kiểm thử Node đạt: 32 phân quyền cũ và 30 kiểm thử Order, gồm kiểm tra quyền riêng, stale revision, ghi lặp, phân trang, đọc lại sau ghi, cổng duyệt, lịch quay tự xếp và dùng lại ứng dụng Lark theo cấu hình tường minh.
- Đã kiểm tra trên trình duyệt: mở / với tài khoản giả chỉ có quyền Order tự chuyển đến /order.html. Menu không hiện các trang doanh số, tài chính hoặc quỹ lương. Điều hướng này cũng được kiểm thử tự động trước các lệnh tải báo cáo.

## Điều kiện trước khi phát hành

Cần đối chiếu các trường quy trình mới và nhân sự; chạy diagnostic chỉ đọc rồi kiểm thử ghi/đọc lại bằng bản ghi KIỂM THỬ. Đã nối menu và điều hướng cho tài khoản chỉ có quyền Order trên nhánh phát triển. Đã xác nhận ứng dụng dùng chung có quyền sửa tại cả hai Base qua giao diện Lark; chưa xác minh API thật. Chưa push GitHub, chưa deploy, chưa ghi dữ liệu Base thật. Xem ORDER-SETUP.md.

Cập nhật Media: Duyệt kịch bản là một cột lựa chọn đơn; bằng chứng duyệt gắn phiên bản được lưu trong Nhật ký. Kiểm thử xác nhận không thể tự gửi trạng thái đã duyệt qua API, và sửa tài liệu sẽ hủy kết quả cũ. Các ảnh desktop/Design trước đó ghi nhận bố cục; ảnh script-link.png ghi nhận form hiện tại.

## Điều chỉnh Design ngày 09/09/2026

- Dùng MÃ DESIGN, Người Order, Trạng thái; chỉ thêm Lịch sử. Không dùng các cột duyệt, giờ dự kiến, ngày hoàn thành riêng của Design. Media giữ nguyên quy trình.
- Kiểm thử: tạo lặp không trùng và không ghi đè MÃ DESIGN; lưu nối tiếp lịch sử; giữ mốc hoàn thành khi lưu lặp; bỏ mốc khi mở lại/sửa đầu ra; không tự gán ngày cho order cũ; không ghi đè lịch sử hỏng; trạng thái thiếu dừng trước khi ghi; kiểm tra transport và đọc lại.
- Trình duyệt với dữ liệu giả: tab Design không có trường giờ hoặc duyệt thành phẩm; lưu link ảnh, chuyển Hoàn thành và mở Lịch sử thấy tên người lưu, thời gian, trạng thái và link thay đổi. Chưa kiểm thử ghi vào Lark thật.
