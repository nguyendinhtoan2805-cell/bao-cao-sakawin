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
| 🏠 **Tổng quan (trang chủ)** | `index.html` | gọi lại 3 API dưới | tóm tắt cả ba báo cáo | ✅ đang chạy |
| 🔐 Đăng nhập | — | `/api/auth/*` | Tài khoản Lark công ty | ✅ đang chạy |
| ⚙️ Quản trị tài khoản | `admin.html` | `/api/users` | Upstash Redis | ✅ đang chạy |
| 📈 Doanh số & Target | `doanh-so.html` | `/api/doanh-so` | `Báo Cáo Doanh Thu - Kênh Bán Hàng` | ✅ đang chạy |
| 💰 Tài chính & Lãi lỗ | `tai-chinh.html` | `/api/tai-chinh` | `Báo Cáo Chi Tiết - 2026` | ✅ đang chạy |
| 👥 Quỹ lương | `quy-luong.html` | `/api/quy-luong` | `Lương - Thưởng - Sakawin` | ✅ đang chạy |

### Trang Tổng quan hoạt động thế nào

Không có API riêng. Trang gọi **song song ba API sẵn có** rồi ghép kết quả. Cố ý làm vậy:

- Gói Hobby của Vercel chỉ cho 12 hàm serverless, đang dùng 10 — thêm endpoint tổng hợp là sát trần
- Phân quyền **tự áp dụng**: thiếu quyền nào thì API đó trả `403`, khối tương ứng lặng lẽ ẩn đi.
  Không phải viết logic phân quyền lần thứ hai, nên không có nguy cơ hai nơi lệch nhau
- Ba API luôn nhận cùng tham số kỳ, nên bộ lọc trên trang chủ áp cho cả ba

Khối **⚠️ Cần chú ý** gom mọi nhận định mức *cảnh báo* và *chưa chốt* từ cả ba báo cáo,
xếp cảnh báo lên trước, mỗi mục gắn nhãn nguồn (Doanh số / Tài chính / Quỹ lương).

> Đường dẫn cũ đổi: `/` giờ là **Tổng quan**, trang doanh số chuyển sang `/doanh-so.html`.
> Ai đã lưu địa chỉ gốc thì vào thẳng Tổng quan — đúng ý đồ.

### Nguyên tắc giao diện — áp dụng cho MỌI trang thêm mới

Ba trang dùng chung một bộ khung. Trang mới phải copy đúng bộ này, không tự đặt số khác:

| Thành phần | Giá trị chuẩn |
|---|---|
| Khung nội dung | `.wrap{max-width:none;width:100%;margin:0}` — dùng hết bề ngang màn hình |
| Lề trang (desktop) | `padding:24px clamp(14px, 1.8vw, 46px) 60px` — lề tự co giãn theo màn hình |
| Lề trang (điện thoại) | `padding:15px 13px 50px` |
| Tiêu đề trang | `27px / 800` |
| Thanh điều hướng | `.navtab` `14.5px / 700`, chữ `SAKAWIN REPORTS` bên trái, chip người dùng bên phải |
| Ngưỡng điện thoại | `@media(max-width:900px)` |

Trên điện thoại, mọi trang đều: thanh điều hướng vuốt ngang (`flex-wrap:nowrap`),
cột đầu của bảng dính bên trái và tự cắt nội dung, ô nhập cỡ chữ `16px` để iPhone
không tự phóng to.

**Kỳ xem được nhớ lại** trong `localStorage`, mỗi trang một khoá `sakawin-ky-<đường dẫn>`.
Mở lại trang là về đúng kỳ đang xem dở. Tham số `?ky=` trên URL vẫn thắng giá trị đã nhớ.

**Kỳ mặc định** luôn là tháng mới nhất **thực sự có số**, không phải tháng cuối cùng có dòng —
bảng Lark thường tạo sẵn dòng cho cả 12 tháng nên nếu lấy tháng cuối sẽ mở vào T12 trống trơn.

