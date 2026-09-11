/* Trang Giao hàng — điều phối giao lắp nội thành HN / HCM.

   TRẠNG THÁI HIỆN TẠI: chỉ chạy dữ liệu MINH HOẠ. Base Lark chưa được tạo, nên
   ở đây chưa có đường đọc Lark — thêm vào khi Toàn dựng xong base, thay vì viết
   sẵn một khối mã không cách nào chạy thử.

   Ba việc trang này làm:
     · Bàn điều phối — xếp đơn vào người giao theo khung giờ
     · Sổ công nợ    — COD shipper đang cầm, công giao phải trả đối tác
     · Năng suất     — theo tuần/tháng, không theo ngày (20 đơn/ngày quá ít để đọc)
*/
const A = require('./_auth.js');
const { duLieuMinhHoa } = require('../lib/giao-hang-demo.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const toi = await A.canhCong(req, res, 'xem_giao_hang');
    if (!toi) return;

    const base = process.env.LARK_APP_TOKEN_GH;
    if (base) throw new Error(
      'Đã có LARK_APP_TOKEN_GH nhưng phần đọc Lark chưa làm. '
      + 'Base vừa tạo xong thì báo để nối vào — đừng để trang hiện số minh hoạ '
      + 'trong khi tưởng là số thật.');

    const d = duLieuMinhHoa();
    return res.status(200).json({
      ok: true, demo: true, capNhat: Date.now(),
      don: d.don, phien: d.phien, nguoiGiao: d.nguoiGiao, khungGio: d.khungGio,
      phanLoai: d.phanLoai.map(p => ({ ten: p.ten, xepNguoi: p.xepNguoi, canGio: p.canGio, coCod: p.coCod })),
      quyen: {
        dieuPhoi: toi.quyen.dieu_phoi === true,
        dongCongNo: toi.quyen.dong_cong_no === true,
      },
      tong: { don: d.don.length, phien: d.phien.length },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
