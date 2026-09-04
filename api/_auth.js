/* =====================================================================
   Đăng nhập bằng tài khoản Lark + phân quyền.

   Phiên đăng nhập là một chuỗi JSON được ký HMAC-SHA256 bằng SESSION_SECRET,
   đặt trong cookie HttpOnly. Không sửa được từ trình duyệt.

   BIẾN MÔI TRƯỜNG:
     SESSION_SECRET   chuỗi ngẫu nhiên dài (tự sinh, xem HUONG-DAN.md)
     ADMIN_EMAILS     email các quản trị viên gốc, cách nhau bằng dấu phẩy.
                      Luôn có toàn quyền kể cả khi kho tài khoản trống —
                      đây là lối vào lần đầu và cũng là lối thoát nếu lỡ
                      tự gỡ quyền của chính mình.
     SITE_URL         (tuỳ chọn) địa chỉ web, vd https://bao-cao-sakawin.vercel.app
===================================================================== */
const crypto = require('crypto');
const { docDanhSach, ghiDanhSach } = require('./_store.js');

const SECRET = process.env.SESSION_SECRET || '';
const COOKIE = 'sakawin_session';
const HAN = 12 * 3600; // giây — hết 12 tiếng phải đăng nhập lại

/* ---------- Quyền ---------- */
const QUYEN = ['xem_doanh_so', 'xem_tai_chinh', 'xem_luong', 'xem_nhan_su', 'xem_ca_nhan', 'xem_target', 'xem_ads', 'duoc_sua', 'quan_tri'];
const NHAN_QUYEN = {
  xem_doanh_so: 'Xem trang Doanh số & Target',
  xem_tai_chinh: 'Xem trang Tài chính & Lãi lỗ',
  xem_luong: 'Xem trang Quỹ lương & Lương',
  xem_nhan_su: 'Xem trang Quản trị Nhân sự',
  xem_ca_nhan: 'Xem SĐT, địa chỉ, ngày sinh, email của nhân sự',
  xem_target: 'Xem Target và % hoàn thành',
  xem_ads: 'Xem ngân sách ADS, %Ads và CPO',
  duoc_sua: 'Được sửa số trực tiếp trên web',
  quan_tri: 'Quản trị tài khoản',
};
const quyenRong = () => Object.fromEntries(QUYEN.map(k => [k, false]));
const quyenDay = () => Object.fromEntries(QUYEN.map(k => [k, true]));

const adminGoc = () => (process.env.ADMIN_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/* =====================================================================
   MẬT KHẨU — dành cho nhân sự ở tổ chức Lark khác, không đăng nhập SSO được.
   Băm bằng scrypt của Node, mỗi tài khoản một chuỗi muối riêng. Mật khẩu gốc
   KHÔNG được lưu ở đâu cả: sinh ra, hiện một lần cho quản trị viên chép, xong.
===================================================================== */
const BANG_CHU = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';  // bỏ O/0/I/l cho khỏi nhìn nhầm
const SO_LAN_SAI_TOI_DA = 5;
const KHOA_PHUT = 15;

const sinhMatKhau = (n = 12) => Array.from(crypto.randomBytes(n))
  .map(b => BANG_CHU[b % BANG_CHU.length]).join('');

const bam = (mk, muoi) => crypto.scryptSync(String(mk), muoi, 64).toString('base64');

function datMatKhau(u, mk) {
  u.muoi = crypto.randomBytes(16).toString('base64');
  u.bam = bam(mk, u.muoi);
  u.loai = 'mk';
  u.sai = 0; u.khoaDen = 0;
  return u;
}

function kiemMatKhau(u, mk) {
  if (!u || !u.bam || !u.muoi) return false;
  const a = Buffer.from(u.bam, 'base64'), b = Buffer.from(bam(mk, u.muoi), 'base64');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const chuanTaiKhoan = t => String(t || '').trim().toLowerCase();
/* Chấp nhận cả email lẫn tên đăng nhập thường */
const taiKhoanHopLe = t => /^[a-z0-9][a-z0-9._@-]{2,63}$/.test(chuanTaiKhoan(t));

/* Đăng nhập bằng mật khẩu — trả về {ok, u} hoặc {ok:false, loi} */
async function dangNhapMatKhau(taiKhoan, matKhau) {
  const tk = chuanTaiKhoan(taiKhoan);
  const list = await docDanhSach();
  const i = list.findIndex(x => chuanTaiKhoan(x.email) === tk);
  const chung = 'Tài khoản hoặc mật khẩu không đúng.';   // không tiết lộ tài khoản có tồn tại hay không
  if (i < 0) return { ok: false, loi: chung };

  const u = list[i];
  if (u.khoaDen && Date.now() < u.khoaDen) {
    const phut = Math.ceil((u.khoaDen - Date.now()) / 60000);
    return { ok: false, loi: `Sai quá nhiều lần. Thử lại sau ${phut} phút.` };
  }
  if (u.kichHoat === false) return { ok: false, loi: 'Tài khoản đang bị tạm khoá.' };
  if (u.loai !== 'mk' || !u.bam) return { ok: false, loi: 'Tài khoản này đăng nhập bằng Lark, không dùng mật khẩu.' };

  if (!kiemMatKhau(u, matKhau)) {
    u.sai = (u.sai || 0) + 1;
    if (u.sai >= SO_LAN_SAI_TOI_DA) { u.khoaDen = Date.now() + KHOA_PHUT * 60000; u.sai = 0; }
    list[i] = u; await ghiDanhSach(list);
    return { ok: false, loi: chung };
  }
  u.sai = 0; u.khoaDen = 0;
  list[i] = u; await ghiDanhSach(list);
  return { ok: true, u };
}

/* ---------- Ký / mở phiên ---------- */
const b64 = s => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = s => Buffer.from(s, 'base64url').toString('utf8');
const hmac = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

function kyPhien(data) {
  if (!SECRET) throw new Error('Thiếu biến môi trường SESSION_SECRET trên Vercel.');
  const body = b64(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + HAN }));
  return body + '.' + hmac(body);
}