Hai lỗi flexbox đã mắc một lần, đừng lặp lại: khối cuộn ngang phải có `min-width:0`
(không thì kéo giãn cả trang), và đổi `flex-direction:column` thì phải đặt luôn
`flex-wrap:nowrap` (không thì flexbox xếp thành nhiều cột).

---

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

## Trang Tài chính & Lãi lỗ

Đọc bảng `Báo Cáo Chi Tiết - 2026`, cần biến `LARK_TABLE_FINANCE=tbl87Xc6y812sNBx`
và quyền **Xem trang Tài chính & Lãi lỗ**.

**Tự dò cột chi phí.** Cột số nào không phải doanh thu / giá vốn / lợi nhuận / phần trăm
thì được hiểu là một khoản chi phí. Thêm cột chi phí mới trong Lark là trang tự hiện,
không phải sửa code. Cột bị loại trừ theo tên đã chuẩn hoá: `doanhthu*`, `giavon*`,
`loinhuan*`, `bien*`, `traffic`, `tienrutvecty`, và mọi cột có dấu `%`.

### Kỳ xem

**Cả ba trang báo cáo đều có bộ lọc này** — Doanh số, Tài chính, Quỹ lương.

| Nút | Nghĩa | Kỳ đem ra so sánh |
|---|---|---|
| Tháng | Một tháng | Tháng liền trước |
| Quý | Cả quý chứa tháng đang chọn | 3 tháng liền trước |
| 3 tháng | Ba tháng tính ngược từ tháng đang chọn | 3 tháng liền trước |
| Cả năm | Cộng dồn các tháng đã có số trong năm | Cùng số tháng liền trước |
| Tự chọn | Khoảng từ tháng A đến tháng B | Cùng số tháng liền trước |

Riêng trang Doanh số, khi gộp nhiều tháng thì nhãn cột đổi từ `T6 / T7 / T8` sang
`kỳ trước / Q3 / kỳ tới`, và **Target tháng sau được cộng theo từng tháng rồi mới tổng** —
vì mỗi tháng có % tăng trưởng riêng, lấy tổng doanh thu nhân một % chung là sai.

> ⚠️ Gộp nhiều tháng mà có kênh chưa điền Target đủ các tháng thì cột **% hoàn thành**
> của kênh đó **cao hơn thực tế** (doanh thu cộng đủ kỳ, target chỉ cộng được vài tháng).
> Trang tự phát hiện và ghi rõ kênh nào trong thanh cảnh báo vàng.

Kỳ trước luôn là **cùng số tháng, ngay liền trước** — nên so sánh không bị lệch độ dài.
Mọi khối trên trang (KPI, chi phí, kênh chủ lực, kênh lỗ, nhận định) đều tính theo kỳ đang chọn.

### Các khối trên trang

Bốn ô KPI · sơ đồ *từ doanh thu xuống lợi nhuận* · khối phân tích tự động ·
**🏆 Kênh chủ lực** (nhóm kênh gánh 80% doanh thu đầu tiên) ·
**🚨 Kênh đang lỗ** (kèm nhãn *lỗ do chi phí* hay *bán đã lỗ*) ·
biểu đồ lợi nhuận theo điểm bán · cơ cấu chi phí · diễn biến theo tháng ·
**bảng chi phí chi tiết** · bảng chi tiết theo điểm bán.

### Đọc bảng chi tiết theo điểm bán

Bảng này có **một cột cho từng khoản chi phí**, xếp từ khoản nặng nhất toàn hệ sang trái.
Ô nào tô **vàng viền cam** nghĩa là khoản đó ở điểm bán này chiếm tỷ trọng doanh thu
**gấp đôi mặt bằng toàn hệ** (và chiếm trên 1% doanh thu của chính điểm đó) — đây là chỗ
đáng hỏi trước tiên khi đi truy chi phí.

Cột **Lợi nhuận ròng** và **% Ròng** tô nền xanh khi lãi, đỏ khi lỗ. Cột **Doanh thu thuần**
tô nền kem để dễ bám mắt khi kéo ngang.

### Soát chi phí bất thường

Bảng chi phí so từng khoản với kỳ trước. Cờ chỉ bật cho khoản chiếm **từ 3% tổng chi phí**
trở lên, để không báo động vì mấy khoản lẻ:

