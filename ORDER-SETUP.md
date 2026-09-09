# Thiết lập Order Design & Media — bản phát triển ngày 09/09/2026

## Trạng thái và phạm vi

- Mã nguồn phát triển ở nhánh `codex/order-design-media`; bản Order đã lên production ở chế độ chỉ đọc.
- Đã xác minh API đọc cả hai Base Order và bảng Buổi quay bằng phiên đăng nhập Sakawin trên production.
- Bản localhost dùng dữ liệu giả; production đọc dữ liệu thật. Chưa kiểm thử ghi Lark thật.
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

**Design chỉ thêm 1 cột mới:**

| Tên cột | Kiểu | Mục đích |
|---|---|---|
| Lịch sử | Văn bản | Web ghi nối tiếp người thao tác, thời gian, thay đổi và mốc hoàn thành sau mỗi lần lưu |

Giữ nguyên MÃ DESIGN (mã công việc), Người Order (người tạo yêu cầu), Trạng thái (tiến độ), Ngày Order, Designer và các cột nội dung/thành phẩm hiện có. Không thêm Mã yêu cầu, Người tạo, Tiến độ chi tiết, các cột duyệt, Hoàn thành lúc, Nhật ký hoặc Giờ dự kiến cho Design. Nếu đã tạo các cột này thì để nguyên, không cần xóa; bản mới không đọc/ghi chúng.

Mã chống tạo trùng được lưu nội bộ trong Lịch sử, không ghi đè MÃ DESIGN. Người Order được đối chiếu với tài khoản đăng nhập khi tạo. Mỗi lần lưu tiếp theo giữ nguyên Người Order và ghi người thao tác vào Lịch sử. Web cho nhập MÃ DESIGN theo quy ước hiện có, không tự áp một quy tắc đánh số mới.

Các bước Design cần có trong **Trạng thái**:

| Bước trên web | Lựa chọn Lark dùng lại |
|---|---|
| Chờ kiểm tra brief | Chờ kiểm tra brief hoặc Chưa làm |
| Cần bổ sung brief | Cần bổ sung brief |
| Đã nhận order | Đã nhận order |
| Đang thiết kế | Đang thiết kế hoặc Đang làm |
| Cần sửa | Cần sửa |
| Hoàn thành | Hoàn thành |

Không tự thêm/đổi lựa chọn trên Base thật. Web báo rõ bước thiếu và chưa bật thao tác khi cấu trúc chưa đủ. Những báo cáo/automation Lark lọc đúng “Chưa làm” có thể không bao gồm “Đã nhận order”, “Cần bổ sung brief”, “Cần sửa”; cần đối chiếu các bộ lọc trước khi bật ghi. Order cũ vẫn giữ dữ liệu và trạng thái gốc.

Design giữ bước kiểm tra brief trước khi nhận order; không duyệt thành phẩm. Lịch sử có cấu trúc để đọc lại chính xác và được trình bày dễ đọc trên web. Không điền tay hoặc sửa/xóa nội dung cột này. Nếu dữ liệu lịch sử không đúng định dạng, web dừng ghi để không làm mất nội dung cũ.

Mốc hoàn thành Design nằm trong Lịch sử: lưu lặp giữ nguyên mốc; đổi thành phẩm/số ảnh/Designer hoặc mở lại order thì ngừng tính là hoàn thành. Khi hoàn thành lại, ghi mốc mới, báo cáo đếm mỗi order một lần theo trạng thái hiện tại. Order cũ thiếu mốc hoàn thành không tự được gán ngày hôm nay, kể cả khi lưu lại trạng thái Hoàn thành.

**Thiết kế Media tạm thời trong mã (đang chờ chốt lại, KHÔNG tạo các cột dưới đây):**

Ngày 09/09/2026 người dùng yêu cầu ưu tiên dùng cột Media hiện có. Đang chờ xác nhận phương án chỉ thêm Lịch sử để chứa dữ liệu quy trình; mã 8+2 cột dưới đây chưa được bật ghi.

| Tên cột | Kiểu | Mục đích |
|---|---|---|
| Mã yêu cầu | Văn bản | Nhận diện yêu cầu tạo, tránh gửi trùng |
| Người tạo | Văn bản | Tài khoản web thực hiện tạo order |
| Tiến độ chi tiết | Văn bản | Bước chi tiết; giữ lại Progress cho báo cáo cũ |
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

Tổng cộng: Design thêm 1 cột; Media thêm 10 cột; bảng Buổi quay có 7 cột công việc và 3 cột hệ thống.

Không tự chuyển hàng loạt trạng thái hay gán ngày hoàn thành cho dữ liệu cũ. Thiếu ngày hoàn thành thì hiển thị rõ, không đoán tháng sản lượng.

## Bước 4 — kết nối ứng dụng Lark (đã xác minh đọc)

Dùng lại ứng dụng **WEBAPP BC Doanh số**, giữ nguyên khóa xác thực trên Vercel. Ngày 09/09/2026 đã thêm đúng quyền Tenant **View wiki space node information** (`wiki:node:read`) sau khi người dùng đồng ý. `wiki:node:retrieve` là quyền liệt kê node, không phải quyền đã thêm.

