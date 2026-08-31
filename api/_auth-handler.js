/* =====================================================================
   Ruột xử lý đăng nhập bằng tài khoản Lark (OAuth).
   Bốn file mỏng trong api/auth/ gọi vào đây:

     /api/auth/login     → đẩy sang Lark để xác thực
     /api/auth/callback  → Lark gọi về, đổi code lấy thông tin, phát phiên
     /api/auth/logout    → xoá phiên
     /api/auth/me        → ai đang đăng nhập và có quyền gì

   Cố ý dùng đường dẫn sạch thay vì ?action=... vì ô Redirect URL của Lark
   khó tính với chuỗi truy vấn.

   CẦN KHAI TRONG LARK APP (Security Settings → Redirect URLs):
     https://<tên-miền>/api/auth/callback
   và scope: contact:user.email:readonly  (để lấy email làm danh tính)
===================================================================== */
const crypto = require('crypto');
const A = require('./_auth.js');
const S = require('./_store.js');

const HOST = (process.env.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');
const ACCOUNTS = HOST.includes('feishu') ? 'https://accounts.feishu.cn' : 'https://accounts.larksuite.com';
const SCOPE = process.env.LARK_OAUTH_SCOPE || 'contact:user.email:readonly';
const STATE_COOKIE = 'sakawin_state';

const redirectUri = req => `${A.siteUrl(req)}/api/auth/callback`;

/* Đổi code lấy user_access_token — thử API v2 trước, không được thì lùi về v1 */
async function doiCodeLayToken(code, uri) {
  const r2 = await fetch(`${HOST}/open-apis/authen/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.LARK_APP_ID,
      client_secret: process.env.LARK_APP_SECRET,
      code, redirect_uri: uri,
    }),
  });
  const j2 = await r2.json();
  if (j2.access_token) return j2.access_token;

  // Lùi về v1: cần app_access_token trước
  const ra = await fetch(`${HOST}/open-apis/auth/v3/app_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const ja = await ra.json();
  if (ja.code !== 0) throw new Error(`Lark từ chối cấp app_access_token (code ${ja.code}): ${ja.msg}`);

  const r1 = await fetch(`${HOST}/open-apis/authen/v1/oidc/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${ja.app_access_token}` },
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
  });
  const j1 = await r1.json();
  if (j1.code === 0 && j1.data && j1.data.access_token) return j1.data.access_token;

  throw new Error(`Không đổi được mã đăng nhập. Lark trả về: ${j2.error_description || j2.error || j1.msg || 'không rõ'}`);
}