| Cờ | Điều kiện |
|---|---|
| 🔴 TĂNG MẠNH | Tăng ≥ 40%, hoặc ngốn thêm ≥ 1,5 điểm phần trăm doanh thu so với kỳ trước |
| 🟠 TĂNG | Tăng 20–40% |
| 🟢 GIẢM | Giảm ≥ 20% |
| 🟣 MỚI | Kỳ trước bằng 0, kỳ này có phát sinh |

Cột **% doanh thu** quan trọng hơn cột *Thay đổi*: chi phí tăng mà doanh thu tăng nhanh hơn
thì vẫn lành; chi phí đứng yên mà doanh thu giảm mới là vấn đề.

### Khối phân tích tự động sinh ra gì

Không phải văn mẫu — mọi câu đều tính từ số của tháng đang xem:

| Nhận định | Cách phát hiện |
|---|---|
| Bức tranh chung | Biên ròng < 0 → cảnh báo · < 5% → lưu ý · còn lại → tốt |
| Điểm đang lỗ | Lợi nhuận ròng < 0, kèm tổng lỗ và mức lợi nhuận nếu cắt hết |
| Lỗ do chi phí, không phải do bán lỗ | Lãi gộp > 0 nhưng lãi ròng < 0 — nhóm này cứu được |
| Giá vốn bất thường | Cao hơn trung bình toàn hệ từ 8 điểm phần trăm trở lên |
| Chi phí tập trung ở đâu | Ba khoản lớn nhất và tỷ trọng của chúng |
| So với tháng trước | Biên ròng lệch từ 1 điểm phần trăm |
| **Điểm chưa chốt** | Thiếu doanh thu / giá vốn / chi phí · shop có tháng trước mà thiếu tháng này · tổng cột chi phí lệch quá 0,5% doanh thu so với hiệu *lãi gộp − lãi ròng* (dấu hiệu một cột đang cộng trùng) |

---

## Trang Quỹ lương & Lương

Đọc bảng `Lương - Thưởng - Sakawin` (1 dòng = 1 nhân sự × 1 tháng), cần biến
`LARK_TABLE_SALARY=tblM8JEqeSXjbKH2` và quyền **Xem trang Quỹ lương & Lương**.

> ⚠️ Đây là trang nhạy cảm nhất — có lương từng người. Quyền để **riêng**, không đi kèm
> quyền Tài chính, và **mặc định tắt** cho mọi tài khoản kể cả người đã xem được lãi lỗ.

### Ba cột bị loại trừ khỏi mọi phép cộng

`Tổng Lương Năm` · `Tổng Lương Tháng` · `% Quỹ Lương` — đây là số cộng sẵn **lặp lại trên
từng dòng**. Cộng vào là nhân quỹ lương lên hàng trăm lần.

Quỹ lương lấy theo cột **Tổng Cộng**, không tự cộng các cột thành phần.

### Trang gồm

Bốn ô KPI (quỹ lương · số nhân sự · bình quân/người · **quỹ lương trên doanh thu**) ·
bộ lọc kỳ giống trang Tài chính · khối phân tích · biểu đồ theo bộ phận và theo chức vụ ·
diễn biến theo tháng kèm số nhân sự · bảng chi tiết theo bộ phận · bảng chi tiết theo nhân sự.

Chỉ số **quỹ lương / doanh thu** lấy doanh thu thuần cùng kỳ từ bảng `Báo Cáo Chi Tiết`,
nên cần cả `LARK_TABLE_FINANCE`. Thiếu biến đó thì ô này để trống, phần còn lại vẫn chạy.

### Trang tự soát những gì

| Phát hiện | Cách nhận biết |
|---|---|
| Cột sai công thức | Một khoản thành phần cộng lại **lớn hơn cả quỹ lương** → gắn nhãn đỏ `SAI` ngay trên tiêu đề cột và làm mờ số |
| Dòng nhập nhầm | `Thực Nhận` lệch `Tổng Cộng` quá 15% ở cùng một người |
| Bộ phận phình | Quỹ lương bộ phận tăng trên 15% so với kỳ trước (chỉ xét bộ phận chiếm ≥3% quỹ) |
| Người vào / người rời | So danh sách nhân sự giữa hai kỳ |
| Quỹ lương nặng | Trên 25% doanh thu → cảnh báo đỏ, 15–25% → lưu ý |

