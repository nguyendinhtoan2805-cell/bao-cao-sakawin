# Sakawin Reports — Hướng dẫn cài đặt

Base dùng: **TỔNG QUAN DOANH SỐ 2026 - SAKAWIN** (Sakawin Việt Nam › Wiki Đình Toàn)

Sau khi làm xong: team nhập số vào Lark như mọi khi → web tự cập nhật, không còn gõ tay.

> **Không tạo Base mới, không tạo bảng doanh thu mới.** Web đọc thẳng bảng
> `Báo Cáo Doanh Thu - Kênh Bán Hàng` đang chạy; việc duy nhất phải làm thêm là
> bổ sung mấy cột Target vào chính bảng đó.

---

## Cấu trúc webapp

Đây là webapp nhiều trang, mỗi trang một chủ đề và một nguồn số riêng.

| Trang | File | API | Nguồn số | Tình trạng |
|---|---|---|---|---|
| 🔐 Đăng nhập | — | `/api/auth` | Tài khoản Lark công ty | ✅ đang chạy |
| ⚙️ Quản trị tài khoản | `admin.html` | `/api/users` | Upstash Redis | ✅ đang chạy |
| 📈 Doanh số & Target | `index.html` | `/api/doanh-so` | `Báo Cáo Doanh Thu - Kênh Bán Hàng` | ✅ đang chạy |
| 💰 Tài chính & Lãi lỗ | `tai-chinh.html` | `/api/tai-chinh` | `Báo Cáo Chi Tiết - 2026` (doanh thu thuần, giá vốn, chi phí) | 🔜 làm sau |

Hai trang **không dùng chung số**. Trang doanh số nói về *doanh thu bán hàng*,
trang tài chính nói về *doanh thu thuần và lãi lỗ* — hai chỉ số khác nhau,
cố tình tách để không ai đọc nhầm. Thanh điều hướng ở đầu trang để chuyển qua lại.

---

## Web lấy số ở đâu

| Số trên báo cáo | Lấy từ |
|---|---|
| Doanh thu bán hàng | `Báo Cáo Doanh Thu - Kênh Bán Hàng` → cột **Doanh Thu Kinh Doanh (số thực)** |
| Số đơn | cùng bảng → **Số Lượng Đơn Hàng** |
| Ngân sách ADS | cùng bảng → **Ngân Sách ADS** |
| Nhóm kênh (Shopee/TikTok/Khác/Offline) | cùng bảng → **Nền Tảng** |
| Target, kế hoạch tháng sau, thứ tự dòng, tên hiển thị | **cùng bảng đó**, thêm vài cột (xem Phần 1) |
| Nhận xét & định hướng | bảng **Nhận xét** (tạo mới, tuỳ chọn) |

Còn lại — %hoàn thành target, %Ads, target tháng sau, AOV, CPO, tăng trưởng, các dòng TỔNG,
3 biểu đồ, 3 bảng xếp hạng — **web tự tính**, không ai phải bấm máy tính.

---

## Phần 1 — Thêm cột vào bảng đang có (~5 phút)

Base đã có sẵn bảng `Báo Cáo Doanh Thu - Kênh Bán Hàng` với đúng cấu trúc cần thiết:
**1 dòng = 1 kênh × 1 tháng**. Chỉ cần thêm vài cột vào chính bảng đó là xong —
không tạo bảng mới, không nhập lại tên kênh, không nhập lại tháng.

### Các cột cần thêm

| Cột | Kiểu | Bắt buộc | Ghi chú |
|---|---|:--:|---|
| LÊN BÁO CÁO | Ô tick (Checkbox) | ✅ | Tick kênh nào thì kênh đó hiện trên web |
| TARGET | Số | ✅ | Target của chính tháng đó |
| % Tăng trưởng | Số hoặc Văn bản | | Kế hoạch tăng trưởng tháng sau, vd `40` |
| SỐ ĐƠN (target) | Số hoặc Văn bản | | Số đơn kế hoạch tháng sau |
| % Trần ADS | Số hoặc Văn bản | | vd `6` hoặc `4.5` |
| Nhãn | Văn bản | | vd `TOP SALE 🔥`, `VỀ SỐ ✓`. Có 🔥 hoặc chữ "top" → nhãn đỏ, còn lại nhãn xanh. Mỗi tháng chỉ gắn cho 2-3 kênh đáng chú ý |
| Ghi chú | Văn bản | | Hiện dưới tên shop |

Hai cột dưới đây **không cần tạo** — chỉ thêm khi thật sự cần:

