#!/usr/bin/env python3
"""Gộp file export các sàn thành bảng Tháng × Sản phẩm × Kênh để dán vào Lark Base.

    python3 chuan_hoa.py "SP-HÀ NỘI=Order.all.xlsx" "TIKTOKSHOP=Tat ca don.xlsx" \
        --danh-muc danh-muc-sku.csv --ra thang-08.csv

File Shopee KHÔNG cho biết nó là shop nào, nên phải khai kênh ở dòng lệnh.

Nguyên tắc xuyên suốt: gặp cái gì chưa biết thì DỪNG và nói ra, không bao giờ
âm thầm bỏ dòng. Một dòng bị bỏ lặng lẽ sẽ thành con số sai mà không ai biết.
"""
import argparse
import csv
import re
import sys
import unicodedata
from collections import defaultdict

from doc_xlsx import doc

# ── Cấu hình từng sàn ────────────────────────────────────────────────────────
# 'tinh'  : trạng thái được tính là đã bán
# 'bo'    : trạng thái cố ý loại (đơn huỷ)
# Trạng thái nào không nằm trong hai danh sách này sẽ làm công cụ dừng lại.
# Shopee tháng đang chạy sẽ có thêm trạng thái đơn đang giao — khi gặp, đọc tên
# chính xác trong thông báo lỗi rồi thêm vào 'tinh' ở đây.
SAN = {
    'OrderSKUList': {
        'ten': 'TikTok',
        'bo_dong_dau': 2,          # dòng 1 tiêu đề, dòng 2 là mô tả trường
        'cot': {'trang_thai': 'Order Status', 'sku': 'Seller SKU',
                'so_luong': 'Quantity', 'ngay': 'Created Time',
                'thanh_tien': 'SKU Subtotal After Discount',
                'bien_the': 'Variation'},
        'ngay_dang': 'dd/mm/yyyy',
        'tinh': {'Đã hoàn tất', 'Đã vận chuyển'},
        'bo': {'Đã hủy'},
    },
    'orders': {
        'ten': 'Shopee',
        'bo_dong_dau': 1,
        'cot': {'trang_thai': 'Trạng Thái Đơn Hàng', 'sku': 'SKU phân loại hàng',
                'so_luong': 'Số lượng', 'ngay': 'Ngày đặt hàng',
                'don_gia': 'Giá ưu đãi',   # Shopee không có thành tiền từng dòng
                'bien_the': 'Tên phân loại hàng'},
        'ngay_dang': 'yyyy-mm-dd',
        'tinh': {'Hoàn thành', 'Đang giao', 'Đang vận chuyển', 'Chờ giao hàng'},
        'bo': {'Đã hủy'},
    },
}


def chuan(s):
    """Đưa chuỗi về dạng dựng sẵn NFC trước khi so sánh.

    Shopee ghi 9/69 tên cột ở dạng phân rã (NFD): "Giá ưu đãi" trong file và
    "Giá ưu đãi" trong mã nguồn hiện lên giống hệt nhau nhưng khác byte, nên
    phép so sánh chuỗi thẳng sẽ trượt. Trạng thái đơn cũng có thể vướng y vậy.
    """
    return unicodedata.normalize('NFC', str(s)).strip()


def gop_ma(sku):
    """Rút mã listing của sàn về mã gộp.

    Cùng một sản phẩm được đăng nhiều listing khác nhau, phân biệt bằng hậu tố
    số hoặc '-CT'. Ví dụ C021-H, C021-H-1 ... C021-H-7 đều là một sản phẩm; để
    nguyên thì doanh số bị chia nhỏ và mã bán chạy tụt hạng oan.

    Đây chỉ là phép GỢI Ý để gom nhóm. Bảng danh mục mới là nơi chốt cuối:
    tra mã gốc trước, không có mới dùng mã gộp.
    """
    x = sku.strip()
    truoc = None
    while x != truoc:
        truoc = x
        x = re.sub(r'-\d+$', '', x)
        x = re.sub(r'-CT$', '', x)
        x = re.sub(r'-CT-', '-', x)
    return x


# Hậu tố cuối mã là màu. Suy sẵn để đỡ phải gõ 99 dòng; chữ nào chưa biết thì
# để nguyên cho dễ thấy mà sửa tay trong danh mục.
MAU = {'X': 'Xanh', 'H': 'Hồng', 'G': 'Ghi', 'N': 'Nâu', 'K': 'Kem', 'C': 'Cam',
       'T': 'Trắng', 'D': 'Đen', 'V': 'Vàng'}


def doan_mau(ma_gop):
    duoi = ma_gop.rsplit('-', 1)[-1] if '-' in ma_gop else ''
    return MAU.get(duoi.upper(), duoi.upper())


