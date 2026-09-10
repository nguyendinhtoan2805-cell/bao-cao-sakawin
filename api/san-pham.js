/* Trang Sản phẩm — phân tích thuần sản phẩm, KHÔNG phải báo cáo tài chính.
   Ba việc: cơ cấu dải hàng · xếp hạng mã · xu hướng cho kế hoạch năm sau.

   Chỉ ĐỌC. Dữ liệu vào Base qua tools/doanh-so-san-pham/ chạy ở máy, nên ở đây
   không có đường ghi, không state machine, không CAS.

   Doanh thu ở đây là giá của chính sản phẩm (đã trừ giảm giá của listing),
   KHÔNG trừ voucher toàn đơn và không gồm phí ship. Cố ý như vậy để so sánh
   giữa các mã; hệ quả là số này không khớp báo cáo tài chính, và trang phải
   nói rõ điều đó vì nhiều phòng ban cùng xem.

   Biến môi trường: LARK_APP_TOKEN_SP — mã Base, lấy trong URL sau /wiki/ hoặc /base/
*/
const A = require('./_auth.js');
const { duLieuMinhHoa } = require('../lib/san-pham-demo.js');

const HOST = (process.env.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');
const TEN_BANG = 'DOANH SỐ SẢN PHẨM';

/* Chỉ đọc đúng 8 cột này. Base có thêm cột gì cũng không lọt ra ngoài. */
const COT = {
  thang: 'Tháng', sanPham: 'Sản phẩm', dongSP: 'Dòng SP',
  phanKhuc: 'Phân khúc giá', loai: 'Loại', mau: 'Màu', kenh: 'Kênh',
  sanLuong: 'Sản lượng', doanhThu: 'Doanh thu',
};

let khoCache = { tk: '', han: 0 };
async function larkToken() {
  if (khoCache.tk && Date.now() < khoCache.han) return khoCache.tk;
  const r = await fetch(`${HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Lấy token Lark thất bại (${j.code}): ${j.msg}`);
  khoCache = { tk: j.tenant_access_token, han: Date.now() + 100 * 60 * 1000 };
  return khoCache.tk;
}

const khongDau = s => String(s ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[Đđ]/g, 'd')
  .toLowerCase().replace(/\s+/g, ' ').trim();

async function timBang(tk, base) {
  const r = await fetch(`${HOST}/open-apis/bitable/v1/apps/${base}/tables?page_size=100`,
    { headers: { Authorization: `Bearer ${tk}` } });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Đọc danh sách bảng thất bại (${j.code}): ${j.msg}`);
  const bangs = j.data?.items || [];
  const b = bangs.find(x => khongDau(x.name) === khongDau(TEN_BANG));
  if (!b) throw new Error(
    `Chưa có bảng "${TEN_BANG}" trong Base. Các bảng đang có: `
    + (bangs.map(x => x.name).join(' · ') || '(trống)'));
  return b.table_id;
}

/* Lark trả tối đa 500 bản ghi mỗi lần. Đọc thiếu trang mà vẫn dựng báo cáo thì
   con số sai trong im lặng, nên hết trang mới trả về. */
async function docHet(tk, base, bang) {
  const ra = [];
  let trang = '';
  for (let i = 0; i < 60; i++) {
    const u = new URL(`${HOST}/open-apis/bitable/v1/apps/${base}/tables/${bang}/records`);
    u.searchParams.set('page_size', '500');
    if (trang) u.searchParams.set('page_token', trang);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${tk}` } });
    const j = await r.json();
    if (j.code !== 0) throw new Error(`Đọc bản ghi thất bại (${j.code}): ${j.msg}`);
    ra.push(...(j.data?.items || []));
    if (!j.data?.has_more) return ra;
    trang = j.data.page_token;
  }
  throw new Error('Bảng quá lớn so với dự kiến — dừng để không trả về số liệu thiếu.');
}

const chu = v => typeof v === 'string' ? v
  : Array.isArray(v) ? v.map(x => (x && (x.text || x.name)) || '').join('')
  : (v && (v.text || v.name)) || (v == null ? '' : String(v));

function so(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').replace(/[^\d.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const toi = await A.canhCong(req, res, 'xem_san_pham');
    if (!toi) return;

    /* Chưa cắm Base thì vẫn cho xem giao diện bằng số minh hoạ, để duyệt bố cục
       trước khi có dữ liệu thật. Trang hiện nhãn cảnh báo rất rõ, và chế độ này
       tự tắt ngay khi LARK_APP_TOKEN_SP có mặt — không có công tắc thủ công nào
       để quên bật lại. */
    const base = process.env.LARK_APP_TOKEN_SP;
    if (!base) {
      const dong = duLieuMinhHoa();
      return res.status(200).json({
        ok: true, demo: true, capNhat: Date.now(), dong,
        thang: [...new Set(dong.map(d => d.thang))].sort(),
        kenh: [...new Set(dong.map(d => d.kenh))].sort(),
        thieuCot: [], tong: { dong: dong.length, banGhi: dong.length },
      });
    }

    const tk = await larkToken();
    const bang = await timBang(tk, base);
    const ban_ghi = await docHet(tk, base, bang);

    const dong = [];
    for (const r of ban_ghi) {
      const f = r.fields || {};
      const d = {
        thang: chu(f[COT.thang]).trim(),
        sanPham: chu(f[COT.sanPham]).trim(),
        dongSP: chu(f[COT.dongSP]).trim(),
        phanKhuc: chu(f[COT.phanKhuc]).trim(),
        loai: chu(f[COT.loai]).trim(),
        mau: chu(f[COT.mau]).trim(),
        kenh: chu(f[COT.kenh]).trim(),
        sanLuong: so(f[COT.sanLuong]),
        doanhThu: so(f[COT.doanhThu]),
      };
      if (d.thang && d.sanPham) dong.push(d);
    }

    const thieu = Object.values(COT).filter(
      ten => !ban_ghi.some(r => Object.hasOwn(r.fields || {}, ten)));

    return res.status(200).json({
      ok: true,
      demo: false,
      capNhat: Date.now(),
      dong,
      thang: [...new Set(dong.map(d => d.thang))].sort(),
      kenh: [...new Set(dong.map(d => d.kenh).filter(Boolean))].sort(),
      thieuCot: thieu,
      tong: { dong: dong.length, banGhi: ban_ghi.length },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