| Cột | Kiểu | Khi nào cần |
|---|---|---|
| Thứ tự | Số | Muốn ghim thứ tự dòng cố định. Không có cột này thì web tự xếp theo doanh thu giảm dần trong từng khối — tự cập nhật mỗi tháng, không phải sửa tay |
| Tên hiển thị | Văn bản | Muốn web gọi tên khác với `Kênh Kinh Doanh`. Không có cột này thì web lấy thẳng tên kênh |

> Tên cột **không phân biệt hoa thường và dấu tiếng Việt** — `TARGET`, `Target`,
> `target` đều đọc được như nhau.

> **Bảng trông rộng ra?** Tạo một chế độ xem (View) riêng tên `Nhập số hằng ngày`
> và ẩn mấy cột này đi. Team vận hành vẫn thấy bảng gọn như cũ.

### Điền số

Chỉ cần điền cho **các dòng tháng 7 đã có sẵn** của 15 kênh lên báo cáo — tick
`Lên báo cáo`, điền `Target` và 3 cột kế hoạch. Không tạo dòng mới.

File `lark-import/Target-T7-de-dien.csv` là bảng tra: mở bằng Excel/Numbers,
có sẵn toàn bộ số đang chạy trên web, kèm tên kênh bên Lark để dò đúng dòng.

### Bảng `Nhận xét` (tuỳ chọn)
Cái này thì đúng là bảng mới, vì không gắn với kênh nào cả. Nhập từ `lark-import/Nhan-xet.csv`.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| Tháng | Số | `7` |
| Thứ tự | Số | |
| Mức độ | Lựa chọn | `Tốt` (xanh) · `Cảnh báo` (cam) · `Trung tính` |
| Nội dung | Văn bản | |

> **Muốn để Target ở bảng riêng?** Vẫn được: tạo bảng có các cột trên cộng thêm
> `Tháng` và `Kênh Kinh Doanh`, rồi khai biến `LARK_TABLE_TARGET` trên Vercel.
> Không khai thì web mặc định đọc ngay trong bảng doanh thu.

## Phần 2 — Tạo Lark App (~15 phút)

1. **open.larksuite.com** → *Developer Console* → **Create custom app**, tên `Web bao cao doanh so`.
2. Tab **Permissions & Scopes** → thêm quyền **`bitable:app:readonly`**.
3. Tab **Credentials & Basic Info** → copy **App ID** và **App Secret**.
4. Tab **Version Management & Release** → **Create version** → **Submit for release**.
5. ⚠️ **Bước hay bị quên nhất:** mở Base → góc phải bấm **⋯** → **Add document application**
   → tìm app `Web bao cao doanh so` → thêm vào.
   Thiếu bước này thì API luôn báo `permission denied`, dù mọi thứ khác đúng hết.
6. Lấy mã từ URL — Base nằm trong Wiki nên URL có dạng `/wiki/`, và đoạn ngay sau
   `/wiki/` dùng thẳng làm `APP_TOKEN`, **không cần thêm quyền `wiki:*`**:
   ```
   https://sakawinvietnam.sg.larksuite.com/wiki/HObGw4...?table=tblRJx...&view=...
                                                 └ APP_TOKEN     └ TABLE_ID
   ```

---

## Phần 3 — Khai biến trên Vercel (~5 phút)

Vercel → Project → **Settings → Environment Variables**, thêm các biến trong `.env.example`
(tick cả Production / Preview / Development), rồi **Redeploy**.

Mở web, thanh trạng thái dưới hàng nút phải hiện:
> ✅ Số liệu lấy trực tiếp từ Lark · chốt tháng 2026-07 · đồng bộ lúc …

---

## Dùng hằng tháng

1. Team nhập doanh thu / số đơn / ngân sách ADS vào `Báo Cáo Doanh Thu - Kênh Bán Hàng` **như bình thường**.
2. Trên chính dòng đó: tick `Lên báo cáo`, điền `Target` và 3 cột kế hoạch tháng sau.
   Gắn `Nhãn` cho 2-3 kênh đáng chú ý.
3. Thêm vài dòng vào bảng `Nhận xét`.
4. Mở web → bấm **🔄 Đồng bộ từ Lark**. Xong.

### Mẹo
- **Xem lại tháng cũ:** dùng ô chọn `Chốt T…/…` cạnh nút đồng bộ, hoặc mở link `?month=7`.
- **Cột doanh thu để trống ở bảng Kênh Bán Hàng** → báo cáo hiện dấu `—` và ghi rõ trong thanh
  vàng. Web **không** đi mượn số của bảng tài chính để lấp — số bán hàng và số tài chính là
  hai chỉ số khác nhau. Muốn có số thì nhập vào bảng Kênh Bán Hàng.
- **Thanh vàng "N điểm cần kiểm tra":** bấm vào để xem chi tiết — thường là tên kênh ở 2 bảng
  viết khác nhau, hoặc tháng đó chưa nhập doanh thu. Đây là bộ soát lỗi, không phải lỗi web.
