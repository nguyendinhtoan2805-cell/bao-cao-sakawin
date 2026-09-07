/* =====================================================================
   /api/users — quản lý tài khoản & phân quyền. CHỈ quản trị viên gọi được.

     GET                      → danh sách tài khoản + danh mục quyền
     POST  {email,ten,quyen}  → thêm mới hoặc cập nhật (khoá theo email)
     DELETE ?email=...        → xoá tài khoản
===================================================================== */
const A = require('./_auth.js');
const S = require('./_store.js');

/* Tài khoản có thể là email Lark, cũng có thể là tên đăng nhập do admin đặt
   cho nhân sự ở tổ chức Lark khác — nên không ép định dạng email. */
const chuanEmail = A.chuanTaiKhoan;
const hopLe = A.taiKhoanHopLe;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const toi = await A.canhCong(req, res, 'quan_tri');
    if (!toi) return;

    if (!S.coKho()) {
      return res.status(200).json({
        ok: false,
        error: 'Chưa kết nối kho lưu tài khoản. Vào Vercel → Storage → tạo Upstash for Redis '
             + 'và nối vào project này (2 biến KV_REST_API_URL và KV_REST_API_TOKEN sẽ tự sinh), rồi Redeploy.',
      });
    }

    /* ---------- Xem danh sách ---------- */
    if (req.method === 'GET') {
      const list = await S.docDanhSach();
      return res.status(200).json({
        ok: true,
        toi: { email: toi.email, ten: toi.ten },
        adminGoc: A.adminGoc(),
        danhMucQuyen: A.QUYEN.map(k => ({ ma: k, nhan: A.NHAN_QUYEN[k] })),
        users: list.map(u => ({
          email: u.email, ten: u.ten || '',
          kichHoat: u.kichHoat !== false,
          loai: u.loai === 'mk' ? 'mk' : 'lark',
          phaiDoi: u.phaiDoi === true,
          bikhoa: !!(u.khoaDen && Date.now() < u.khoaDen),
          boPhan: u.boPhan || '',
          revision: u.revision || '0',
          quyen: { ...A.quyenRong(), ...(u.quyen || {}) },
        })),
      });
    }

    /* ---------- Thêm / sửa ---------- */
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const email = chuanEmail(b.email);
      if (!hopLe(email)) return res.status(200).json({ ok: false, error: 'Email không hợp lệ.' });

      const list = await S.docDanhSach();
      const i = list.findIndex(u => chuanEmail(u.email) === email);
      const cu = i >= 0 ? list[i] : null;
      if (cu && b.revision !== (cu.revision || '0'))
        return res.status(409).json({ ok: false, error: 'Tài khoản đã thay đổi hoặc trang quản trị đang dùng bản cũ. Tải lại trước khi lưu.' });

      // Chỉ cập nhật trường được gửi. Bỏ sót boPhan KHÔNG có nghĩa là mở toàn bộ.
      const co = k => Object.prototype.hasOwnProperty.call(b, k);
      if (co('boPhan') && (typeof b.boPhan !== 'string' || b.boPhan.length > 120
          || (b.boPhan.trim() && !/[\p{L}\p{N}]/u.test(b.boPhan))))
        return res.status(400).json({ ok: false, error: 'Tên bộ phận không hợp lệ.' });
      if (co('kichHoat') && typeof b.kichHoat !== 'boolean')
        return res.status(400).json({ ok: false, error: 'Trạng thái kích hoạt không hợp lệ.' });
      if (co('quyen') && (!b.quyen || typeof b.quyen !== 'object' || Array.isArray(b.quyen)
          || Object.entries(b.quyen).some(([k, v]) => !A.QUYEN.includes(k) || typeof v !== 'boolean')))
        return res.status(400).json({ ok: false, error: 'Danh sách quyền không hợp lệ.' });
      const boPhan = co('boPhan') ? b.boPhan.trim() : (cu?.boPhan ?? '');
      const coGioiHanCu = cu && cu.boPhan !== undefined && cu.boPhan !== null && cu.boPhan !== '';
      if (coGioiHanCu && !boPhan && b.xacNhanToanBo !== true)
        return res.status(400).json({ ok: false, error: 'Cần xác nhận mở phạm vi xem toàn bộ bộ phận.' });
      const quyen = A.quyenRong();
      for (const k of A.QUYEN) quyen[k] = co('quyen') && Object.hasOwn(b.quyen, k)
        ? b.quyen[k] : !!(cu && cu.quyen && cu.quyen[k] === true);

      /* Giữ nguyên phần mật khẩu đã có — sửa quyền không được làm mất mật khẩu */
      const ban = {
        ...(cu || {}),
        email, ten: String(b.ten || (cu && cu.ten) || '').trim(),
        kichHoat: co('kichHoat') ? b.kichHoat : (cu ? cu.kichHoat !== false : true), quyen,
        boPhan,
        revision: A.sinhMatKhau(24),
      };

      let matKhauMoi = null;
      const muonMatKhau = b.loai === 'mk' || b.datLaiMatKhau === true;
      if (muonMatKhau && (b.datLaiMatKhau === true || !cu || cu.loai !== 'mk')) {
        matKhauMoi = A.sinhMatKhau(12);
        A.datMatKhau(ban, matKhauMoi);
        ban.phaiDoi = true;          // bắt đổi ngay lần đăng nhập đầu
      }
      if (b.loai === 'lark' && ban.loai === 'mk' && !b.datLaiMatKhau) {
        delete ban.loai; delete ban.bam; delete ban.muoi; delete ban.phaiDoi;
      }
      if (i >= 0) list[i] = ban; else list.push(ban);

      await S.ghiDanhSach(list);
      return res.status(200).json({ ok: true, daLuu: email, matKhauMoi, revision: ban.revision });
    }

    /* ---------- Xoá ---------- */
    if (req.method === 'DELETE') {
      const email = chuanEmail((req.query && req.query.email) || '');
      if (!email) return res.status(200).json({ ok: false, error: 'Thiếu email cần xoá.' });
      if (A.adminGoc().includes(email)) {
        return res.status(200).json({
          ok: false,
          error: 'Đây là quản trị viên gốc (khai trong biến ADMIN_EMAILS), không xoá được từ đây. '
               + 'Muốn bỏ thì sửa biến ADMIN_EMAILS trên Vercel rồi Redeploy.',
        });
      }
      const list = await S.docDanhSach();
      const cu = list.find(u => chuanEmail(u.email) === email);
      if (cu && req.query.revision !== (cu.revision || '0'))
        return res.status(409).json({ ok: false, error: 'Tài khoản đã thay đổi. Tải lại trước khi xoá.' });
      const conLai = list.filter(u => chuanEmail(u.email) !== email);
      if (conLai.length === list.length) return res.status(200).json({ ok: false, error: 'Không tìm thấy tài khoản này.' });
      await S.ghiDanhSach(conLai, list);
      return res.status(200).json({ ok: true, daXoa: email });
    }

    return res.status(405).json({ ok: false, error: 'Phương thức không hỗ trợ.' });
  } catch (err) {
    return res.status(err.statusCode === 409 ? 409 : 200).json({ ok: false, error: String(err.message || err) });
  }
};
