"""Chạy: python3 -m unittest discover tools/doanh-so-san-pham

Bốn chỗ dễ vỡ nhất được khoá ở đây, đều là lỗi đã gặp thật khi dựng công cụ:
tên cột dạng NFD, đơn huỷ, trạng thái lạ, và dòng quà tặng 0 đồng.
"""
import os
import sys
import unicodedata
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import chuan_hoa as C


def nfd(s):
    """Tạo chuỗi phân rã đúng cách Shopee ghi, không dán ký tự thật vào mã."""
    return unicodedata.normalize('NFD', s)


BANG_SHOPEE = [
    ['Mã đơn hàng', nfd('Trạng Thái Đơn Hàng'), 'Ngày đặt hàng',
     'SKU phân loại hàng', nfd('Tên phân loại hàng'), nfd('Giá ưu đãi'), 'Số lượng',
     nfd('Tỉnh/Thành phố'), 'Phương thức thanh toán'],
    ['A1', 'Hoàn thành',  '2026-07-01 10:00:00', 'C021-H-3', 'Bộ A66 Hồng', '3000000', '1',
     'Thành phố Hà Nội', 'Thanh toán khi nhận hàng'],
    ['A1', 'Hoàn thành',  '2026-07-01 10:00:00', 'VP03-N',   'Quà tặng',    '0',       '1',
     'Thành phố Hà Nội', 'Thanh toán khi nhận hàng'],
    ['A2', 'Đã hủy',      '2026-07-02 10:00:00', 'C021-H',   'Bộ A66 Hồng', '3000000', '2',
     'Tỉnh Đồng Nai', 'SPayLater'],
    ['A3', 'Hoàn thành',  '2026-07-03 10:00:00', 'C021-H',   'Bộ A66 Hồng', '2500000', '2',
     'Tỉnh Đồng Nai', 'SPayLater'],
]


class GopMa(unittest.TestCase):
    def test_bo_hau_to_listing(self):
        for vao, ra in [('C021-H-7', 'C021-H'), ('BV04-G-CT-2', 'BV04-G'),
                        ('BV04GV23-X-CT-1', 'BV04GV23-X'), ('GV23-G', 'GV23-G')]:
            self.assertEqual(C.gop_ma(vao), ra, vao)


class TenCotPhanRa(unittest.TestCase):
    """Shopee ghi 9/69 tên cột ở dạng NFD — nhìn giống hệt NFC nhưng khác byte.
    Trước khi có chuan() thì công cụ báo thiếu cột 'Giá ưu đãi' trong khi cột
    đó đang nằm ngay đó."""

    def test_van_doc_duoc(self):
        self.assertNotEqual(nfd('Giá ưu đãi'), 'Giá ưu đãi')       # khác byte thật
        self.assertEqual(C.chuan(nfd('Giá ưu đãi')), 'Giá ưu đãi')  # nhưng khớp sau khi chuẩn hoá


class DocNguon(unittest.TestCase):
    def setUp(self):
        self._goc = C.doc
        C.doc = lambda _: ('orders', BANG_SHOPEE)

    def tearDown(self):
        C.doc = self._goc

    def test_loai_don_huy_giu_don_thanh_cong(self):
        dong, tk = C.doc_nguon('gia-lap.xlsx', 'SP-HÀ NỘI')
        self.assertEqual(tk['huy'], 1)
        self.assertEqual(len(dong), 3)

    def test_dong_qua_tang_van_tinh_so_luong(self):
        """Toàn chốt: hàng đã rời kho thì phải được ghi nhận số lượng,
        dù doanh thu bằng 0. Bỏ đi là hụt một lượng sản phẩm lớn."""
        dong, _ = C.doc_nguon('gia-lap.xlsx', 'SP-HÀ NỘI')
        qua = [d for d in dong if d['sku'] == 'VP03-N'][0]
        self.assertEqual(qua['so_luong'], 1)
        self.assertEqual(qua['doanh_thu'], 0)

    def test_don_nhieu_mon_chi_dem_mot_lan(self):
        dong, _ = C.doc_nguon('gia-lap.xlsx', 'SP-HÀ NỘI')
        self.assertEqual(len(dong), 3)          # 3 dòng sản phẩm
        self.assertEqual(len(C.theo_don(dong)), 2)   # nhưng chỉ 2 đơn

    def test_doanh_thu_nhan_don_gia_voi_so_luong(self):
        dong, _ = C.doc_nguon('gia-lap.xlsx', 'SP-HÀ NỘI')
        d = [x for x in dong if x['sku'] == 'C021-H'][0]
        self.assertEqual(d['doanh_thu'], 5000000)   # 2.500.000 x 2

    def test_trang_thai_la_thi_dung_han(self):
        """Không bao giờ bỏ dòng trong im lặng: gặp trạng thái chưa khai thì
        dừng và nói tên nó ra, kèm chỗ cần sửa."""
        C.doc = lambda _: ('orders', BANG_SHOPEE + [
            ['A9', 'Đang đóng gói', '2026-07-04 10:00:00', 'C021-H', 'x', '100', '1',
             'Thành phố Hà Nội', 'Thanh toán khi nhận hàng']])
        with self.assertRaises(SystemExit) as e:
            C.doc_nguon('gia-lap.xlsx', 'SP-HÀ NỘI')
        self.assertIn('Đang đóng gói', str(e.exception))

    def test_thieu_cot_thi_bao_ro(self):
        C.doc = lambda _: ('orders', [['Mã đơn hàng', 'Số lượng'], ['A1', '1']])
        with self.assertRaises(SystemExit) as e:
            C.doc_nguon('gia-lap.xlsx', 'SP-HÀ NỘI')
        self.assertIn('thiếu cột', str(e.exception))