def doc_thang(gia_tri, dang):
    s = str(gia_tri).strip()
    if dang == 'dd/mm/yyyy':
        m = re.match(r'(\d{2})/(\d{2})/(\d{4})', s)
        return f'{m.group(3)}-{m.group(2)}' if m else None
    m = re.match(r'(\d{4})-(\d{2})', s)
    return f'{m.group(1)}-{m.group(2)}' if m else None


def so(v):
    s = re.sub(r'[^\d.-]', '', str(v))
    try:
        return float(s) if s not in ('', '-', '.') else 0.0
    except ValueError:
        return 0.0


def doc_nguon(duong_dan, kenh):
    """Đọc một file export, trả về (list dòng đã lọc, thống kê)."""
    ten_sheet, bang = doc(duong_dan)
    if ten_sheet not in SAN:
        raise SystemExit(
            f'✗ Không nhận ra sàn của file {duong_dan}\n'
            f'  Sheet tên "{ten_sheet}", mới biết: {", ".join(SAN)}\n'
            f'  Nếu đây là sàn mới, thêm cấu hình vào SAN trong chuan_hoa.py.')
    c = SAN[ten_sheet]
    tieu_de = [chuan(t) for t in bang[0]]

    thieu = [ten for ten in c['cot'].values() if chuan(ten) not in tieu_de]
    if thieu:
        raise SystemExit(
            f'✗ File {duong_dan} ({c["ten"]}) thiếu cột: {", ".join(thieu)}\n'
            f'  Sàn có thể đã đổi tên cột. Các cột đang có:\n  '
            + ' · '.join(tieu_de))
    vt = {k: tieu_de.index(chuan(v)) for k, v in c['cot'].items()}

    ket, la, bo_qua = [], defaultdict(int), 0
    for dong in bang[c['bo_dong_dau']:]:
        if len(dong) <= max(vt.values()):
            continue
        tt = chuan(dong[vt['trang_thai']])
        if not tt:
            continue
        if tt in {chuan(x) for x in c['bo']}:
            bo_qua += 1
            continue
        if tt not in {chuan(x) for x in c['tinh']}:
            la[tt] += 1
            continue
        thang = doc_thang(dong[vt['ngay']], c['ngay_dang'])
        sku = chuan(dong[vt['sku']])
        if not thang or not sku:
            continue
        sl = so(dong[vt['so_luong']])
        tien = (so(dong[vt['thanh_tien']]) if 'thanh_tien' in vt
                else so(dong[vt['don_gia']]) * sl)
        ket.append({'thang': thang, 'sku': sku, 'kenh': kenh,
                    'so_luong': sl, 'doanh_thu': tien,
                    'bien_the': chuan(dong[vt['bien_the']])})

    if la:
        chi_tiet = '\n'.join(f'    "{k}"  ({v} dòng)' for k, v in sorted(la.items(), key=lambda x: -x[1]))
        raise SystemExit(
            f'✗ File {duong_dan} ({c["ten"]}) có trạng thái chưa biết xử lý:\n{chi_tiet}\n\n'
            f'  Công cụ dừng thay vì bỏ qua, vì bỏ lặng lẽ sẽ làm hụt sản lượng\n'
            f'  mà không ai phát hiện. Mở chuan_hoa.py, thêm trạng thái trên vào\n'
            f'  SAN["{ten_sheet}"]["tinh"] nếu tính là đã bán, hoặc ["bo"] nếu không.')

    return ket, {'san': c['ten'], 'nhan': len(ket), 'huy': bo_qua}


def doc_danh_muc(duong_dan):
    """Bảng quy đổi mã sàn → sản phẩm chuẩn. Khoá có thể là mã gộp (thường)
    hoặc mã gốc của sàn (khi cần ghi đè cho một listing cá biệt)."""
    bang = {}
    with open(duong_dan, encoding='utf-8-sig', newline='') as f:
        for d in csv.DictReader(f):
            ma = (d.get('Mã sàn') or '').strip()
            if ma:
                bang[ma] = {k: (v or '').strip() for k, v in d.items()}
    return bang


def tra(bang, sku):
    return bang.get(sku) or bang.get(gop_ma(sku))