### Chỉ cần điền thông tin nhân sự MỘT tháng

`Ảnh` · `Bộ Phận` · `Chức Vụ` · `Giới Tính` là thông tin của con người, không đổi theo tháng — nên
**điền một tháng bất kỳ là đủ**, các tháng còn lại web tự lấy theo.

Quy tắc lấy: tháng gần nhất **đứng trước** có điền; không có thì lấy tháng gần nhất đứng sau.
Nhờ vậy vẫn giữ đúng lịch sử — ai đổi bộ phận giữa năm thì các tháng trước vẫn giữ bộ phận cũ,
không bị ghi đè bằng bộ phận mới nhất.

Trang ghi rõ đã tự điền bao nhiêu ô, ngay dưới tiêu đề bảng nhân sự.

### Bảng nhân sự có gì

| Cột | Ghi chú |
|---|---|
| Nhân sự | Ảnh + tên, kèm số thứ tự |
| Giới tính | Đọc từ cột `Giới Tính` trong Lark. Chưa có cột thì hiện `—` kèm gợi ý thêm |
| Bộ phận | Nhãn màu, **mỗi phòng một màu cố định** suy từ tên nên không nhảy màu khi thêm bộ phận mới |
| Chức vụ | |
| *(kỳ trước)* | Lương cùng kỳ liền trước — tiêu đề cột đổi theo kỳ đang xem |
| Tổng cộng | Cột trục chính, tô nền kem |
| Thay đổi | ▲ đỏ khi tăng, ▼ xanh khi giảm, nhãn `MỚI` cho người chưa có ở kỳ trước |
| Thực nhận · Lệch | Lệch quá 15% thì tô đỏ dòng kèm nhãn `SOÁT LẠI` |

### Ảnh nhân sự

Thêm vào bảng `Lương - Thưởng - Sakawin` một cột kiểu **Tệp đính kèm** rồi tải ảnh lên từng dòng.
**Đặt tên cột thế nào cũng được** — web nhận diện theo *kiểu dữ liệu* (cột tệp đính kèm của Lark
luôn là mảng có `file_token`), không dò theo tên. Có nhiều cột tệp thì ưu tiên cột tên giống "ảnh".
Trang tự hiện ảnh, **không cần sửa code**. Chưa có ảnh thì hiện vòng tròn chữ cái đầu tên.

Ảnh trong Lark phải kèm token mới tải được nên đi vòng qua `/api/quy-luong?anh=<file_token>`;
endpoint đó cũng đòi quyền **Quỹ lương**, người ngoài không xem trộm được.

### Soi số bất thường

Thấy một cột có số lạ mà mở Lark lại không thấy sai? Mở:

```
/api/quy-luong?soi=1&ky=thang&month=2026-07
```

Chỉ quản trị viên gọi được. Trả về từng cột kèm tổng, 8 dòng đóng góp lớn nhất,
**giá trị thô Lark trả về và kiểu dữ liệu**, cùng danh sách dòng trùng lặp
(một người xuất hiện hai lần trong cùng tháng thì mọi tổng đều sai).

So `giaTriDaDoc` với `giaTriTho` là biết ngay lỗi nằm ở khâu đọc hay ở dữ liệu gốc.

---

## Đăng nhập & phân quyền

Có **hai đường đăng nhập**, dùng song song:

| Đường | Cho ai | Cách cấp |
|---|---|---|
| 🟦 **Tài khoản Lark** | Nhân sự trong tổ chức `Sakawin Việt Nam` | Thêm email Lark của họ ở trang quản trị |
| 🟪 **Tên đăng nhập + mật khẩu** | Nhân sự ở tổ chức Lark khác | Chọn *Cấp mật khẩu*, web sinh chuỗi ngẫu nhiên |

