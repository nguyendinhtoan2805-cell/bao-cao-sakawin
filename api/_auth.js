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
const { docDanhSach } = require('./_store.js');

const SECRET = process.env.SESSION_SECRET || '';
const COOKIE = 'sakawin_session';
const HAN = 12 * 3600; // giây — hết 12 tiếng phải đăng nhập lại

/* ---------- Quyền ---------- */
const QUYEN = ['xem_doanh_so', 'xem_tai_chinh', 'xem_target', 'xem_ads', 'duoc_sua', 'quan_tri'];
const NHAN_QUYEN = {
  xem_doanh_so: 'Xem trang Doanh số & Target',
  xem_tai_chinh: 'Xem trang Tài chính & Lãi lỗ',
  xem_target: 'Xem Target và % hoàn thành',
  xem_ads: 'Xem ngân sách ADS, %Ads và CPO',
  duoc_sua: 'Được sửa số trực tiếp trên web',
  quan_tri: 'Quản trị tài khoản',
};
const quyenRong = () => Object.fromEntries(QUYEN.map(k => [k, false]));
const quyenDay = () => Object.fromEntries(QUYEN.map(k => [k, true]));

const adminGoc = () => (process.env.ADMIN_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

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
  if (!u || u.kichHoat === false) return { email, ten: p.ten || email, quyen: quyenRong(), chuaCapQuyen: !u };
  return { email, ten: u.ten || p.ten || email, quyen: { ...quyenRong(), ...(u.quyen || {}) } };
}

/* Chặn API: trả về người dùng, hoặc tự trả lỗi rồi trả null */
async function canhCong(req, res, quyenCan) {
  const u = await nguoiDung(req);
  if (!u) {
    res.status(401).json({ ok: false, error: 'Chưa đăng nhập.', canDangNhap: true });
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
  kyPhien, moPhien, docCookie, datCookie, nguoiDung, canhCong, siteUrl,
};
