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
const { duLieuMinhHoa, phuMinhHoa } = require('../lib/san-pham-demo.js');

const HOST = (process.env.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');
/* Ba bảng, mỗi bảng chỉ đọc đúng các cột khai ở đây — Base có thêm cột gì
   cũng không lọt ra ngoài. Bảng sản phẩm bắt buộc; hai bảng kia thiếu thì
   trang vẫn chạy, chỉ ẩn khối tương ứng, để Toàn dựng Base dần dần được. */
const BANG = {
  dong: { ten: 'DOANH SỐ SẢN PHẨM', batBuoc: true, so: ['sanLuong', 'doanhThu'], cot: {
    thang: 'Tháng', sanPham: 'Sản phẩm', dongSP: 'Dòng SP', phanKhuc: 'Phân khúc giá',
    loai: 'Loại', mau: 'Màu', kenh: 'Kênh', sanLuong: 'Sản lượng', doanhThu: 'Doanh thu' } },
  tinh: { ten: 'KHÁCH THEO TỈNH', batBuoc: false, so: ['soDon', 'doanhThu'], cot: {
    thang: 'Tháng', tinh: 'Tỉnh', vung: 'Vùng', kenh: 'Kênh',
    soDon: 'Số đơn', doanhThu: 'Doanh thu' } },
  thanhToan: { ten: 'THANH TOÁN', batBuoc: false, so: ['soDon', 'doanhThu'], cot: {
    thang: 'Tháng', phuongThuc: 'Phương thức', nhom: 'Nhóm', kenh: 'Kênh',
    soDon: 'Số đơn', doanhThu: 'Doanh thu' } },
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

async function dsBang(tk, base) {
  const r = await fetch(`${HOST}/open-apis/bitable/v1/apps/${base}/tables?page_size=100`,
    { headers: { Authorization: `Bearer ${tk}` } });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Đọc danh sách bảng thất bại (${j.code}): ${j.msg}`);
  return j.data?.items || [];
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
      const phu = phuMinhHoa();
      return res.status(200).json({
        ok: true, demo: true, capNhat: Date.now(), dong,
        tinh: phu.tinh, thanhToan: phu.thanhToan,
        thang: [...new Set(dong.map(d => d.thang))].sort(),
        kenh: [...new Set(dong.map(d => d.kenh))].sort(),
        thieuCot: [], thieuBang: [],
        tong: { dong: dong.length, tinh: phu.tinh.length, thanhToan: phu.thanhToan.length },
      });
    }

    const tk = await larkToken();
    const bangs = await dsBang(tk, base);
    const ket = {}, thieuBang = [], thieuCot = [];

    for (const [khoa, cfg] of Object.entries(BANG)) {
      const b = bangs.find(x => khongDau(x.name) === khongDau(cfg.ten));
      if (!b) {
        if (cfg.batBuoc) throw new Error(
          `Chưa có bảng "${cfg.ten}" trong Base. Các bảng đang có: `
          + (bangs.map(x => x.name).join(' · ') || '(trống)'));
        ket[khoa] = []; thieuBang.push(cfg.ten); continue;
      }
      const ghi = await docHet(tk, base, b.table_id);
      ket[khoa] = ghi.map(r => {
        const f = r.fields || {}, d = {};
        for (const [k, ten] of Object.entries(cfg.cot))
          d[k] = cfg.so.includes(k) ? so(f[ten]) : chu(f[ten]).trim();
        return d;
      }).filter(d => d.thang);
      for (const ten of Object.values(cfg.cot))
        if (ghi.length && !ghi.some(r => Object.hasOwn(r.fields || {}, ten)))
          thieuCot.push(`${cfg.ten} → ${ten}`);
    }

    const dong = ket.dong;
    return res.status(200).json({
      ok: true, demo: false, capNhat: Date.now(),
      dong, tinh: ket.tinh, thanhToan: ket.thanhToan,
      thang: [...new Set(dong.map(d => d.thang))].sort(),
      kenh: [...new Set(dong.map(d => d.kenh).filter(Boolean))].sort(),
      thieuCot, thieuBang,
      tong: { dong: dong.length, tinh: ket.tinh.length, thanhToan: ket.thanhToan.length },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
