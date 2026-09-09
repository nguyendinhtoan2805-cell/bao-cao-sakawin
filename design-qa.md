# Order Design & Media — QA ngày 09/09/2026

## Phạm vi

Module Order đã phát hành trên production, mã ứng dụng e46eb57. Dữ liệu Design, Media và Buổi quay đọc/ghi trực tiếp vào ba bảng Lark đã cấu hình. Các bài kiểm thử không chứa hồ sơ thật hoặc khóa bí mật.

Ảnh bố cục dữ liệu giả nằm tại tests/order-ui-evidence/: desktop.png, mobile.png, design.png, script-link.png, detail-table.png. Đã kiểm tra viewport desktop 1546 × 1017, laptop 1265 × 712 và điện thoại 390 × 844 trong giai đoạn duyệt giao diện.

## Kết quả thị giác

- Giữ đúng bố cục báo cáo chung, hai tab, danh sách buổi quay bên trái và bốn cột tiến độ bên phải; bảng chi tiết nằm dưới theo yêu cầu bổ sung.
- Giữ logo và họa tiết có sẵn của Sakawin, kiểu chữ Be Vietnam Pro và màu sắc workspace hiện có.
- Có khác biệt chủ động so với hình: trạng thái kết nối và giải thích kỳ báo cáo làm phần đầu cao hơn; thẻ hiển thị số liệu tính từ fixture, không dùng số minh hoạ vẽ trong ảnh.
- Menu chỉ hiển thị trang mà tài khoản mẫu được phép xem. Không hiển thị giả các trang tài chính/nhân sự.
- P2 đã sửa và xem lại: logo chiếm toàn chiều ngang làm menu điện thoại bị khuất; trường tháng bị cắt chữ; vùng nhập kịch bản có thể bị tiêu đề sticky che; laptop không đủ chỗ cho bốn cột.
- Desktop không tràn ngang toàn trang. Trên điện thoại, bảng báo cáo, lịch và kanban cuộn bên trong; menu chính đã hiện đủ với tài khoản mẫu.
- Header cột có flex-shrink bằng 0, danh sách thẻ có vùng cuộn riêng, giữ màu/tiêu đề khi nhiều task.
- P3 còn khác với ảnh ý tưởng: icon trang trí và avatar trong thẻ giản lược, mật độ thẻ nhỏ hơn; đây chưa phải bản sao pixel tuyệt đối của ảnh.
- Không còn lỗi P0/P1/P2 được quan sát trong các màn đã kiểm tra. Chưa kiểm tra thiết bị di động thật. API production đã đọc đầy đủ hơn 2.600 order; chưa thử tải cao nhiều người đồng thời.

## Kiểm thử tự động

73/73 đạt: 32 phân quyền hiện có và 41 Order. Lệnh:

```sh
node --test --test-reporter=dot tests/order.test.cjs tests/access-control.test.js
node --check assets/order/order.js
git diff --check
```

Phạm vi: quyền xem/ghi/duyệt riêng, stale revision, chống tạo trùng, phân trang, đọc lại sau ghi, lịch quay tự xếp, cổng duyệt việc quan trọng, từ chối lịch sử lỗi, mốc hoàn thành và thay đổi đầu ra, giữ Progress cũ, Media chỉ dùng cột hiện có + Lịch sử. Hồi quy định dạng Lark thực tế gồm rich relation chứa record_ids và trường số trả dạng chuỗi.

## Kiểm tra trình duyệt bằng dữ liệu giả

- Chọn buổi lọc bảng tiến độ và chi tiết; chọn nhiều kịch bản để chuyển buổi.
- Tạo order và buổi quay; lưu link kịch bản, mở lại đúng giá trị; không có trình viết kịch bản trên web.
- Design không có giờ dự kiến hoặc duyệt thành phẩm. Lưu thành phẩm, chuyển Hoàn thành và xem người/thời gian/nội dung thay đổi trong Lịch sử.
- Media tạo có mã video, lưu bước Sẵn sàng quay và tải lại giữ đúng bước.
- Tài khoản chỉ có quyền Order mở trang gốc tự chuyển tới Order trước khi gọi API báo cáo; menu không hiện tài chính/nhân sự ngoài quyền.

## Kiểm tra production

- Vercel deployment dpl_GsMETpaEasPcLQ7tG555hr2XTqMs Ready, tên miền chính trỏ đúng bản ứng dụng e46eb57.
- Đã thêm quyền Tenant wiki:node:read đúng phạm vi được đồng ý. Không xuất khóa production về máy. ORDER_WRITES_ENABLED=true.
- Chưa đăng nhập: /api/orders, /api/doanh-so, /api/tai-chinh, /api/quy-luong, /api/nhan-su, /api/tuyen-dung đều trả 401.
- Sau đăng nhập: API đọc đủ Design, Media, Buổi quay; cấu trúc không còn trường bắt buộc thiếu.
- Dùng đúng ba bản ghi KIỂM THỬ riêng: tạo/lưu Design, chuyển Đã nhận order; tạo Media, chuyển Sẵn sàng quay; tạo buổi và xếp Media vào buổi. Server đọc lại xác nhận lưu thành công, Lịch sử hiện thao tác.
- Design gặp lỗi đối chiếu số dạng chuỗi trong lần thử đầu; retry cùng mã chống trùng không tạo thêm bản ghi. Đã sửa và kiểm tra lưu lại thành công.
- Liên kết Media đã ghi vào Lark nhưng rich relation làm đối chiếu báo sai ở lần thử đầu; đã sửa parser, kiểm tra xếp buổi lại thành công.
- Đã xóa cả ba bản ghi thử qua Lark (thao tác có thể khôi phục), tải lại production xác nhận 1.695 Design / 987 Media / 6 dòng Buổi quay và không còn dữ liệu thử.
- Không có lỗi console được quan sát trong các màn kiểm tra. Không thử chỉnh sửa hay duyệt các order thật đang vận hành.

## Giới hạn kiểm chứng

Duyệt quan trọng, hoàn thành, mở lại và các tình huống tranh chấp được kiểm tra bằng bộ kiểm thử dữ liệu giả, chưa chạy hết trên production. Chưa kiểm tra tải cao nhiều người cùng thao tác. Thay đổi trực tiếp trong Lark có thể xung đột với ghi web; Lịch sử cần tránh chỉnh tay. Web không phát hiện tự động sửa nội dung Drive khi giữ nguyên URL. Order cũ thiếu mốc hoàn thành không được tự tính vào sản lượng tháng.

Cấu trúc và hướng dẫn vận hành: ORDER-SETUP.md.
