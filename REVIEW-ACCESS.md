# Bản sửa quyền truy cập nội bộ — chờ kiểm thử môi trường riêng

Ngày: 07/09/2026. Phạm vi: các mục 4, 5, 8 của lần đánh giá web Sakawin.
Nhánh: `codex/fix-internal-access`, tạo từ `a771c9b`.
Thực hiện trong worktree `/private/tmp/sakawin-access-review-20260907`.
Chưa push GitHub, chưa deploy Vercel, chưa sửa tài khoản hoặc hồ sơ thật.

## Thay đổi và kết quả

| Phần | Kết quả |
| --- | --- |
| 4 — Quản trị | Sửa lỗi ô bộ phận gọi hàm không tồn tại. Mỗi thao tác chỉ gửi trường thay đổi. Bật/tắt quyền, đổi tên, khóa tài khoản hoặc đặt lại mật khẩu giữ các quyền và bộ phận còn lại. Xóa giới hạn bộ phận cần xác nhận riêng. |
| 4 — Lưu đồng thời | Mỗi tài khoản có `revision`; cập nhật/xóa từ trang cũ bị từ chối với HTTP 409. Redis so sánh bản đã đọc và ghi trong một lệnh EVAL, ngăn lần lưu đăng nhập/đổi mật khẩu cũ khôi phục quyền vừa thu hồi. Kho hỏng hoặc mất kết nối không được coi là danh sách trống để ghi đè. |
| 5 — Nhân sự | Lọc hồ sơ trước khi tính tổng, bộ phận, thâm niên, biến động, đánh giá, đào tạo, hợp đồng và cảnh báo. Không đưa dữ liệu ngoài bộ phận vào JSON rồi chỉ ẩn ở giao diện. |
| 5 — Liên kết nhân sự | Ưu tiên mã NV; tên chỉ dùng khi duy nhất trong toàn bộ hồ sơ gốc. Thiếu liên kết, tên trùng hoặc mã/tên mâu thuẫn thì không trả dòng đó cho người bị giới hạn. Checklist xác định người sở hữu một lần, không đoán bằng tên chứa nhau. |
| 5 — Tuyển dụng | Cả lưu biên bản và đổi trạng thái đều đọc lại hồ sơ và kiểm tra bộ phận trước khi ghi. Từ chối không tiết lộ tên ứng viên ngoài phạm vi. JD có khung lương chỉ được ghép khi xác định đúng bộ phận. |
| 5 — Tệp đính kèm | Ba đường ảnh/CV của Nhân sự, Tuyển dụng và Quỹ lương kiểm tra token thuộc tệp được phép trước khi tải từ Lark. API Nhân sự/Tuyển dụng và phản hồi tệp dùng `private, no-store`. |
| 8 — Trang chủ | Tài khoản chỉ có Nhân sự được xem phần Nhân sự, không hiện bộ lọc kỳ trống. Chỉ có Tuyển dụng hoặc Quản trị thì chuyển tới trang tương ứng; không tự cấp thêm quyền báo cáo. |

Không thêm thư viện hay API endpoint. Hai file dùng chung `_auth.js` và `_store.js`
được cập nhật để giữ cùng một quy tắc quyền và cơ chế lưu giữa các đường gọi.
`.vercelignore` loại các file kiểm thử và tài liệu này khỏi gói triển khai.

## Kiểm tra đã thực hiện

Chạy từ thư mục worktree với Node.js 24:

```sh
node --test tests/access-control.test.js
git diff --check
```

- **32/32 nhóm kiểm thử đạt**: giữ bộ phận khi đổi quyền/reset; không kích hoạt lại tài khoản bị khóa; trang quản trị cũ không khôi phục quyền; xung đột ghi; kho rỗng/hỏng; từ chối người không có quyền.
- Kiểm tra phiên đăng nhập cũ đọc quyền/bộ phận hiện tại, tài khoản bị xóa/khóa và yêu cầu đổi mật khẩu.
- Dữ liệu giả Team A/Team B: lọc hai chiều; tên trùng; mã không tồn tại; mã/tên không khớp; thống kê/cảnh báo/đào tạo; JD cùng chức danh; từ chối phân trang thiếu.
- Thử ghi biên bản/đổi trạng thái và tải tệp bằng token ngoài phạm vi: không phát sinh lệnh PUT/download ở mock Lark khi bị từ chối.
- Kiểm tra cú pháp 9 file API JavaScript và script trong `admin.html`, `index.html`: đạt.
- Trình duyệt localhost: lưu bộ phận bằng bàn phím, tải lại vẫn còn; bật/tắt quyền khác không làm mất bộ phận; tài khoản chỉ Tuyển dụng đi đúng trang, chỉ thấy Team A; tài khoản chỉ Nhân sự hiển thị 2 nhân sự giả, không có liên kết Tài chính/Quỹ lương hoặc bộ lọc kỳ trống.