Cả hai Base đã chia sẻ quyền sửa cho ứng dụng. Vercel sử dụng `ORDER_USE_EXISTING_LARK_APP=true`, hai Wiki ID cấu hình sẵn và ba table ID đã đối chiếu. Máy chủ tự tra Wiki ra Base; không lấy khóa production về máy.

Production đã đọc được 1.695 bản ghi Design, 987 Media và 6 Buổi quay (bao gồm dòng trống). Cột Buổi quay liên kết đúng `tblGOY43BeI3yZPx`. `ORDER_WRITES_ENABLED=false` cho tới khi khớp xong cấu trúc và kiểm thử ghi.

Lịch sử Design và các trường duyệt, ngày hoàn thành, nhật ký Media phải được bảo vệ khỏi chỉnh sửa trực tiếp tùy tiện trong Base. Quyền Lead trên web không thể ngăn một người có quyền sửa trực tiếp các cột này ở Lark. Cần rà soát quyền trường/bảng của Base trước khi dùng duyệt làm căn cứ vận hành.

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
2. Cấp tài khoản thử ba quyền riêng: `xem_order`, `ghi_order`, `duyet_order`. Nhân sự thông thường chỉ cần hai quyền đầu; chỉ cấp quyền duyệt cho Lead Media. Design không cần quyền duyệt.
3. Ở môi trường kiểm thử đã cấu hình đúng hai Base, bật ghi để tạo một order và một buổi có nhãn **KIỂM THỬ**, đọc lại để xác nhận. Không thử trên hồ sơ thật đang chạy.
4. Kiểm tra thêm xếp/chuyển buổi, phản hồi/duyệt việc quan trọng, ghi link thành phẩm và ngày hoàn thành. Media không quan trọng và thành phẩm Design không cần duyệt.
5. Chỉ bật trên production sau khi đối chiếu bản ghi thật và kiểm tra không ảnh hưởng các trang cũ.

Chưa tạo bất kỳ bản ghi KIỂM THỬ nào trong Lark trong đợt xây dựng giao diện ban đầu.

## Các giới hạn cần biết của bản đầu

- Sửa cùng lúc qua web được khóa ghi, và web kiểm tra bản ghi cũ trước khi cập nhật. Một thay đổi trực tiếp ở Lark xảy ra đúng giữa bước đọc và ghi vẫn có thể xung đột; adapter này không có giao dịch/conditional update xuyên Lark. Tránh sửa cùng order ở hai nơi trong lúc ghi.
- Nếu sửa nội dung Drive nhưng giữ nguyên URL, bấm **Đã sửa nội dung kịch bản**. Web không đọc/chỉnh Google Drive và không tự phát hiện phiên bản Drive.
- Bảng báo cáo cá nhân là **đóng góp trên sản phẩm đã hoàn thành**. Giờ dự kiến chỉ áp dụng cho order Media, chưa phải giờ thực tế hay định mức lương/KPI. Design phân bổ theo số order và số ảnh.
- Chưa có thông báo Lark/nhắc việc tự động, chưa upload file gốc lên Drive. Thành phẩm được gắn bằng link.
- Nhánh phát triển đã thêm Order vào sidebar bảy trang hiện có và chuyển tài khoản chỉ có quyền Order đến /order.html. Thay đổi này đã có trên production.

## Tham chiếu kỹ thuật

- [Lark API tạo bản ghi](https://open.larksuite.com/document/server-docs/docs/bitable-v1/app-table-record/create).
- [SDK chính thức: create record, client_token, user_id_type](https://github.com/larksuite/oapi-sdk-python/blob/v2_main/lark_oapi/api/bitable/v1/model/create_app_table_record_request.py).
- [Lark cấu trúc trường Base](https://open.larksuite.com/document/server-docs/docs/bitable-v1/app-table-field/guide).

Bảng BUỔI QUAY: tblGOY43BeI3yZPx; Media: tbl9dYmn7jk8K0VK; Design: tbloTVabCdgzgiU6. App ID dùng chung đã đối chiếu: cli_aa1e551b0078def5. Preview thiếu cấu hình xác thực, chỉ production được dùng kiểm chứng dữ liệu thật.

## Kiểm chứng production ngày 09/09/2026

- Vercel deployment `dpl_4zSf76qZZw34Y47kcZrkkgYDMWPy` READY, alias tên miền chính; commit 531ada9. Ghi đang tắt.
- API Order chưa đăng nhập trả 401. Đăng nhập Sakawin đọc được ba bảng.
- Design thực tế có Định dạng là lựa chọn đơn, không phải văn bản. Adapter và form cần dùng các lựa chọn sẵn có; không đổi kiểu trường thật.
- Design thiếu Lịch sử và ba lựa chọn trạng thái Cần bổ sung brief / Đã nhận order / Cần sửa. Người dùng sẽ bổ sung lựa chọn.
- Media đang chờ chốt cách dùng lại cột hiện có; không tự tạo 9 cột quy trình cũ.
- Buổi quay đã đủ 10 cột và cột liên kết trên Media trỏ đúng bảng.
- Không tự sửa dữ liệu cũ, ngày quay hay lựa chọn không đúng nội dung trong Base.