async function layThongTin(userToken) {
  const r = await fetch(`${HOST}/open-apis/authen/v1/user_info`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Không đọc được thông tin tài khoản Lark (code ${j.code}): ${j.msg}`);
  return j.data || {};
}

const trangLoi = (res, tieuDe, chiTiet) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).end(`<!doctype html><meta charset="utf-8">
<title>Không đăng nhập được</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:14vh auto;padding:0 24px;color:#1C1917;line-height:1.6}
h1{font-size:20px;color:#C8102E}pre{background:#FAFAF9;border:1px solid #E7E5E4;border-radius:8px;padding:12px;
white-space:pre-wrap;font-size:13px;color:#78716C}a{color:#C8102E;font-weight:700}</style>
<h1>${tieuDe}</h1><pre>${String(chiTiet).replace(/[<&]/g, c => c === '<' ? '&lt;' : '&amp;')}</pre>
<p><a href="/">← Quay lại trang báo cáo</a></p>`);
};

module.exports = action => async (req, res) => {
  try {
    /* ---------- me ---------- */
    if (action === 'me') {
      res.setHeader('Cache-Control', 'no-store');
      const u = await A.nguoiDung(req);
      return res.status(200).json(u
        ? { ok: true, dangNhap: true, ...u, nhanQuyen: A.NHAN_QUYEN }
        : { ok: true, dangNhap: false });
    }

    /* ---------- đăng nhập bằng mật khẩu ---------- */
    if (action === 'matkhau') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Chỉ nhận POST.' });
      if (!process.env.SESSION_SECRET) return res.status(200).json({ ok: false, error: 'Thiếu SESSION_SECRET trên Vercel.' });
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const kq = await A.dangNhapMatKhau(b.taiKhoan, b.matKhau);
      res.setHeader('Cache-Control', 'no-store');
      if (!kq.ok) return res.status(200).json({ ok: false, error: kq.loi });
      A.datCookie(res, A.COOKIE, A.kyPhien({ email: A.chuanTaiKhoan(kq.u.email), ten: kq.u.ten || kq.u.email }), 12 * 3600);
      return res.status(200).json({ ok: true, phaiDoiMatKhau: kq.u.phaiDoi === true });
    }

    /* ---------- tự đổi mật khẩu ---------- */
    if (action === 'doimatkhau') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Chỉ nhận POST.' });
      res.setHeader('Cache-Control', 'no-store');
      const toi = await A.nguoiDung(req);
      if (!toi) return res.status(401).json({ ok: false, error: 'Chưa đăng nhập.' });
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const moi = String(b.matKhauMoi || '');
      if (moi.length < 8) return res.status(200).json({ ok: false, error: 'Mật khẩu mới phải từ 8 ký tự trở lên.' });

      const list = await S.docDanhSach();
      const i = list.findIndex(x => A.chuanTaiKhoan(x.email) === A.chuanTaiKhoan(toi.email));
      if (i < 0 || list[i].loai !== 'mk') return res.status(200).json({ ok: false, error: 'Tài khoản này đăng nhập bằng Lark, không có mật khẩu để đổi.' });
      if (!A.kiemMatKhau(list[i], b.matKhauCu || '')) return res.status(200).json({ ok: false, error: 'Mật khẩu hiện tại không đúng.' });

      const ten = list[i].ten, quyen = list[i].quyen, kichHoat = list[i].kichHoat;
      list[i] = { ...list[i], ten, quyen, kichHoat, phaiDoi: false };
      A.datMatKhau(list[i], moi);
      list[i].phaiDoi = false;
      await S.ghiDanhSach(list);
      return res.status(200).json({ ok: true });
    }

    /* ---------- logout ---------- */
    if (action === 'logout') {
      A.datCookie(res, A.COOKIE, '', 0);
      res.writeHead(302, { Location: '/' });
      return res.end();
    }

    /* ---------- login ---------- */
    if (action === 'login') {
      if (!process.env.LARK_APP_ID) return trangLoi(res, 'Chưa cấu hình', 'Thiếu biến LARK_APP_ID trên Vercel.');
      if (!process.env.SESSION_SECRET) return trangLoi(res, 'Chưa cấu hình', 'Thiếu biến SESSION_SECRET trên Vercel.');
      const state = crypto.randomBytes(16).toString('hex');
      A.datCookie(res, STATE_COOKIE, state, 600);
      const u = new URL(`${ACCOUNTS}/open-apis/authen/v1/authorize`);
      u.searchParams.set('client_id', process.env.LARK_APP_ID);
      u.searchParams.set('redirect_uri', redirectUri(req));
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('state', state);
      if (SCOPE) u.searchParams.set('scope', SCOPE);
      res.writeHead(302, { Location: u.toString() });
      return res.end();
    }

    /* ---------- callback ---------- */
    if (action === 'callback') {
      const q = req.query || {};
      if (q.error) return trangLoi(res, 'Lark từ chối đăng nhập', `${q.error}\n${q.error_description || ''}`);
      if (!q.code) return trangLoi(res, 'Thiếu mã đăng nhập', 'Lark không gửi kèm tham số code.');
      if (!q.state || q.state !== A.docCookie(req, STATE_COOKIE)) {
        return trangLoi(res, 'Phiên đăng nhập không hợp lệ',
          'Mã state không khớp. Thường do mở lại link callback cũ — hãy bắt đầu lại từ trang chủ.');
      }

      const userToken = await doiCodeLayToken(q.code, redirectUri(req));
      const info = await layThongTin(userToken);
      const email = String(info.enterprise_email || info.email || '').toLowerCase();
      if (!email) {
        return trangLoi(res, 'Tài khoản Lark không có email',
          'Web dùng email làm danh tính. Hãy vào Lark App → Permissions & Scopes,\n' +
          'thêm quyền "contact:user.email:readonly", tạo version mới rồi thử lại.\n' +
          'Nếu tài khoản Lark thật sự chưa có email thì cần bổ sung trong Lark Admin.');
      }

      A.datCookie(res, STATE_COOKIE, '', 0);
      const token = A.kyPhien({ email, ten: info.name || info.en_name || email });
      A.datCookie(res, A.COOKIE, token, 12 * 3600);
      res.writeHead(302, { Location: '/' });
      return res.end();
    }

    return res.status(400).json({ ok: false, error: 'action không hợp lệ.' });
  } catch (err) {
    if (action === 'login' || action === 'callback') return trangLoi(res, 'Không đăng nhập được', err.message || err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: false, error: String(err.message || err) });
  }
};