def sinh_danh_muc(dong, ra):
    """Sinh khung danh mục để điền tay, kèm đủ ngữ cảnh để nhận ra sản phẩm."""
    nhom = defaultdict(lambda: {'ma_goc': set(), 'ten': set(), 'so_luong': 0.0, 'doanh_thu': 0.0})
    for d in dong:
        g = nhom[gop_ma(d['sku'])]
        g['ma_goc'].add(d['sku'])
        if d.get('bien_the'):
            g['ten'].add(d['bien_the'])
        g['so_luong'] += d['so_luong']
        g['doanh_thu'] += d['doanh_thu']
    with open(ra, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Mã sàn', 'Sản phẩm chuẩn', 'Dòng SP', 'Phân khúc giá', 'Loại', 'Màu',
                    '— tên trên sàn', '— gồm các listing', '— đã bán', '— doanh thu'])
        for ma, g in sorted(nhom.items(), key=lambda x: -x[1]['doanh_thu']):
            w.writerow([ma, '', '', '', '', doan_mau(ma), ' / '.join(sorted(g['ten'])[:3]),
                        ' | '.join(sorted(g['ma_goc'])),
                        int(g['so_luong']), int(g['doanh_thu'])])
    print(f'✓ Đã sinh {ra} — {len(nhom)} mã cần khai, xếp theo doanh thu giảm dần.')
    print('  Điền 4 cột: Sản phẩm chuẩn · Dòng SP · Phân khúc giá · Loại')
    print('  Ba cột bắt đầu bằng "—" chỉ để anh nhận ra sản phẩm, công cụ không đọc.')


def main():
    p = argparse.ArgumentParser(description='Gộp export các sàn thành bảng Tháng × Sản phẩm × Kênh')
    p.add_argument('nguon', nargs='+', metavar='KÊNH=file.xlsx')
    p.add_argument('--danh-muc', help='CSV quy đổi mã sàn → sản phẩm chuẩn')
    p.add_argument('--sinh-danh-muc', metavar='FILE', help='Sinh khung danh mục rồi dừng')
    p.add_argument('--ra', help='CSV kết quả để dán vào Lark Base')
    a = p.parse_args()

    tat_ca, tom_tat = [], []
    for n in a.nguon:
        if '=' not in n:
            raise SystemExit(f'✗ "{n}" phải viết dạng KÊNH=đường/dẫn/file.xlsx')
        kenh, duong_dan = n.split('=', 1)
        dong, tk = doc_nguon(duong_dan, kenh.strip())
        tat_ca += dong
        tom_tat.append((kenh.strip(), tk))

    print('Đã đọc:')
    for kenh, tk in tom_tat:
        print(f'  {kenh:14s} {tk["san"]:7s} nhận {tk["nhan"]:5d} dòng · loại {tk["huy"]:5d} dòng đơn huỷ')

    if a.sinh_danh_muc:
        return sinh_danh_muc(tat_ca, a.sinh_danh_muc)

    if not a.danh_muc or not a.ra:
        raise SystemExit('✗ Cần --danh-muc và --ra (hoặc dùng --sinh-danh-muc trước).')

    bang = doc_danh_muc(a.danh_muc)
    chua_khai = sorted({d['sku'] for d in tat_ca if not tra(bang, d['sku'])})
    if chua_khai:
        raise SystemExit(
            f'✗ {len(chua_khai)} mã chưa có trong danh mục:\n  '
            + '\n  '.join(chua_khai[:25])
            + ('\n  ...' if len(chua_khai) > 25 else '')
            + '\n\n  Chạy lại với --sinh-danh-muc để lấy khung mới rồi bổ sung.')

    thieu_ten = sorted({gop_ma(d['sku']) for d in tat_ca
                        if not (tra(bang, d['sku']) or {}).get('Sản phẩm chuẩn')})
    if thieu_ten:
        raise SystemExit(
            f'✗ {len(thieu_ten)} mã có trong danh mục nhưng để trống "Sản phẩm chuẩn":\n  '
            + '\n  '.join(thieu_ten[:25]))

    gop = defaultdict(lambda: [0.0, 0.0])
    for d in tat_ca:
        m = tra(bang, d['sku'])
        k = (d['thang'], m['Sản phẩm chuẩn'], m.get('Dòng SP', ''),
             m.get('Phân khúc giá', ''), m.get('Loại', ''),
             m.get('Màu') or doan_mau(gop_ma(d['sku'])), d['kenh'])
        gop[k][0] += d['so_luong']
        gop[k][1] += d['doanh_thu']

    with open(a.ra, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Tháng', 'Sản phẩm', 'Dòng SP', 'Phân khúc giá', 'Loại', 'Màu', 'Kênh',
                    'Sản lượng', 'Doanh thu'])
        for k in sorted(gop, key=lambda x: (x[0], -gop[x][1])):
            w.writerow(list(k) + [int(gop[k][0]), int(gop[k][1])])

    tong_sl = sum(v[0] for v in gop.values())
    tong_dt = sum(v[1] for v in gop.values())
    print(f'\n✓ {a.ra} — {len(gop)} dòng · {int(tong_sl):,} cái · {int(tong_dt):,} đ')
    print('  Dán thẳng vào bảng DOANH SỐ SẢN PHẨM trong Lark Base.')


if __name__ == '__main__':
    main()
