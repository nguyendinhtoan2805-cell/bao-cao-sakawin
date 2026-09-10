"""Quy đổi tên phương thức thanh toán của từng sàn về một danh sách chung.

TikTok có 20 cách gọi, Shopee có 10, và cùng một thứ lại đặt tên khác nhau:
"Thanh toán khi giao hàng" với "Thanh toán khi nhận hàng" đều là COD.

TikTok còn ghi kiểu ghép khi khách trả một phần bằng số dư ví, ví dụ
"VNPAY + TikTok Shop Balance". Lấy vế đầu vì đó mới là cách trả tiền thật sự
khách chọn; phần số dư chỉ là bù trừ.

Tên nào chưa biết thì giữ nguyên kèm dấu ❓ để nhìn ra ngay mà bổ sung, chứ
không dồn vào "Khác" rồi quên mất.
"""
import re
import unicodedata

# (mẫu tìm trong tên đã bỏ dấu, tên chuẩn, nhóm)
LUAT = [
    (r'khi (giao|nhan) hang|\bcod\b', 'Thanh toán khi nhận hàng', 'COD'),
    (r'tra gop', 'Trả góp thẻ tín dụng', 'Trả trước'),
    (r'the (tin dung|ghi no)|tin dung/', 'Thẻ tín dụng / ghi nợ', 'Trả trước'),
    (r'atm noi dia|noi dia napas|napas', 'Thẻ ATM nội địa', 'Trả trước'),
    (r'\bqr\b|quet ma', 'Quét mã QR', 'Trả trước'),
    (r'momo', 'Ví MoMo', 'Trả trước'),
    (r'vnpay', 'VNPAY', 'Trả trước'),
    (r'zalopay', 'ZaloPay', 'Trả trước'),
    (r'apple pay', 'Apple Pay', 'Trả trước'),
    (r'google pay', 'Google Pay', 'Trả trước'),
    (r'samsung pay', 'Samsung Pay', 'Trả trước'),
    (r'ngan hang lien ket', 'Ngân hàng liên kết ShopeePay', 'Trả trước'),
    (r'paylater|tra sau', 'Trả sau (PayLater)', 'Trả sau'),
    (r'shopeepay|shopee pay', 'Ví ShopeePay', 'Trả trước'),
    (r'tiktok (shop )?balance|so du tiktok', 'Số dư TikTok', 'Trả trước'),
]


def _goc(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    s = re.sub(r'[\u0300-\u036f]', '', s)
    return s.replace('Đ', 'D').replace('đ', 'd').lower().strip()


def quy_doi(ten):
    """Trả về (tên chuẩn, nhóm)."""
    raw = str(ten or '').strip()
    if not raw:
        return ('(không ghi)', '(không ghi)')
    dau = _goc(raw.split('+')[0])
    for mau, chuan, nhom in LUAT:
        if re.search(mau, dau):
            return (chuan, nhom)
    return ('❓ ' + raw, 'Chưa xếp nhóm')
