# Thiết lập Order Design & Media — bản phát triển ngày 09/09/2026

## Trạng thái và phạm vi

- Bản phát triển ở nhánh `codex/order-design-media`, tách khỏi website đang chạy.
- Chưa xác minh kết nối API thật tới hai Base Order. Đọc được Base bằng trình duyệt không đồng nghĩa ứng dụng đã được cấp quyền API.
- Bản xem thử dùng dữ liệu giả, không ghi Lark thật. Chưa deploy module Order.
- Đã chốt: nhân sự tự tạo/xếp buổi quay; chỉ kịch bản/thành phẩm được đánh dấu quan trọng mới cần Lead duyệt.
- Kịch bản được viết trong tài liệu riêng (Drive hoặc nguồn đang dùng), gắn link vào cột KỊCH BẢN hiện có. Web chỉ quản lý quy trình; không có form viết kịch bản.

## Bước 1 — tạo bảng Buổi quay trong Base Media

Trong Base ORDER MEDIA, tạo một bảng **Buổi quay**. Giữ nguyên bảng **Oder Media + Tiktok (active)**.

| Tên cột chính xác | Kiểu | Thiết lập |
|---|---|---|
| Tên buổi quay | Văn bản | Cột đầu tiên |
| Bắt đầu | Ngày | Bật giờ |
| Kết thúc | Ngày | Bật giờ |
| Địa điểm | Văn bản | |
| Host | Người | Cho chọn nhiều |
| Người quay | Người | Cho chọn nhiều |
| Ghi chú | Văn bản | |

Tạo xong gửi đường dẫn bảng để đối chiếu table ID. Bảng này chưa cần nhập lịch thật khi kết nối chưa được kiểm thử.

## Bước 2 — liên kết order với buổi quay

Trong bảng **Oder Media + Tiktok (active)** thêm:

| Tên cột | Kiểu | Thiết lập |
|---|---|---|
| Buổi quay | Liên kết bản ghi / liên kết một chiều | Liên kết đúng bảng Buổi quay; mỗi order chọn một buổi |

Một buổi chứa nhiều order nhờ nhiều dòng order cùng trỏ tới buổi đó. Không tạo một cột riêng cho mỗi ngày quay. Không dùng cột `Các mục mẹ` cho mục đích khác nếu chưa kiểm tra các liên kết đang có.

## Bước 3 — các trường mới phục vụ quy trình

Thêm **8 cột chung sau vào cả hai bảng order Design và Media**. Đây là các trường mới; giữ nguyên tên và kiểu của các trường cũ.

| Tên cột | Kiểu | Mục đích |
|---|---|---|
| Mã yêu cầu | Văn bản | Nhận diện yêu cầu tạo, tránh gửi trùng |
| Người tạo | Văn bản | Tài khoản web thực hiện tạo order |
| Tiến độ chi tiết | Văn bản | Bước chi tiết; giữ lại Trạng thái/Progress để báo cáo cũ tiếp tục dùng |
| Cần duyệt thành phẩm | Hộp kiểm | Đánh dấu thành phẩm quan trọng |
| Duyệt thành phẩm | Văn bản | Kết quả, người duyệt, thời điểm và dấu phiên bản |
| Hoàn thành lúc | Ngày | Bật giờ; tính sản lượng đúng tháng hoàn thành |
| Nhật ký | Văn bản | Lịch sử thay đổi; web ghi dữ liệu có cấu trúc |
| Giờ dự kiến | Số | Ước lượng công sức của cả order |

**Media chỉ thêm 1 cột ngoài cột Buổi quay ở bước 2:**

| Tên cột | Kiểu | Các lựa chọn chính xác |
|---|---|---|
| Duyệt kịch bản | Lựa chọn đơn | Không cần duyệt; Cần duyệt; Chờ duyệt; Cần sửa; Đã duyệt |

