# Sakawin Reports — Hướng dẫn cài đặt

Base dùng: **TỔNG QUAN DOANH SỐ 2026 - SAKAWIN** (Sakawin Việt Nam › Wiki Đình Toàn)

Sau khi làm xong: team nhập số vào Lark như mọi khi → web tự cập nhật, không còn gõ tay.

> **Không phải sửa bảng nào đang có.** Web chỉ *đọc* bảng `Báo Cáo Doanh Thu - Kênh Bán Hàng`.
> Việc duy nhất phải làm thêm là tạo 1 bảng mới chứa Target + kế hoạch.

---

## Cấu trúc webapp

Đây là webapp nhiều trang, mỗi trang một chủ đề và một nguồn số riêng.

| Trang | File | API | Nguồn số | Tình trạng |
|---|---|---|---|---|
| 📈 Doanh số & Target | `index.html` | `/api/doanh-so` | `Báo Cáo Doanh Thu - Kênh Bán Hàng` + `Target & Kế hoạch` | ✅ đang chạy |
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
| Target, kế hoạch tháng sau, thứ tự dòng, tên hiển thị | bảng **Target & Kế hoạch** (tạo mới) |
| Nhận xét & định hướng | bảng **Nhận xét** (tạo mới, tuỳ chọn) |

Còn lại — %hoàn thành target, %Ads, target tháng sau, AOV, CPO, tăng trưởng, các dòng TỔNG,
3 biểu đồ, 3 bảng xếp hạng — **web tự tính**, không ai phải bấm máy tính.

---

## Phần 1 — Tạo 2 bảng mới trong Base (~10 phút)

### Bảng `Target & Kế hoạch`
Mỗi dòng = 1 kênh × 1 tháng **đã chốt**. Ba cột kế hoạch là kế hoạch cho **tháng liền sau**.

Bảng này cũng chính là thứ quyết định **shop nào được lên báo cáo và xếp theo thứ tự nào** —
kênh không có dòng ở đây thì không hiện. Muốn thêm Showroom hay Aeon Huế vào báo cáo,
chỉ cần thêm 1 dòng.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| Tháng | Số | `7` — giống hệt cách ghi ở bảng doanh thu |
| Kênh Kinh Doanh | Văn bản | **Phải trùng tên với bảng doanh thu**: `Shopee HN`, `Shopee Mall`… |
| Tên hiển thị | Văn bản | Tên muốn hiện trên web, vd `Sakawin Hà Nội`. Bỏ trống thì lấy tên kênh |
| Target | Số | Target của chính tháng đó |
| % tăng trưởng KH | Số | Kế hoạch tăng trưởng tháng sau, vd `40` |
| Số đơn KH | Số | Số đơn kế hoạch tháng sau |
| Trần Ads % KH | Số | vd `6` hoặc `4.5` |
| Nhãn | Văn bản | vd `TOP SALE 🔥`, `VỀ SỐ ✓`. Có 🔥 hoặc chữ "top" → nhãn đỏ, còn lại nhãn xanh |
| Ghi chú | Văn bản | Hiện dưới tên shop |
| Thứ tự | Số | Thứ tự dòng trên báo cáo |

### Bảng `Nhận xét` (tuỳ chọn)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| Tháng | Số | `7` |
| Thứ tự | Số | |
| Mức độ | Lựa chọn | `Tốt` (xanh) · `Cảnh báo` (cam) · `Trung tính` |
| Nội dung | Văn bản | |

### Nhập sẵn, khỏi gõ
Thư mục `lark-import/` có 2 file CSV đã trích **toàn bộ target T7 + kế hoạch T8 đang chạy trên web**,
đã map sẵn tên kênh sang đúng tên Lark (`Sakawin Hà Nội` → `Shopee HN`…).

Trong Lark Base: **Thêm bảng → Nhập từ tệp** → chọn `Target-Ke-hoach.csv`, rồi làm tương tự với `Nhan-xet.csv`.

---

## Phần 2 — Tạo Lark App (~15 phút)

1. **open.larksuite.com** → *Developer Console* → **Create custom app**, tên `Web bao cao doanh so`.
2. Tab **Permissions & Scopes** → thêm quyền **`bitable:app:readonly`**.
3. Tab **Credentials & Basic Info** → copy **App ID** và **App Secret**.
4. Tab **Version Management & Release** → **Create version** → **Submit for release**.
5. ⚠️ **Bước hay bị quên nhất:** mở Base → góc phải bấm **⋯** → **Add document application**
   → tìm app `Web bao cao doanh so` → thêm vào.
   Thiếu bước này thì API luôn báo `permission denied`, dù mọi thứ khác đúng hết.
6. Lấy mã từ URL của Base — bấm vào từng bảng rồi copy phần `table=`:
   ```
   https://xxx.larksuite.com/base/bascnAAAAAAAA?table=tblBBBBBBBB&view=...
                                   └ APP_TOKEN         └ TABLE_ID
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
2. Thêm dòng tháng mới vào `Target & Kế hoạch` (target + 3 cột kế hoạch tháng sau).
3. Thêm vài dòng vào `Nhận xét`.
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

## Tra lỗi nhanh

| Dòng cảnh báo | Nguyên nhân | Cách xử lý |
|---|---|---|
| `Thiếu biến môi trường …` | Chưa khai biến trên Vercel | Thêm biến rồi **Redeploy** |
| `code 99991663` / `permission denied` | App chưa được thêm vào Base | Làm lại Phần 2 bước 5 |
| `code 91402` / `NOTEXIST` | Sai `LARK_APP_TOKEN` hoặc `TABLE_ID` | Copy lại từ URL Base |
| `Bảng Target & Kế hoạch chưa có dòng nào hợp lệ` | Thiếu cột `Tháng` hoặc `Kênh Kinh Doanh` | Kiểm tra tên cột |
| `Không tìm thấy "X" tháng … trong bảng doanh thu` | Tên kênh 2 bảng lệch nhau | Sửa cho trùng tên |
| `HTTP 404` khi gọi /api/doanh-so | Thư mục `api/` chưa lên repo | Push lại |
