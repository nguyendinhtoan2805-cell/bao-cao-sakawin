# Chuẩn hoá doanh số sản phẩm từ export các sàn

Gộp file export của Shopee / TikTok thành bảng **Tháng × Sản phẩm × Kênh** để dán vào
Lark Base, phục vụ trang Sản phẩm trên web.

Chạy bằng Python 3 có sẵn trên máy, **không cần cài gì thêm**.

## Dùng

Lần đầu — sinh khung danh mục để khai mã:

```bash
cd tools/doanh-so-san-pham
python3 chuan_hoa.py \
  "SP-HÀ NỘI=~/Desktop/Order.all.20260701_20260731.xlsx" \
  "TIKTOKSHOP=~/Desktop/Tất cả đơn hàng.xlsx" \
  --sinh-danh-muc danh-muc-sku.csv
```

Mở `danh-muc-sku.csv`, điền 4 cột: **Sản phẩm chuẩn · Dòng SP · Phân khúc giá · Loại**.
Ba cột bắt đầu bằng `—` chỉ để nhận ra sản phẩm, công cụ không đọc.

Hằng tháng — sinh bảng để dán vào Lark:

```bash
python3 chuan_hoa.py \
  "SP-HÀ NỘI=..." "SP-HCM=..." "TIKTOKSHOP=..." \
  --danh-muc danh-muc-sku.csv --ra thang-08.csv
```

File Shopee **không cho biết nó là shop nào**, nên phải khai kênh ở dòng lệnh.

Một lần chạy sinh **ba** file cạnh nhau:

| File | Nội dung | Bảng Lark |
|---|---|---|
| `thang-08.csv` | Tháng × Sản phẩm × Kênh | `DOANH SỐ SẢN PHẨM` |
| `thang-08-tinh.csv` | Tháng × Tỉnh × Vùng × Kênh | `KHÁCH THEO TỈNH` |
| `thang-08-thanh-toan.csv` | Tháng × Phương thức × Nhóm × Kênh | `THANH TOÁN` |

Hai bảng sau đếm theo **đơn hàng**, không theo dòng sản phẩm — một đơn chỉ có một
địa chỉ và một cách trả tiền, đếm theo dòng sẽ thổi phồng đơn nhiều món.

## Ba luật đã chốt

| | |
|---|---|
| Đơn tính là đã bán | Shopee `Hoàn thành` · TikTok `Đã hoàn tất`, `Đã vận chuyển` |
| Đơn huỷ | loại khỏi thống kê — chiếm **37–41%** giá trị trong file, không lọc là phồng ~70% |
| Dòng quà tặng 0đ | **vẫn tính số lượng**, doanh thu 0 — hàng đã rời kho thì phải được ghi nhận |

## Ba cái bẫy đã xử lý

**File TikTok sai chuẩn xlsx.** Mỗi ô nằm trong một thẻ `<row>` riêng — Excel mở được
nhưng pandas và openpyxl đọc ra đúng một cột, im lặng không báo lỗi. `doc_xlsx.py` bỏ qua
cấu trúc `<row>`, dựng lại lưới từ địa chỉ ô nên đọc được cả file đúng lẫn file hỏng.

**Shopee ghi tên cột ở dạng NFD.** 9/69 tên cột phân rã: `"Giá ưu đãi"` trong file và trong
mã nguồn hiện lên giống hệt nhau nhưng khác byte. Mọi so sánh chuỗi đi qua `chuan()`.

**Một sản phẩm có nhiều listing.** `C021-H` đến `C021-H-7` là cùng một bộ bàn ghế đăng 8 lần;
để nguyên thì doanh số bị chia nhỏ và mã bán chạy tụt hạng oan. `gop_ma()` gom lại, nhưng
bảng danh mục mới là nơi chốt cuối — tra mã gốc trước, không có mới dùng mã gộp.

**Tên tỉnh khác nhau giữa hai sàn.** TikTok ghi `Hà Nội`, Shopee ghi `Thành phố Hà Nội`,
`Tỉnh Đồng Nai`. `vung_tinh.py` bỏ tiền tố rồi tra về tên gọn và xếp vào 6 vùng. TikTok
còn có bản ghi hỏng `Phố Hà Nội` (mất chữ "Thành") — đã nhận diện riêng.

**Phương thức thanh toán tên khác hẳn.** TikTok 20 cách gọi, Shopee 10; `Thanh toán khi
giao hàng` và `Thanh toán khi nhận hàng` đều là COD. TikTok còn ghi ghép kiểu
`VNPAY + TikTok Shop Balance` khi khách trả một phần bằng số dư ví — lấy vế đầu vì đó
mới là cách khách chọn. `thanh_toan.py` quy về một danh sách chung kèm nhóm COD /
Trả trước / Trả sau.

## Nguyên tắc

Gặp cái gì chưa biết thì **dừng và nói ra**, không bao giờ âm thầm bỏ dòng: trạng thái lạ,
thiếu cột, mã chưa khai đều làm công cụ dừng kèm hướng dẫn sửa. Một dòng bị bỏ lặng lẽ sẽ
thành con số sai mà không ai phát hiện.

## Test

```bash
python3 -m unittest discover -s tools/doanh-so-san-pham
```

## Lưu ý

File CSV sinh ra chứa số liệu bán hàng và **không được commit** — repo này đang công khai.
`.gitignore` đã chặn sẵn.