Người viết chính là NGƯỜI ORDER hiện có. Không thêm Người viết, Kịch bản trên web hoặc Cần duyệt kịch bản. Kết quả duyệt lưu người duyệt, thời điểm và dấu phiên bản trong Nhật ký; chỉ đổi lựa chọn thành Đã duyệt chưa đủ để web công nhận phê duyệt. Tạo trường mới, chưa điền hàng loạt cho dữ liệu cũ.

**Bảng Buổi quay thêm 3 cột hệ thống:** `Mã yêu cầu`, `Người tạo`, `Nhật ký`, đều là **Văn bản**.

Tổng cộng: Design thêm 8 cột; Media thêm 10 cột; bảng Buổi quay có 7 cột công việc và 3 cột hệ thống.

Không tự chuyển hàng loạt trạng thái hay gán ngày hoàn thành cho dữ liệu cũ. Thiếu ngày hoàn thành thì hiển thị rõ, không đoán tháng sản lượng.

## Bước 4 — cấp kết nối ứng dụng Lark

Người dùng đã chọn dùng lại ứng dụng **WEBAPP BC Doanh số**. Đối chiếu App ID để chắc chắn đúng ứng dụng đang cấu hình trên Vercel; khi khớp, bật ORDER_USE_EXISTING_LARK_APP=true để dùng LARK_APP_ID/LARK_APP_SECRET hiện có. Không thay các giá trị cũ. Module Order vẫn chỉ gọi ba bảng đã cấu hình. Quyền API của ứng dụng dùng chung áp dụng cho mọi bên đang sử dụng ứng dụng đó, nên không mở rộng quyền API ngoài nhu cầu đã kiểm tra.

1. Trong Lark Developer, chọn WEBAPP BC Doanh số. Không cần tạo ứng dụng mới.
2. Đã kiểm tra ngày 09/09/2026: ứng dụng đã phát hành và có scope bitable:app cùng bitable:app:readonly (Tenant token). Không cần mở rộng scope ở bước này.
3. Đã kiểm tra qua giao diện Lark: **cả hai Base Design và Media** đều có WEBAPP BC Doanh số với quyền Có thể chỉnh sửa. Không cần thêm lại. Giữ nguyên cấu hình và quyền của các Base cũ đang dùng chung ứng dụng.
4. Lấy **Base App Token thực**, không dùng wiki node token thay thế. Hai URL hiện tại là wiki URL nên phải đối chiếu token trước.
5. Cấu hình các biến trong `.env.order.example` vào môi trường riêng/Vercel. Giữ `ORDER_WRITES_ENABLED=false`.
6. Không gửi App Secret, SESSION_SECRET, Redis token qua chat hoặc commit vào Git. `.env.order.local` đã được bỏ qua bởi Git.

Các trường duyệt, ngày hoàn thành và nhật ký phải được bảo vệ khỏi chỉnh sửa trực tiếp tùy tiện trong Base. Quyền Lead trên web không thể ngăn một người có quyền sửa trực tiếp các cột này ở Lark. Cần rà soát quyền trường/bảng của Base trước khi dùng duyệt làm căn cứ vận hành.

## Bước 5 — kiểm tra chỉ đọc và đối chiếu nhân sự

Trong bản phát triển, khi đã có cấu hình riêng:

```sh
node --env-file=.env.order.local tools/check-order-connection.cjs
```

Công cụ chỉ đọc, báo số bản ghi và trường thiếu/sai kiểu, không in nội dung hồ sơ hay khóa bí mật. Có kết quả `readVerified: true` chưa có nghĩa đã kiểm tra ghi; công cụ luôn ghi rõ `writeVerified: false`.