function moPhien(token) {
  if (!SECRET || !token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const mong = hmac(body);
  // So sánh theo thời gian cố định để không lộ thông tin qua tốc độ phản hồi
  if (sig.length !== mong.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mong))) return null;
  try {
    const d = JSON.parse(unb64(body));
    if (!d.exp || d.exp < Math.floor(Date.now() / 1000)) return null;
    return d;
  } catch { return null; }
}

/* ---------- Cookie ---------- */
const docCookie = (req, ten) => {
  const raw = req.headers.cookie || '';
  for (const p of raw.split(';')) {
    const [k, ...v] = p.trim().split('=');
    if (k === ten) return decodeURIComponent(v.join('='));
  }
  return '';
};
const datCookie = (res, ten, gt, giay) =>
  res.setHeader('Set-Cookie',
    `${ten}=${encodeURIComponent(gt)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${giay}`);

/* ---------- Người dùng hiện tại ---------- */
async function nguoiDung(req) {
  const p = moPhien(docCookie(req, COOKIE));
  if (!p || !p.email) return null;
  const email = String(p.email).toLowerCase();

  if (adminGoc().includes(email)) {
    return { email, ten: p.ten || email, quyen: quyenDay(), laAdminGoc: true };
  }
  const list = await docDanhSach();
  const u = list.find(x => String(x.email || '').toLowerCase() === email);
  if (!u || u.kichHoat === false) return { email, ten: p.ten || email, quyen: quyenRong(), chuaCapQuyen: !u, khoa: u && u.kichHoat === false };
  return {
    email, ten: u.ten || p.ten || email,
    quyen: { ...quyenRong(), ...(u.quyen || {}) },
    loai: u.loai === 'mk' ? 'mk' : 'lark',
    boPhan: u.boPhan || '',
    phaiDoiMatKhau: u.loai === 'mk' && u.phaiDoi === true,
  };
}

/* Chặn API: trả về người dùng, hoặc tự trả lỗi rồi trả null */
async function canhCong(req, res, quyenCan) {
  const u = await nguoiDung(req);
  if (!u) {
    res.status(401).json({ ok: false, error: 'Chưa đăng nhập.', canDangNhap: true });
    return null;
  }
  /* Mật khẩu do quản trị cấp là bí mật dùng chung trong chốc lát (admin biết, đã gửi
     qua chat). Chưa đổi thì chưa cho chạm vào số — chặn ở đây chứ không chỉ ở giao diện,
     vì giao diện thì gọi thẳng API là vượt được. */
  if (u.phaiDoiMatKhau) {
    res.status(403).json({ ok: false, phaiDoiMatKhau: true,
      error: 'Cần đổi mật khẩu do quản trị viên cấp trước khi xem báo cáo.' });
    return null;
  }
  if (quyenCan && !u.quyen[quyenCan]) {
    res.status(403).json({ ok: false, error: `Tài khoản ${u.email} chưa được cấp quyền "${NHAN_QUYEN[quyenCan]}".` });
    return null;
  }
  return u;
}

const siteUrl = req => (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/$/, '');

module.exports = {
  COOKIE, QUYEN, NHAN_QUYEN, quyenRong, quyenDay, adminGoc,
  sinhMatKhau, datMatKhau, kiemMatKhau, dangNhapMatKhau, chuanTaiKhoan, taiKhoanHopLe,
  kyPhien, moPhien, docCookie, datCookie, nguoiDung, canhCong, siteUrl,
};