Lark App chỉ chạy trong đúng một tổ chức — người ở org khác không mở được app, nên phải có
đường thứ hai. Ưu tiên đường Lark khi được: không phải phát mật khẩu, và nghỉ việc thì khoá
tài khoản Lark là mất quyền luôn.

### Cách cấp tài khoản mật khẩu

1. Trang quản trị → chọn **Cấp mật khẩu** → nhập tên đăng nhập (vd `linh.mkt`) → **Thêm tài khoản**
2. Web sinh mật khẩu 12 ký tự, hiện trong khung xanh **đúng một lần** → chép, gửi cho nhân sự
3. Họ đăng nhập lần đầu → web **bắt đổi mật khẩu** ngay, chưa đổi thì chưa xem được gì
4. Quên mật khẩu → bấm **Đặt lại MK** ở dòng của họ, web cấp chuỗi mới

**Mật khẩu gốc không lưu ở đâu cả** — chỉ lưu bản băm bằng scrypt kèm chuỗi muối riêng cho
từng tài khoản. Kể cả bạn cũng không xem lại được, chỉ có thể cấp mới.

**Chống dò mật khẩu:** sai 5 lần liên tiếp là khoá tài khoản 15 phút, kể cả sau đó nhập đúng.
Thông báo lỗi luôn là *"Tài khoản hoặc mật khẩu không đúng"* — không tiết lộ tài khoản có tồn tại hay không.

### Sáu quyền

| Quyền | Cho phép |
|---|---|
| Xem trang Doanh số & Target | Vào được trang báo cáo doanh số |
| Xem trang Tài chính & Lãi lỗ | Vào được trang tài chính (khi làm xong) |
| Xem Target và % hoàn thành | Thấy cột Target, % hoàn thành và cả khối kế hoạch tháng sau |
| Xem ngân sách ADS, %Ads và CPO | Thấy các cột chi phí quảng cáo và biểu đồ Ads |
| Được sửa số trực tiếp trên web | Hiện nút "Nhập số liệu" (sửa tạm, không ghi ngược về Lark) |
| Quản trị tài khoản | Vào được trang `/admin.html` để cấp quyền cho người khác |

**Mặc định khi thêm tài khoản mới:** thấy đầy đủ trang Doanh số & Target (cả target lẫn
ngân sách ADS), **không** thấy trang Tài chính & Lãi lỗ. Đúng chính sách đang áp dụng —
nhân sự xem doanh số thoải mái, chỉ số liệu tài chính là hạn chế.
Hai quyền "Xem Target" và "Xem ngân sách ADS" để dành cho trường hợp cần giấu bớt của riêng ai đó.

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
- **Security Settings → Redirect URLs**: thêm `https://<tên-miền>/api/auth/callback`
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
| `N kênh CÓ doanh thu nhưng CHƯA tick "LÊN BÁO CÁO"` | Thêm kênh mới trong Lark mà quên tick — kênh đó **không lên báo cáo**, tổng bị thiếu | Thanh vàng ghi rõ tên kênh và số tiền đang bị bỏ ngoài; mở Lark tick ô là xong |
| `Bảng doanh thu chưa có dòng nào hợp lệ` | Thiếu cột `Tháng` hoặc `Kênh Kinh Doanh` | Kiểm tra tên cột |
| `Không tìm thấy "X" tháng … trong bảng doanh thu` | Tên kênh 2 bảng lệch nhau | Sửa cho trùng tên |
| `HTTP 404` khi gọi /api/doanh-so | Thư mục `api/` chưa lên repo | Push lại |
| `Thiếu SESSION_SECRET` | Chưa khai biến | Khai rồi Redeploy |
| `Chưa kết nối kho lưu tài khoản` | Chưa tạo Upstash Redis | Xem mục Đăng nhập & phân quyền, bước 1 |
| Lark báo `redirect_uri mismatch` | Chưa khai Redirect URL trong Lark App | Thêm đúng `https://<tên-miền>/api/auth/callback` |
| `Tài khoản Lark không có email` | Thiếu scope `contact:user.email:readonly` | Thêm scope, tạo version mới, submit |
