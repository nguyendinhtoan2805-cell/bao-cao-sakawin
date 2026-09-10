"""Đọc file xlsx export của sàn — kể cả file hỏng của TikTok.

TikTok xuất file sai chuẩn: mỗi ô nằm trong một thẻ <row> riêng, nên một bảng
56 cột x 4052 dòng thành 226.912 thẻ <row>. Excel mở được nhưng pandas và
openpyxl đều đọc ra ĐÚNG MỘT CỘT — im lặng, không báo lỗi.

Cách đọc ở đây bỏ qua cấu trúc <row> hoàn toàn, chỉ nhặt mọi thẻ <c r="B12">
rồi dựng lại lưới từ chính địa chỉ ô. Nhờ vậy đọc được cả file đúng chuẩn lẫn
file hỏng bằng cùng một đường.
"""
import re
import zipfile
from html import unescape


def _so_cot(chu):
    """'A' -> 0, 'B' -> 1, 'AA' -> 26"""
    n = 0
    for c in chu:
        n = n * 26 + (ord(c) - 64)
    return n - 1


def _chuoi_chung(z):
    """sharedStrings.xml nếu có. Hai file hiện tại dùng inline string nên
    thường rỗng, nhưng sàn có thể đổi cách xuất bất cứ lúc nào."""
    ten = [n for n in z.namelist() if n.endswith('sharedStrings.xml')]
    if not ten:
        return []
    xml = z.read(ten[0]).decode('utf-8', errors='replace')
    return [unescape(re.sub(r'<[^>]+>', '', m))
            for m in re.findall(r'<si>(.*?)</si>', xml, re.S)]


def doc(duong_dan):
    """Trả về (ten_sheet, list các dòng, mỗi dòng là list ô dạng chuỗi)."""
    z = zipfile.ZipFile(duong_dan)
    wb = z.read('xl/workbook.xml').decode('utf-8', errors='replace')
    ten_sheet = (re.search(r'<sheet[^>]*name="([^"]*)"', wb) or [None, ''])[1]
    ten_sheet = unescape(ten_sheet)

    ws = [n for n in z.namelist() if n.startswith('xl/worksheets/sheet')]
    if not ws:
        raise ValueError('Không tìm thấy worksheet trong ' + duong_dan)
    xml = z.read(sorted(ws)[0]).decode('utf-8', errors='replace')
    chung = _chuoi_chung(z)

    o = {}
    rong = 0
    for m in re.finditer(r'<c r="([A-Z]+)(\d+)"([^>]*)>(.*?)</c>', xml, re.S):
        cot, dong, thuoc_tinh, noi = _so_cot(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
        kieu = (re.search(r't="([^"]+)"', thuoc_tinh) or [None, ''])[1]
        if kieu == 'inlineStr':
            t = re.search(r'<t[^>]*>(.*?)</t>', noi, re.S)
            gia_tri = unescape(t.group(1)) if t else ''
        elif kieu == 's':
            v = re.search(r'<v>(.*?)</v>', noi, re.S)
            i = int(v.group(1)) if v else -1
            gia_tri = chung[i] if 0 <= i < len(chung) else ''
        else:
            v = re.search(r'<v>(.*?)</v>', noi, re.S) or re.search(r'<t[^>]*>(.*?)</t>', noi, re.S)
            gia_tri = unescape(v.group(1)) if v else ''
        o.setdefault(dong, {})[cot] = gia_tri
        rong = max(rong, cot + 1)

    return ten_sheet, [[o[d].get(c, '') for c in range(rong)] for d in sorted(o)]
