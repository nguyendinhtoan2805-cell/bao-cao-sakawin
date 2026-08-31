# Nối web báo cáo doanh số với Lark Base — Hướng dẫn cài đặt

Sau khi làm xong: **team nhập số vào Lark Base → web tự cập nhật**, không còn gõ tay vào web.

---

## Phần 1 — Dựng bảng trên Lark Base (~10 phút)

Tạo 1 Base mới tên **"Báo cáo doanh số Sakawin"**, bên trong có 2 bảng.

### Bảng 1: `Doanh so theo thang`
Mỗi dòng = **1 shop × 1 tháng ĐÃ CHỐT**. Cột kế hoạch nằm cùng dòng, là kế hoạch cho **tháng liền sau**.

| Cột | Kiểu | Bắt buộc | Ghi chú |
|---|---|:--:|---|
| Tháng | Văn bản | ✅ | Ghi đúng dạng `2026-07` |
| Shop | Văn bản | ✅ | Tên phải **giống hệt nhau giữa các tháng** (dùng để nối số nền) |
| Nhóm | Lựa chọn | ✅ | `Shopee` · `TikTok` · `Kênh khác` · `Offline` |
| Doanh thu | Số | ✅ | Doanh thu thực tế tháng đó |
| Target | Số | | Target của chính tháng đó |
| Chi phí Ads | Số | | Để trống nếu shop không chạy ads |
| Số đơn | Số | | |
| % tăng trưởng KH | Số | | Kế hoạch tăng trưởng cho tháng sau, vd `40` |
| Số đơn KH | Số | | Số đơn kế hoạch tháng sau |
| Trần Ads % KH | Số | | Trần %Ads tháng sau, vd `6` hoặc `9,0` |
| Nhãn | Văn bản | | vd `TOP SALE 🔥`, `VỀ SỐ ✓`. Có 🔥/"top" → nhãn đỏ, còn lại nhãn xanh |
| Ghi chú | Văn bản | | Hiện dưới tên shop |
| Thứ tự | Số | | Thứ tự dòng trên bảng báo cáo |

### Bảng 2: `Nhan xet`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| Tháng | Văn bản | `2026-07` — trùng với tháng chốt |
| Thứ tự | Số | |
| Mức độ | Lựa chọn | `Tốt` (xanh) · `Cảnh báo` (cam) · `Trung tính` |
| Nội dung | Văn bản | Câu nhận xét |

### Nhập sẵn dữ liệu cũ
Trong thư mục `lark-import/` có 2 file CSV đã trích **toàn bộ số T6 + T7/2026 đang chạy trên web**.
Trong Lark Base bấm **Thêm bảng → Nhập từ tệp → chọn CSV** là ra bảng đúng cấu trúc, không phải gõ lại.

---

## Phần 2 — Tạo Lark App để web đọc được Base (~15 phút)

1. Vào **open.larksuite.com** → *Developer Console* → **Create custom app**.
   Tên: `Web bao cao doanh so`.
2. Vào tab **Permissions & Scopes**, thêm quyền:
   - `bitable:app:readonly` (Đọc bảng nhiều chiều)
3. Tab **Credentials & Basic Info**: copy lại **App ID** và **App Secret**.
4. Tab **Version Management & Release** → **Create version** → **Submit for release**
   (nếu bạn là admin thì tự duyệt luôn).
5. **Quan trọng — cấp quyền cho App vào đúng Base:**
   Mở Base → góc phải bấm **⋯ (More)** → **Add document application / Thêm ứng dụng**
   → tìm app `Web bao cao doanh so` → thêm với quyền **Chỉnh sửa/Xem**.
   *Bỏ bước này là API luôn trả lỗi `permission denied`.*
6. Lấy 3 mã từ URL của Base:
   ```
   https://xxx.larksuite.com/base/bascnAAAAAAAA?table=tblBBBBBBBB&view=...
                                   ^APP_TOKEN            ^TABLE_ID
   ```
   - `LARK_APP_TOKEN` = phần sau `/base/`
   - `LARK_TABLE_SHOPS` = `table=` khi đang mở bảng *Doanh so theo thang*
   - `LARK_TABLE_NOTES` = `table=` khi đang mở bảng *Nhan xet*

---

## Phần 3 — Đưa lên Vercel (~5 phút)

1. Copy 2 thứ vào repo GitHub của web báo cáo:
   - `index.html` (ghi đè file cũ)
   - thư mục `api/` (chứa `data.js`)
2. Vercel → Project → **Settings → Environment Variables**, thêm đúng 7 biến trong `.env.example`
   (chọn cả 3 môi trường Production / Preview / Development).
3. Push code lên GitHub → Vercel tự deploy.
4. Mở web. Thanh trạng thái dưới hàng nút phải hiện:
   > ✅ Số liệu lấy trực tiếp từ Lark Base · chốt tháng 2026-07 · đồng bộ lúc ...

---

## Cách dùng hằng tháng (từ nay)

1. Cuối tháng, team điền dòng tháng vừa chốt vào Lark Base (doanh thu, target, ads, đơn).
2. Điền 3 cột kế hoạch cho tháng sau: `% tăng trưởng KH`, `Số đơn KH`, `Trần Ads % KH`.
3. Thêm vài dòng vào bảng `Nhan xet`.
4. Mở web → bấm **🔄 Đồng bộ từ Lark**. Xong.

Mọi chỉ số còn lại (%hoàn thành target, %Ads, target tháng sau, AOV, CPO, tăng trưởng, các dòng TỔNG, 3 biểu đồ, 3 bảng xếp hạng) **web tự tính** — không ai phải bấm máy tính.

### Vài mẹo
- **Xem lại báo cáo tháng cũ:** dùng ô chọn `Chốt T.../...` cạnh nút đồng bộ, hoặc mở link `?month=2026-06`.
- **Gửi link cho sếp:** link luôn hiện số mới nhất, không cần gửi lại file.
- **Số bị cache:** web cache 5 phút để chạy nhanh. Vừa sửa Lark mà chưa thấy đổi thì đợi 5 phút hoặc bấm đồng bộ lại.
- **Lark chết / chưa cấu hình xong:** web KHÔNG trắng — vẫn hiện số lưu sẵn trong mã nguồn kèm dòng cảnh báo cam.
- **Nút "Nhập số liệu" cũ vẫn còn:** dùng để sửa nhanh tại chỗ khi họp, nhưng **không ghi ngược về Lark** và mất khi tải lại trang.

---

## Khi báo lỗi — tra nhanh

| Dòng cảnh báo | Nguyên nhân | Cách xử lý |
|---|---|---|
| `Thiếu biến môi trường ...` | Chưa khai biến trên Vercel | Thêm biến rồi **Redeploy** |
| `code 99991663` / `permission denied` | App chưa được thêm vào Base | Làm lại Phần 2 bước 5 |
| `code 91402` / `NOTEXIST` | Sai `LARK_APP_TOKEN` hoặc `TABLE_ID` | Copy lại từ URL Base |
| `Bảng Lark chưa có dòng nào hợp lệ` | Thiếu cột `Tháng` hoặc `Shop` | Kiểm tra tên cột |
| `Không có dòng nào cho tháng ...` | Tháng ghi sai định dạng | Ghi đúng `2026-07` |
| `HTTP 404` | Thư mục `api/` chưa lên repo | Push lại, kiểm tra file `api/data.js` |