- **Số chưa đổi:** web cache 5 phút. Đợi hoặc bấm đồng bộ lại.
- **Lark chết / chưa cấu hình:** web KHÔNG trắng — vẫn hiện số nhúng sẵn kèm cảnh báo cam.
- **Nút "Nhập số liệu" cũ vẫn còn** để sửa nhanh khi họp, nhưng **không ghi ngược về Lark**
  và mất khi tải lại trang.

---

## Đăng nhập & phân quyền

Nhân sự đăng nhập bằng **chính tài khoản Lark của công ty** — không phát, không quản mật khẩu nào.
Ai nghỉ việc, khoá tài khoản Lark là mất quyền vào web luôn.

### Sáu quyền

| Quyền | Cho phép |
|---|---|
| Xem trang Doanh số & Target | Vào được trang báo cáo doanh số |
| Xem trang Tài chính & Lãi lỗ | Vào được trang tài chính (khi làm xong) |
| Xem Target và % hoàn thành | Thấy cột Target, % hoàn thành và cả khối kế hoạch tháng sau |
| Xem ngân sách ADS, %Ads và CPO | Thấy các cột chi phí quảng cáo và biểu đồ Ads |
| Được sửa số trực tiếp trên web | Hiện nút "Nhập số liệu" (sửa tạm, không ghi ngược về Lark) |
| Quản trị tài khoản | Vào được trang `/admin.html` để cấp quyền cho người khác |

> **Bỏ tick là số liệu không rời khỏi máy chủ**, chứ không phải chỉ ẩn trên màn hình.
> `/api/doanh-so` kiểm tra quyền rồi mới trả dữ liệu; người không có quyền xem Target
> nhận về `tgt7: null` — mở DevTools cũng không thấy gì.

### Cài đặt một lần

**1. Kho lưu tài khoản**
Vercel → **Storage** → **Create Database** → **Upstash for Redis** (gói free) → nối vào project.
Hai biến `KV_REST_API_URL` và `KV_REST_API_TOKEN` sẽ tự sinh.

**2. Hai biến môi trường tự khai**
- `SESSION_SECRET` — sinh bằng `openssl rand -base64 48`. Đổi chuỗi này là mọi người phải đăng nhập lại.
- `ADMIN_EMAILS` — email của bạn. Đây là lối vào lần đầu khi chưa có tài khoản nào.

**3. Khai báo trong Lark App**
- **Security Settings → Redirect URLs**: thêm `https://<tên-miền>/api/auth?action=callback`
- **Permissions & Scopes**: thêm `contact:user.email:readonly` (web dùng email làm danh tính)
- Tạo version mới và submit lại

**4. Redeploy**, rồi vào web → đăng nhập → tab **⚙️ Quản trị** để cấp quyền cho nhân sự.

### Lỡ tự gỡ quyền của mình?
Email nằm trong `ADMIN_EMAILS` luôn toàn quyền, không gỡ được từ giao diện.
Đó là lối thoát. Muốn đổi thì sửa biến trên Vercel rồi Redeploy.

---

## Tra lỗi nhanh

| Dòng cảnh báo | Nguyên nhân | Cách xử lý |
|---|---|---|
| `Thiếu biến môi trường …` | Chưa khai biến trên Vercel | Thêm biến rồi **Redeploy** |
| `code 99991663` / `permission denied` | App chưa được thêm vào Base | Làm lại Phần 2 bước 5 |
| `code 91402` / `NOTEXIST` | Sai `LARK_APP_TOKEN` hoặc `TABLE_ID` | Copy lại từ URL Base |
| `Tháng … chưa có kênh nào được tick "Lên báo cáo"` | Quên tick ô | Tick các kênh muốn hiện |
| `Bảng doanh thu chưa có dòng nào hợp lệ` | Thiếu cột `Tháng` hoặc `Kênh Kinh Doanh` | Kiểm tra tên cột |
| `Không tìm thấy "X" tháng … trong bảng doanh thu` | Tên kênh 2 bảng lệch nhau | Sửa cho trùng tên |
| `HTTP 404` khi gọi /api/doanh-so | Thư mục `api/` chưa lên repo | Push lại |
| `Thiếu SESSION_SECRET` | Chưa khai biến | Khai rồi Redeploy |
| `Chưa kết nối kho lưu tài khoản` | Chưa tạo Upstash Redis | Xem mục Đăng nhập & phân quyền, bước 1 |
| Lark báo `redirect_uri mismatch` | Chưa khai Redirect URL trong Lark App | Thêm đúng `https://<tên-miền>/api/auth?action=callback` |
| `Tài khoản Lark không có email` | Thiếu scope `contact:user.email:readonly` | Thêm scope, tạo version mới, submit |
