/* =====================================================================
   /api/quy-luong — Trang Quỹ lương & Lương
   Đọc bảng "Lương - Thưởng - Sakawin" (1 dòng = 1 nhân sự × 1 tháng).

   BA CỘT PHẢI LOẠI TRỪ vì là số cộng sẵn lặp lại trên mọi dòng — cộng vào
   là nhân số lên hàng trăm lần:
     "Tổng Lương Năm" · "Tổng Lương Tháng" · "% Quỹ Lương"

   Quỹ lương lấy theo "Tổng Cộng" và "Thực Nhận" (hai con số chốt), không
   tự cộng các cột thành phần — vì cột "Thưởng Thêm (nếu có)" đang chứa giá
   trị hàng tỷ do lỗi công thức, và chính bảng Lark cũng không cộng cột đó
   vào Tổng Cộng. Thay vào đó có phần đối chiếu để chỉ ra chỗ lệch.

   BIẾN MÔI TRƯỜNG:
     LARK_TABLE_SALARY    table_id bảng "Lương - Thưởng - Sakawin"
     LARK_TABLE_FINANCE   (đã có) — dùng để tính quỹ lương / doanh thu
===================================================================== */
const A = require('./_auth.js');
const HOST = (process.env.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');
const YEAR = Number(process.env.REPORT_YEAR) || 2026;

const txt = v => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object') ? (x.text ?? x.name ?? '') : String(x)).join('').trim();
  if (typeof v === 'object') {
    if (Array.isArray(v.value)) return txt(v.value);
    return String(v.text ?? v.name ?? v.value ?? '').trim();
  }
  return String(v).trim();
};
const num = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && !Array.isArray(v) && typeof v.value === 'number') return v.value;
  if (typeof v === 'object' && Array.isArray(v.value) && typeof v.value[0] === 'number') return v.value[0];
  const s = txt(v).replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;
  const sep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (sep === -1) return Number(s);
  return (s.length - sep - 1) === 3
    ? Number(s.replace(/[.,]/g, ''))
    : Number(s.slice(0, sep).replace(/[.,]/g, '') + '.' + s.slice(sep + 1));
};
const norm = s => txt(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');

/* Cột Tháng ở bảng này là lựa chọn dạng "T1", "T2"… */
const monthKey = (thang, nam) => {
  const raw = txt(thang);
  const d = raw.match(/^(\d{4})[-/](\d{1,2})$/);
  if (d) return `${d[1]}-${String(+d[2]).padStart(2, '0')}`;
  const t = raw.match(/^T\s*(\d{1,2})$/i);
  const m = t ? Number(t[1]) : num(thang);
  if (!m || m < 1 || m > 12) return '';
  return `${num(nam) || YEAR}-${String(m).padStart(2, '0')}`;
};
const shiftMonth = (k, d) => {
  const [y, m] = k.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
};
const thangCua = k => Number(k.split('-')[1]);
const namCua = k => Number(k.split('-')[0]);
const nhanThang = k => `T${thangCua(k)}/${namCua(k)}`;
function daiThang(tu, den) { const o = []; let c = tu; for (let i = 0; i < 240 && c <= den; i++) { o.push(c); c = shiftMonth(c, 1); } return o; }

function tinhKy(ky, moc, q) {
  const n = namCua(moc), m = thangCua(moc);
  switch (ky) {
    case 'quy': {
      const q0 = Math.floor((m - 1) / 3) * 3 + 1;
      return { tu: `${n}-${String(q0).padStart(2, '0')}`, den: `${n}-${String(q0 + 2).padStart(2, '0')}`,
               nhan: `Quý ${Math.floor((m - 1) / 3) + 1}/${n}`, phu: `T${q0}–T${q0 + 2}` };
    }
    case '3thang': { const tu = shiftMonth(moc, -2); return { tu, den: moc, nhan: '3 tháng gần nhất', phu: `${nhanThang(tu)} – ${nhanThang(moc)}` }; }
    case 'nam': return { tu: `${n}-01`, den: `${n}-12`, nhan: `Cả năm ${n}`, phu: 'Cộng dồn các tháng đã có số' };
    case 'tuychon': {
      const tu = monthKey(txt(q.tu)) || moc, den = monthKey(txt(q.den)) || moc;
      return tu <= den ? { tu, den, nhan: 'Khoảng tự chọn', phu: `${nhanThang(tu)} – ${nhanThang(den)}` }
                       : { tu: den, den: tu, nhan: 'Khoảng tự chọn', phu: `${nhanThang(den)} – ${nhanThang(tu)}` };
    }
    default: return { tu: moc, den: moc, nhan: `Tháng ${m}/${n}`, phu: '' };
  }
}

async function larkToken() {
  const r = await fetch(`${HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Lấy token Lark thất bại (code ${j.code}): ${j.msg}`);
  return j.tenant_access_token;
}
async function readTable(token, tableId, ten) {
  const out = []; let page = '';
  for (let i = 0; i < 20; i++) {
    const u = new URL(`${HOST}/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${tableId}/records`);
    u.searchParams.set('page_size', '500');
    if (page) u.searchParams.set('page_token', page);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    if (j.code !== 0) throw new Error(`Đọc bảng ${ten} thất bại (code ${j.code}): ${j.msg}`);
    for (const it of (j.data.items || [])) out.push(it.fields || {});
    if (!j.data.has_more) break;
    page = j.data.page_token;
  }
  return out;
}
const pick = (row, ...names) => {
  for (const n of names) if (row[n] !== undefined) return row[n];
  const keys = Object.keys(row);
  for (const n of names) { const h = keys.find(k => norm(k) === norm(n)); if (h) return row[h]; }
  return undefined;
};

const fmtTy = n => (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
const fmtTr = n => (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr';
const fmtPct = n => (n == null ? '—' : n.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%');

/* Cột thành phần lương — dùng để đối chiếu, KHÔNG dùng để cộng ra quỹ lương */
const THANH_PHAN = [
  { ma: 'luongCung', ten: 'Lương cứng', dau: 1 },
  { ma: 'luongTN', ten: 'Lương trách nhiệm', dau: 1 },
  { ma: 'phuCap', ten: 'Phụ cấp', dau: 1 },
  { ma: 'hoaHong', ten: 'Hoa hồng', dau: 1 },
  { ma: 'thuong', ten: 'Thưởng thêm', dau: 1 },
  { ma: 'giamTru', ten: 'Giảm trừ', dau: -1 },
];

/* ---------- Gộp ---------- */
function gom(list, khoa, nhan) {
  const m = new Map();
  for (const r of list) {
    const k = khoa(r) || '(chưa ghi)';
    if (!m.has(k)) m.set(k, { ten: k, tongCong: 0, thucNhan: 0, soNguoi: new Set(), luongCung: 0, luongTN: 0, phuCap: 0, hoaHong: 0, thuong: 0, giamTru: 0 });
    const o = m.get(k);
    o.tongCong += r.tongCong || 0; o.thucNhan += r.thucNhan || 0;
    o.soNguoi.add(norm(r.ten));
    for (const t of THANH_PHAN) o[t.ma] += r[t.ma] || 0;
  }
  return [...m.values()].map(o => ({ ...o, soNguoi: o.soNguoi.size, nhan }))
    .sort((a, b) => b.tongCong - a.tongCong);
}

/* ---------- Phân tích ---------- */
function phanTich({ tong, tongTruoc, coKyTruoc, boPhan, boPhanTruoc, nguoi, nguoiTruoc, doanhThu, kyNhan, kyTruocNhan, thieuSot, soThang }) {
  const nx = [];
  const bq = tong.soNguoi ? tong.tongCong / tong.soNguoi : null;

  nx.push({
    muc: '', tieuDe: `${kyNhan}: quỹ lương ${fmtTy(tong.tongCong)}`,
    noiDung: `${tong.soNguoi} nhân sự${soThang > 1 ? ` (bình quân mỗi tháng ${Math.round(tong.soNguoi / soThang)} người)` : ''}, `
      + `bình quân ${fmtTr(bq)}/người${soThang > 1 ? ' cho cả kỳ' : '/tháng'}. `
      + `Thực nhận ${fmtTy(tong.thucNhan)}`
      + (Math.abs(tong.thucNhan - tong.tongCong) > tong.tongCong * 0.02
          ? `, lệch ${fmtTy(Math.abs(tong.thucNhan - tong.tongCong))} so với tổng cộng — xem phần chưa chốt.` : '.'),
  });

  /* Quỹ lương trên doanh thu — chỉ số đáng nhìn nhất */
  if (doanhThu > 0) {
    const ty = tong.tongCong / doanhThu * 100;
    nx.push({
      muc: ty > 25 ? 'canh-bao' : (ty > 15 ? 'luu-y' : 'tot'),
      tieuDe: `Quỹ lương chiếm ${fmtPct(ty)} doanh thu thuần`,
      noiDung: `Doanh thu thuần cùng kỳ ${fmtTy(doanhThu)}, quỹ lương ${fmtTy(tong.tongCong)}. `
        + `Nghĩa là mỗi 100 đồng doanh thu đang gánh ${Math.round(ty)} đồng lương. `
        + (ty > 25 ? 'Mức này nặng — hoặc doanh thu chưa tương xứng với bộ máy, hoặc bộ máy đang phình.'
          : ty > 15 ? 'Mức này cần theo dõi, đừng để tăng thêm mà doanh thu đứng yên.'
          : 'Mức này gọn.'),
    });
  }

  /* So với kỳ trước */
  if (coKyTruoc && tongTruoc.tongCong > 0) {
    const tang = (tong.tongCong / tongTruoc.tongCong - 1) * 100;
    const tangNguoi = tong.soNguoi - tongTruoc.soNguoi;
    if (Math.abs(tang) >= 3 || tangNguoi !== 0) nx.push({
      muc: tang > 10 ? 'canh-bao' : (tang > 0 ? 'luu-y' : 'tot'),
      tieuDe: `Quỹ lương ${tang >= 0 ? 'tăng' : 'giảm'} ${fmtPct(Math.abs(tang))} so với ${kyTruocNhan}`,
      noiDung: `${fmtTy(tongTruoc.tongCong)} → ${fmtTy(tong.tongCong)}. `
        + `Nhân sự ${tongTruoc.soNguoi} → ${tong.soNguoi}`
        + (tangNguoi !== 0 ? ` (${tangNguoi > 0 ? '+' : ''}${tangNguoi} người)` : ' (không đổi)') + '. '
        + (tangNguoi === 0 && tang > 3 ? 'Số người không đổi mà quỹ tăng — do tăng lương, thưởng hay hoa hồng, cần truy rõ.' : ''),
    });
  }

  /* Bộ phận phình nhanh nhất */
  if (coKyTruoc && boPhanTruoc.length) {
    const truoc = new Map(boPhanTruoc.map(b => [b.ten, b.tongCong]));
    const bien = boPhan.map(b => {
      const t = truoc.get(b.ten) || 0;
      return { ten: b.ten, nay: b.tongCong, truoc: t, tang: t > 0 ? (b.tongCong / t - 1) * 100 : null };
    }).filter(b => b.nay > tong.tongCong * 0.03)
      .sort((a, b) => (b.tang ?? -999) - (a.tang ?? -999));
    const phinh = bien.filter(b => b.tang != null && b.tang >= 15);
    if (phinh.length) nx.push({
      muc: 'canh-bao', tieuDe: `${phinh.length} bộ phận tăng quỹ lương trên 15%`,
      noiDung: phinh.slice(0, 4).map(b => `${b.ten}: ${fmtTr(b.truoc)} → ${fmtTr(b.nay)} (+${fmtPct(b.tang)})`).join(' · ')
        + '. Đối chiếu với kết quả của các bộ phận này trước khi duyệt kỳ sau.',
    });
    const moi = boPhan.filter(b => !truoc.has(b.ten));
    if (moi.length) nx.push({
      muc: 'luu-y', tieuDe: `${moi.length} bộ phận mới xuất hiện trong kỳ`,
      noiDung: moi.map(b => `${b.ten} (${b.soNguoi} người, ${fmtTr(b.tongCong)})`).join(' · ') + '.',
    });
  }

  /* Bộ phận chiếm quỹ lớn nhất */
  if (boPhan.length) {
    const top = boPhan.slice(0, 3);
    nx.push({
      muc: '', tieuDe: 'Quỹ lương tập trung ở đâu',
      noiDung: top.map(b => `${b.ten} ${fmtTr(b.tongCong)} (${fmtPct(b.tongCong / tong.tongCong * 100)}, ${b.soNguoi} người)`).join(' · ')
        + `. Ba bộ phận này chiếm ${fmtPct(top.reduce((a, b) => a + b.tongCong, 0) / tong.tongCong * 100)} quỹ lương.`,
    });
  }

  /* Người vào / người rời */
  if (coKyTruoc) {
    const cu = new Set(nguoiTruoc.map(n => norm(n.ten)));
    const nay = new Set(nguoi.map(n => norm(n.ten)));
    const vao = nguoi.filter(n => !cu.has(norm(n.ten)));
    const roi = nguoiTruoc.filter(n => !nay.has(norm(n.ten)));
    if (vao.length || roi.length) nx.push({
      muc: 'luu-y', tieuDe: `Biến động nhân sự: ${vao.length} người mới, ${roi.length} người không còn trong bảng`,
      noiDung: (vao.length ? `Mới: ${vao.slice(0, 6).map(n => n.ten).join(', ')}${vao.length > 6 ? `…(+${vao.length - 6})` : ''}. ` : '')
        + (roi.length ? `Không còn: ${roi.slice(0, 6).map(n => n.ten).join(', ')}${roi.length > 6 ? `…(+${roi.length - 6})` : ''}. ` : '')
        + 'Kiểm tra xem là nghỉ việc thật hay chỉ chưa nhập số cho kỳ này.',
    });
  }

  if (thieuSot.length) nx.push({
    muc: 'chua-chot', tieuDe: `${thieuSot.length} điểm dữ liệu cần soát lại`,
    noiDung: thieuSot.slice(0, 8).join(' · ') + (thieuSot.length > 8 ? ` · và ${thieuSot.length - 8} mục nữa` : '')
      + '. Các con số phía trên đã tính cả những dòng này, nên soát xong nên xem lại.',
  });

  return nx;
}

/* Tên cột ảnh có thể đặt kiểu gì cũng nhận */
const laCotAnh = ten => /^(anh|hinh|hinhanh|avatar|anhnhansu|anhdaidien|photo)$/.test(norm(ten));

/* ---------- Handler ---------- */
module.exports = async (req, res) => {
  try {
    const toi = await A.canhCong(req, res, 'xem_luong');
    if (!toi) return;

    /* ===== Trả ảnh nhân sự: /api/quy-luong?anh=<file_token> =====
       Ảnh trong Lark phải kèm token mới tải được, trình duyệt không tự gọi
       thẳng được — nên đi vòng qua đây. Gộp vào endpoint này thay vì tạo hàm
       riêng vì gói Hobby của Vercel chỉ cho 12 hàm. */
    if (req.query && req.query.anh) {
      const fileToken = String(req.query.anh).replace(/[^A-Za-z0-9_-]/g, '');
      if (!fileToken) return res.status(400).end('token không hợp lệ');
      const tk = await larkToken();
      const r = await fetch(`${HOST}/open-apis/drive/v1/medias/${fileToken}/download`,
        { headers: { Authorization: `Bearer ${tk}` } });
      if (!r.ok) return res.status(404).end('không tải được ảnh');
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=86400');   // ảnh ít đổi, cho trình duyệt giữ 1 ngày
      return res.status(200).end(buf);
    }
    for (const k of ['LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_APP_TOKEN', 'LARK_TABLE_SALARY']) {
      if (!process.env[k]) throw new Error(`Thiếu biến môi trường ${k} trên Vercel.`);
    }

    const token = await larkToken();
    const [rows, finRows] = await Promise.all([
      readTable(token, process.env.LARK_TABLE_SALARY, 'Lương - Thưởng - Sakawin'),
      process.env.LARK_TABLE_FINANCE
        ? readTable(token, process.env.LARK_TABLE_FINANCE, 'Báo Cáo Chi Tiết').catch(() => [])
        : Promise.resolve([]),
    ]);
    if (!rows.length) throw new Error('Bảng Lương - Thưởng - Sakawin chưa có dòng nào.');

    const recs = rows.map(r => ({
      _tho: r,
      month: monthKey(pick(r, 'Tháng', 'Thang'), pick(r, 'Năm', 'Nam')),
      ten: txt(pick(r, 'Tên Nhân Sự', 'Ten Nhan Su', 'Họ tên', 'Nhân sự')),
      boPhan: txt(pick(r, 'Bộ Phận', 'Bo Phan', 'Phòng ban')) || '(chưa ghi)',
      chucVu: txt(pick(r, 'Chức Vụ', 'Chuc Vu', 'Vị trí')) || '(chưa ghi)',
      cong: num(pick(r, 'Ngày Công', 'Công', 'Ngay Cong')),
      heSo: num(pick(r, 'Hệ Số Lương', 'He So Luong', 'Hệ Số L')),
      luongCung: num(pick(r, 'Lương Cứng (Thực tế)', 'Luong Cung (Thuc te)')) || 0,
      luongTN: num(pick(r, 'Lương TN (Thực tế)', 'Luong TN (Thuc te)')) || 0,
      phuCap: num(pick(r, 'Phụ Cấp (Thực tế)', 'Phu Cap (Thuc te)')) || 0,
      hoaHong: num(pick(r, '% Hoa Hồng', 'Hoa Hồng', 'Hoa Hong')) || 0,
      thuong: num(pick(r, 'Thưởng Thêm (nếu có)', 'Thuong Them', 'Thưởng Thêm')) || 0,
      giamTru: num(pick(r, 'Giảm Trừ', 'Giam Tru')) || 0,
      tongCong: num(pick(r, 'Tổng Cộng', 'Tong Cong')) || 0,
      thucNhan: num(pick(r, 'Thực Nhận', 'Thuc Nhan')) || 0,
      ghiChu: txt(pick(r, 'Ghi Chú', 'Ghi Chu')),
      anh: (() => {
        const cot = Object.keys(r).find(laCotAnh);
        const v = cot ? r[cot] : null;
        if (Array.isArray(v) && v[0] && v[0].file_token) return v[0].file_token;
        return '';
      })(),
    })).filter(x => x.month && x.ten);

    const months = [...new Set(recs.filter(r => r.tongCong > 0 || r.thucNhan > 0).map(r => r.month))].sort();
    if (!months.length) throw new Error('Chưa tháng nào có số lương trong bảng.');

    const q = req.query || {};
    const ky = ['thang', 'quy', '3thang', 'nam', 'tuychon'].includes(txt(q.ky)) ? txt(q.ky) : 'thang';
    const moc = monthKey(txt(q.month)) || months[months.length - 1];
    const K = tinhKy(ky, moc, q);
    const trongKy = daiThang(K.tu, K.den).filter(m => months.includes(m));
    if (!trongKy.length) throw new Error(`Khoảng ${K.phu || K.nhan} chưa có tháng nào có số. Các tháng đang có: ${months.map(nhanThang).join(', ')}`);

    const soThang = trongKy.length;
    const truocDen = shiftMonth(trongKy[0], -1);
    const trongKyTruoc = daiThang(shiftMonth(truocDen, -(soThang - 1)), truocDen).filter(m => months.includes(m));
    const coKyTruoc = trongKyTruoc.length > 0;

    const trong = recs.filter(r => trongKy.includes(r.month));
    const truoc = recs.filter(r => trongKyTruoc.includes(r.month));

    const congTong = list => {
      const t = { tongCong: 0, thucNhan: 0, soNguoi: new Set() };
      for (const t2 of THANH_PHAN) t[t2.ma] = 0;
      for (const r of list) {
        t.tongCong += r.tongCong; t.thucNhan += r.thucNhan; t.soNguoi.add(norm(r.ten));
        for (const t2 of THANH_PHAN) t[t2.ma] += r[t2.ma];
      }
      return { ...t, soNguoi: t.soNguoi.size };
    };
    const tong = congTong(trong), tongTruoc = congTong(truoc);

    const boPhan = gom(trong, r => r.boPhan);
    const boPhanTruoc = gom(truoc, r => r.boPhan);
    const chucVu = gom(trong, r => r.chucVu);

    /* Từng người, gộp các tháng trong kỳ */
    const gomNguoi = list => {
      const m = new Map();
      for (const r of list) {
        const k = norm(r.ten);
        if (!m.has(k)) m.set(k, { ten: r.ten, boPhan: r.boPhan, chucVu: r.chucVu, soThang: 0, tongCong: 0, thucNhan: 0, ghiChu: '', anh: '',
          luongCung: 0, luongTN: 0, phuCap: 0, hoaHong: 0, thuong: 0, giamTru: 0 });
        const o = m.get(k);
        if (r.anh) o.anh = r.anh;
        o.soThang++; o.tongCong += r.tongCong; o.thucNhan += r.thucNhan;
        if (r.ghiChu && !o.ghiChu) o.ghiChu = r.ghiChu;
        for (const t of THANH_PHAN) o[t.ma] += r[t.ma];
      }
      return [...m.values()].sort((a, b) => b.tongCong - a.tongCong);
    };
    const nguoi = gomNguoi(trong), nguoiTruoc = gomNguoi(truoc);

    /* Doanh thu thuần cùng kỳ, để tính quỹ lương / doanh thu */
    let doanhThu = 0;
    for (const r of finRows) {
      const mk = monthKey(pick(r, 'Tháng', 'Thang'), pick(r, 'Năm', 'Nam'));
      if (trongKy.includes(mk)) doanhThu += num(pick(r, 'Doanh Thu Thuần', 'Doanh Thu Thuan')) || 0;
    }

    /* Điểm cần soát */
    const thieuSot = [];
    for (const n of nguoi) {
      if (n.tongCong > 0 && n.thucNhan > 0) {
        const lech = Math.abs(n.thucNhan - n.tongCong) / n.tongCong;
        if (lech > 0.15) thieuSot.push(`${n.ten}: tổng cộng ${fmtTr(n.tongCong)} nhưng thực nhận ${fmtTr(n.thucNhan)}`);
      }
      if (n.tongCong <= 0) thieuSot.push(`${n.ten}: chưa có số Tổng Cộng`);
      if (n.boPhan === '(chưa ghi)') thieuSot.push(`${n.ten}: chưa ghi bộ phận`);
    }
    /* Chỉ đích danh cột hỏng: một khoản thành phần mà lớn hơn cả Tổng Cộng
       thì chắc chắn sai công thức, không phải chuyện làm tròn */
    const nghiNgo = THANH_PHAN.filter(t => tong.tongCong > 0 && tong[t.ma] > tong.tongCong).map(t => t.ma);
    for (const ma of nghiNgo) {
      const t2 = THANH_PHAN.find(x => x.ma === ma);
      thieuSot.push(`Cột "${t2.ten}" cộng lại ra ${fmtTy(tong[ma])}, lớn hơn cả quỹ lương ${fmtTy(tong.tongCong)} — cột này đang sai công thức trong bảng Lark`);
    }
    const congThanhPhan = THANH_PHAN.reduce((a, t) => a + tong[t.ma] * t.dau, 0);
    if (!nghiNgo.length && tong.tongCong > 0 && Math.abs(congThanhPhan - tong.tongCong) > tong.tongCong * 0.02)
      thieuSot.push(`Cộng các cột thành phần ra ${fmtTy(congThanhPhan)} trong khi Tổng Cộng là ${fmtTy(tong.tongCong)} — có cột đang lệch`);

    const xuHuong = months.map(m => {
      const rs = recs.filter(r => r.month === m);
      const t = congTong(rs);
      return { thang: nhanThang(m), key: m, trongKy: trongKy.includes(m),
               tongCong: t.tongCong, thucNhan: t.thucNhan, soNguoi: t.soNguoi };
    });

    const kyTruocNhan = coKyTruoc ? (soThang === 1 ? nhanThang(trongKyTruoc[0]) : `${soThang} tháng trước đó`) : 'kỳ trước';
    const nhanXet = phanTich({ tong, tongTruoc, coKyTruoc, boPhan, boPhanTruoc, nguoi, nguoiTruoc,
                               doanhThu, kyNhan: K.nhan, kyTruocNhan, thieuSot, soThang });

    const vn = new Date(Date.now() + 7 * 3600 * 1000);
    const p2 = n => String(n).padStart(2, '0');
    const stamp = `${p2(vn.getUTCDate())}/${p2(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()} ${p2(vn.getUTCHours())}:${p2(vn.getUTCMinutes())}`;

    /* ===== Chế độ soi (?soi=1) — chỉ quản trị viên, để truy nguồn số bất thường =====
       Trả về: từng cột thành phần kèm tổng và 8 dòng đóng góp lớn nhất, giá trị thô
       và kiểu dữ liệu Lark trả về; cộng thêm kiểm tra dòng trùng. */
    let soi = null;
    if (txt(q.soi) === '1' && toi.quyen.quan_tri) {
      const kieu = v => v == null ? 'trống'
        : Array.isArray(v) ? 'mảng[' + (v[0] && typeof v[0] === 'object' ? Object.keys(v[0]).join('/') : typeof (v[0])) + ']'
        : typeof v === 'object' ? 'đối tượng{' + Object.keys(v).join('/') + '}'
        : typeof v;
      const TEN_COT = {
        luongCung: 'Lương Cứng (Thực tế)', luongTN: 'Lương TN (Thực tế)', phuCap: 'Phụ Cấp (Thực tế)',
        hoaHong: '% Hoa Hồng', thuong: 'Thưởng Thêm (nếu có)', giamTru: 'Giảm Trừ',
      };
      const dem = new Map();
      for (const r of trong) {
        const k = norm(r.ten) + '|' + r.month;
        dem.set(k, (dem.get(k) || 0) + 1);
      }
      soi = {
        soDongTrongKy: trong.length,
        thangTrongKy: trongKy,
        tenCotThayTrongBang: [...new Set(rows.flatMap(r => Object.keys(r)))],
        dongTrungLap: [...dem.entries()].filter(([, n]) => n > 1)
          .map(([k, n]) => `${k.split('|')[1]} — ${k.split('|')[0]} xuất hiện ${n} lần`),
        cot: THANH_PHAN.concat([{ ma: 'tongCong', ten: 'Tổng Cộng' }, { ma: 'thucNhan', ten: 'Thực Nhận' }])
          .map(t => ({
            ma: t.ma, ten: t.ten, tenCotLark: TEN_COT[t.ma] || t.ten, tong: tong[t.ma],
            top: trong.slice().sort((a, b) => (b[t.ma] || 0) - (a[t.ma] || 0)).slice(0, 8).map(r => ({
              ten: r.ten, boPhan: r.boPhan, thang: nhanThang(r.month),
              giaTriDaDoc: r[t.ma],
              giaTriTho: TEN_COT[t.ma] ? r._tho[TEN_COT[t.ma]] : undefined,
              kieuDuLieu: TEN_COT[t.ma] ? kieu(r._tho[TEN_COT[t.ma]]) : undefined,
            })),
          })),
      };
    }

    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({
      ok: true, ky, moc, months, soi,
      kyInfo: { nhan: K.nhan, phu: K.phu, tu: trongKy[0], den: trongKy[trongKy.length - 1], soThang, coKyTruoc, kyTruocNhan },
      toi: { email: toi.email, ten: toi.ten, quyen: toi.quyen },
      syncedAt: new Date().toISOString(),
      data: { tong, tongTruoc, coKyTruoc, boPhan, chucVu, nguoi, xuHuong, nhanXet, thieuSot, doanhThu,
              thanhPhan: THANH_PHAN, nghiNgo,
              coCotAnh: [...new Set(rows.flatMap(r => Object.keys(r)))].some(laCotAnh),
              sub: `Số liệu tự động đồng bộ từ Lark — bảng Lương - Thưởng - Sakawin · Cập nhật ${stamp} (giờ VN) · Đơn vị: đồng (VNĐ)` },
    });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: false, error: String(err.message || err) });
  }
};