- Media: Người Order là trường **Người**. Tài khoản web phải khớp email/open_id từ Lark. Nếu Lark không trả email, bổ sung ánh xạ `LARK_ORDER_USER_MAP` sau khi xác minh. Không suy đoán từ tên gần giống.
- Design: Người Order là **lựa chọn đơn**. Tên phải khớp đúng lựa chọn hiện có; ánh xạ có thể dùng `designName`. Không tự thêm lựa chọn khi chưa đối chiếu.
- Danh sách người order/người dựng/host/người quay được lấy từ người đã xuất hiện trong Base hoặc ánh xạ đã xác minh. Nhân sự mới chưa có trong nguồn cần được bổ sung rõ ràng.
- Media dùng cột THÁNG hiện có (ví dụ `T9.2026`); tháng mới phải có trong lựa chọn Lark trước khi tạo order thuộc tháng đó.

## Bước 6 — kiểm thử ghi có kiểm soát rồi mới đưa vào sử dụng

1. Hoàn tất cấu trúc và quyền; chạy lại bộ kiểm thử dữ liệu giả.
2. Cấp tài khoản thử ba quyền riêng: `xem_order`, `ghi_order`, `duyet_order`. Nhân sự thông thường chỉ cần hai quyền đầu; chỉ cấp quyền duyệt cho Lead.
3. Ở môi trường kiểm thử đã cấu hình đúng hai Base, bật ghi để tạo một order và một buổi có nhãn **KIỂM THỬ**, đọc lại để xác nhận. Không thử trên hồ sơ thật đang chạy.
4. Kiểm tra thêm xếp/chuyển buổi, phản hồi/duyệt việc quan trọng, ghi link thành phẩm và ngày hoàn thành. Việc không quan trọng không cần duyệt.
5. Chỉ bật trên production sau khi đối chiếu bản ghi thật và kiểm tra không ảnh hưởng các trang cũ.

Chưa tạo bất kỳ bản ghi KIỂM THỬ nào trong Lark trong đợt xây dựng giao diện ban đầu.

## Các giới hạn cần biết của bản đầu

- Sửa cùng lúc qua web được khóa ghi, và web kiểm tra bản ghi cũ trước khi cập nhật. Một thay đổi trực tiếp ở Lark xảy ra đúng giữa bước đọc và ghi vẫn có thể xung đột; adapter này không có giao dịch/conditional update xuyên Lark. Tránh sửa cùng order ở hai nơi trong lúc ghi.
- Nếu sửa nội dung Drive nhưng giữ nguyên URL, bấm **Đã sửa nội dung kịch bản**. Web không đọc/chỉnh Google Drive và không tự phát hiện phiên bản Drive.
- Bảng báo cáo cá nhân là **đóng góp trên sản phẩm đã hoàn thành**. Giờ dự kiến là của order, chưa phải giờ thực tế hay định mức lương/KPI.
- Chưa có thông báo Lark/nhắc việc tự động, chưa upload file gốc lên Drive. Thành phẩm được gắn bằng link.
- Nhánh phát triển đã thêm Order vào sidebar bảy trang hiện có và chuyển tài khoản chỉ có quyền Order đến /order.html. Production chưa có thay đổi này.

## Tham chiếu kỹ thuật

- [Lark API tạo bản ghi](https://open.larksuite.com/document/server-docs/docs/bitable-v1/app-table-record/create).
- [SDK chính thức: create record, client_token, user_id_type](https://github.com/larksuite/oapi-sdk-python/blob/v2_main/lark_oapi/api/bitable/v1/model/create_app_table_record_request.py).
- [Lark cấu trúc trường Base](https://open.larksuite.com/document/server-docs/docs/bitable-v1/app-table-field/guide).

Bảng BUỔI QUAY đã được người dùng tạo: tblGOY43BeI3yZPx; bảng Media tbl9dYmn7jk8K0VK; bảng Design tbloTVabCdgzgiU6. Hai Base App Token vẫn cần đối chiếu qua API trước khi triển khai.

App ID đã đối chiếu với đường đăng nhập production: cli_aa1e551b0078def5. Các biến LARK_APP_ID/LARK_APP_SECRET hiện có trên Vercel ở môi trường Production; chưa thấy cấu hình Order. Preview chưa có đủ biến xác thực, nên không dùng preview để kết luận kết nối đã hoạt động.