Mọi dữ liệu kiểm thử đều giả. Mạng Lark/Redis được thay bằng mock, không đọc `.env`.
Kiểm thử CAS kiểm tra giao thức và hành vi xung đột với Redis giả. Bổ sung trước triển
khai: **kiểm thử Lua trên Redis 7.2.7 cục bộ đạt** (Unix socket riêng, không mở TCP,
không lưu dữ liệu ra đĩa). Bao gồm khởi tạo kho trống, từ chối lần ghi/xóa cũ sau khi
thu hồi quyền và đổi bộ phận, rồi xóa với bản đọc mới. Tổng cộng 32 nhóm kiểm thử
thông thường và 1 kiểm thử tích hợp Redis đạt. Chưa chạy phép thử ghi trên Upstash
production; chưa kiểm chứng cấu trúc Lark hiện tại bằng tài khoản nhân sự thật.

```sh
REDIS_SERVER_BIN=/path/to/redis-server REDIS_CLI_BIN=/path/to/redis-cli \
  node --test tests/redis-integration.test.cjs
```

Có thể chạy lại giao diện thử bằng:

```sh
node tests/preview-fixture.cjs
```

Mở `http://127.0.0.1:4318/fixture?role=admin` (hoặc `hr`, `recruitment`, `none`).
Máy chủ chỉ lắng nghe localhost; dữ liệu tài khoản ở RAM, dừng chạy là mất.
Không triển khai máy chủ giả này lên Vercel.

## Các điểm cần đối chiếu trước khi đưa lên web đang chạy

1. **Quyền xem toàn bộ có chủ đích:** giữ chính sách hiện có: quản trị viên luôn toàn quyền; ô bộ phận chưa đặt/để trống cho phép toàn bộ ở các trang được cấp. Bản sửa không đoán tài khoản nào từng bị lỗi xóa bộ phận. Cần quản trị viên rà lại danh sách này.
2. **Tên bộ phận:** so khớp có dấu và dấu câu; bỏ khác biệt hoa/thường, Unicode NFC và khoảng trắng thừa. Tên không khớp sẽ không có dữ liệu, không rơi về toàn công ty. Đối chiếu tên trong danh sách tài khoản với Lark trước triển khai.
3. **Phạm vi trường bộ phận:** áp dụng cho Nhân sự và Tuyển dụng. Quyền Doanh số, Tài chính và Quỹ lương vẫn theo chính sách toàn trang hiện có; không được hiểu việc điền bộ phận là đã giới hạn lương theo team.
4. **Dữ liệu không rõ liên kết:** đánh giá/đào tạo/hợp đồng hoặc checklist thiếu mã, tên trùng, tên không khớp hồ sơ sẽ bị loại khỏi phản hồi của trưởng bộ phận. JD thiếu bộ phận không trả khung lương/yêu cầu cho người bị giới hạn. Quản trị vẫn xem được dữ liệu tổng để đối chiếu và làm sạch nguồn.
5. **Tệp ảnh/CV:** mỗi lần tải kiểm tra lại bản ghi trong Lark, tăng số lượt đọc. Cần đo thời gian/tần suất tải ảnh trong Preview. Không dùng cache quyền để tăng tốc. `no-store` áp dụng phản hồi mới; không xóa được tệp hoặc cache mà người dùng đã tải từ trước.
6. **Trang quản trị đang mở:** sau triển khai phải tải lại. Yêu cầu cập nhật cũ thiếu `revision` bị từ chối, tránh ghi đè từ giao diện cũ. Dữ liệu Redis giữ cấu trúc mảng; trường `revision` được thêm khi quản trị lưu, không cần chạy migration hàng loạt.
7. **Giới hạn đồng thời:** CAS bảo vệ kho tài khoản. Lark vẫn không có giao dịch chung giữa đọc bộ phận và ghi hồ sơ; thay đổi trực tiếp trong Lark đúng lúc request đang chạy vẫn cần kiểm soát vận hành. Không tuyên bố xử lý toàn bộ xung đột biên bản giữa nhiều người.

## Bước triển khai đề xuất, chưa thực hiện

1. Xem diff của nhánh, duyệt phạm vi và danh sách tài khoản toàn bộ/bộ phận.
2. Kiểm tra cấu hình GitHub–Vercel trước khi push: tránh nhánh được push tự kích hoạt production hoặc Preview dùng chung Redis/Base production có quyền ghi.
3. Tạo môi trường thử có Redis và Base Lark riêng, chỉ dữ liệu giả; thử EVAL thực, đăng nhập, đổi mật khẩu, hai quản trị viên lưu đồng thời, ma trận quyền, CV/ảnh và thời gian tải.
4. Chỉ merge/deploy production sau khi người dùng duyệt kết quả. Rà lại quyền thực tế và kiểm tra 401/403, số liệu theo bộ phận ngay sau triển khai.
5. Nếu phát hiện lỗi: tạm khóa quyền trang bị ảnh hưởng, giữ bản sửa bảo vệ quyền; không tự động rollback về bản cũ vì có thể mở lại các lỗ hổng vừa sửa.

Các phát hiện khác của lần đánh giá (dữ liệu nhúng trong HTML công khai, lệch kỳ/tổng tài
chính, lỗi autosave biên bản khi chuyển hồ sơ, cách đếm vị trí đang tuyển) chưa nằm trong
bản sửa 4/5/8 này. Không coi bản sửa này là xác nhận toàn bộ web đã an toàn.
