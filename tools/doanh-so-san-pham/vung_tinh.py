"""Xếp tỉnh vào vùng kinh tế, và chuẩn hoá tên tỉnh giữa các sàn.

TikTok ghi "Hà Nội", Shopee ghi "Thành phố Hà Nội" — cùng một nơi. Chuẩn hoá
bằng cách bỏ tiền tố "Tỉnh"/"Thành phố", bỏ dấu rồi mới tra.

Sáu vùng theo phân loại hành chính quen dùng, đúng cách nhóm trong sheet của
Toàn. Tỉnh nào không tra được thì trả "(chưa xếp vùng)" để nhìn thấy ngay mà
bổ sung, thay vì âm thầm rơi vào một nhóm sai.
"""
import re
import unicodedata

VUNG = {
    'Đồng bằng sông Hồng': [
        'Hà Nội', 'Phố Hà Nội',  # TikTok có bản ghi mất chữ "Thành"
        'Vĩnh Phúc', 'Bắc Ninh', 'Quảng Ninh', 'Hải Dương', 'Hải Phòng',
        'Hưng Yên', 'Thái Bình', 'Hà Nam', 'Nam Định', 'Ninh Bình'],
    'Trung du và miền núi phía Bắc': [
        'Hà Giang', 'Cao Bằng', 'Bắc Kạn', 'Tuyên Quang', 'Lào Cai', 'Yên Bái',
        'Thái Nguyên', 'Lạng Sơn', 'Bắc Giang', 'Phú Thọ', 'Điện Biên', 'Lai Châu',
        'Sơn La', 'Hòa Bình'],
    'Bắc Trung Bộ và Duyên hải miền Trung': [
        'Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Bình', 'Quảng Trị', 'Thừa Thiên Huế',
        'Huế', 'Đà Nẵng', 'Quảng Nam', 'Quảng Ngãi', 'Bình Định', 'Phú Yên',
        'Khánh Hòa', 'Ninh Thuận', 'Bình Thuận'],
    'Tây Nguyên': ['Kon Tum', 'Gia Lai', 'Đắk Lắk', 'Đắc Lắk', 'Đắk Nông', 'Lâm Đồng'],
    'Đông Nam Bộ': [
        'Bình Phước', 'Tây Ninh', 'Bình Dương', 'Đồng Nai', 'Bà Rịa - Vũng Tàu',
        'Bà Rịa Vũng Tàu', 'Hồ Chí Minh'],
    'Đồng bằng sông Cửu Long': [
        'Long An', 'Tiền Giang', 'Bến Tre', 'Trà Vinh', 'Vĩnh Long', 'Đồng Tháp',
        'An Giang', 'Kiên Giang', 'Cần Thơ', 'Hậu Giang', 'Sóc Trăng', 'Bạc Liêu',
        'Cà Mau'],
}

CHUA_XEP = '(chưa xếp vùng)'


def _goc(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    s = re.sub(r'[\u0300-\u036f]', '', s)
    s = s.replace('Đ', 'D').replace('đ', 'd').lower()
    s = re.sub(r'^(tinh|thanh pho|tp\.?)\s+', '', s.strip())
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


_TRA = {}
_TEN = {}
for _v, _ds in VUNG.items():
    for _t in _ds:
        _TRA[_goc(_t)] = _v
        _TEN.setdefault(_goc(_t), _t)


def chuan_ten_tinh(ten):
    """Bỏ tiền tố Tỉnh/Thành phố, trả về tên gọn thống nhất giữa các sàn."""
    g = _goc(ten)
    if not g:
        return ''
    return _TEN.get(g) or re.sub(r'^(Tỉnh|Thành phố|TP\.?)\s+', '', str(ten).strip())


def vung_cua(ten):
    return _TRA.get(_goc(ten), CHUA_XEP)