class DocThang(unittest.TestCase):
    def test_hai_dinh_dang_ngay(self):
        self.assertEqual(C.doc_thang('01/08/2026 00:10:32', 'dd/mm/yyyy'), '2026-08')
        self.assertEqual(C.doc_thang('2026-07-01 09:00:00', 'yyyy-mm-dd'), '2026-07')


if __name__ == '__main__':
    unittest.main()


import thanh_toan as TT
import vung_tinh as V


class TenTinh(unittest.TestCase):
    """Hai sàn gọi cùng một tỉnh bằng hai tên khác nhau."""

    def test_bo_tien_to_tinh_thanh_pho(self):
        for vao in ['Hà Nội', 'Thành phố Hà Nội', 'TP Hà Nội']:
            self.assertEqual(V.chuan_ten_tinh(vao), 'Hà Nội', vao)
        self.assertEqual(V.chuan_ten_tinh('Tỉnh Đồng Nai'), 'Đồng Nai')

    def test_ban_ghi_hong_cua_tiktok(self):
        """TikTok có bản ghi ghi thiếu chữ: 'Phố Hà Nội'. Dữ liệu nguồn sai,
        không phải lỗi tính toán — nhận diện rõ thay vì để rơi ra ngoài vùng."""
        self.assertEqual(V.vung_cua('Phố Hà Nội'), 'Đồng bằng sông Hồng')

    def test_tinh_la_thi_khong_doan_bua(self):
        self.assertEqual(V.vung_cua('Xứ sở thần tiên'), V.CHUA_XEP)

    def test_du_63_tinh(self):
        tat = {V.chuan_ten_tinh(t) for ds in V.VUNG.values() for t in ds}
        self.assertGreaterEqual(len(tat), 60)


class ThanhToan(unittest.TestCase):
    def test_hai_san_goi_khac_nhau_ve_cung_mot_moi(self):
        self.assertEqual(TT.quy_doi('Thanh toán khi giao hàng')[0],
                         TT.quy_doi('Thanh toán khi nhận hàng')[0])
        self.assertEqual(TT.quy_doi('Thanh toán khi giao hàng')[1], 'COD')

    def test_lay_ve_dau_cua_kieu_ghep(self):
        """TikTok ghi 'VNPAY + TikTok Shop Balance' khi khách trả một phần bằng
        số dư ví. Cách trả tiền khách chọn là VNPAY."""
        self.assertEqual(TT.quy_doi('VNPAY + TikTok Shop Balance')[0], 'VNPAY')
        self.assertEqual(TT.quy_doi('Zalopay + TikTok Shop Balance')[0], 'ZaloPay')

    def test_khong_biet_thi_danh_dau_chu_khong_dồn_vao_khac(self):
        ten, nhom = TT.quy_doi('Tiền ảo Doge')
        self.assertTrue(ten.startswith('❓'))
        self.assertEqual(nhom, 'Chưa xếp nhóm')


class TheoDon(unittest.TestCase):
    """Một đơn chỉ có một địa chỉ và một cách trả tiền, nên phải gộp về mức đơn
    trước khi đếm — nếu không, đơn nhiều món bị đếm nhiều lần."""

    def test_gop_nhieu_dong_ve_mot_don(self):
        dong = [
            {'kenh': 'SP', 'don': 'A1', 'thang': '2026-07', 'tinh': 'Hà Nội',
             'thanh_toan': 'COD', 'doanh_thu': 300},
            {'kenh': 'SP', 'don': 'A1', 'thang': '2026-07', 'tinh': 'Hà Nội',
             'thanh_toan': 'COD', 'doanh_thu': 200},
            {'kenh': 'SP', 'don': 'A2', 'thang': '2026-07', 'tinh': 'Hà Nội',
             'thanh_toan': 'COD', 'doanh_thu': 100},
        ]
        ra = C.theo_don(dong)
        self.assertEqual(len(ra), 2)
        self.assertEqual(sorted(x['doanh_thu'] for x in ra), [100, 500])
