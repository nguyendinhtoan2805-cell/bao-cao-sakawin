/* =====================================================================
   /api/tai-chinh — Trang Tài chính & Lãi lỗ
   Đọc bảng "Báo Cáo Chi Tiết - 2026" trong Base TỔNG QUAN DOANH SỐ 2026.

   TỰ DÒ CỘT CHI PHÍ: cột số nào không nằm trong nhóm doanh thu / giá vốn /
   lợi nhuận / phần trăm thì được hiểu là một khoản chi phí. Thêm cột chi phí
   mới trong Lark là trang tự hiện, không phải sửa code.

   BIẾN MÔI TRƯỜNG (ngoài các biến Lark đã có):
     LARK_TABLE_FINANCE   table_id bảng "Báo Cáo Chi Tiết - 2026"
===================================================================== */
const A = require('./_auth.js');
const HOST = (process.env.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');
const YEAR = Number(process.env.REPORT_YEAR) || 2026;

/* ---------- Đọc giá trị Lark ---------- */
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

const monthKey = (thang, nam) => {
  const raw = txt(thang);
  const d = raw.match(/^(\d{4})[-/](\d{1,2})$/);
  if (d) return `${d[1]}-${String(+d[2]).padStart(2, '0')}`;
  const m = num(thang);
  if (!m || m < 1 || m > 12) return '';
  return `${num(nam) || YEAR}-${String(m).padStart(2, '0')}`;
};
const shiftMonth = (k, d) => {
  const [y, m] = k.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
};
const grpOf = v => {
  const k = norm(v);
  if (k.includes('shopee')) return 'shopee';
  if (k.includes('tiktok')) return 'tiktok';
  if (k.includes('aeon') || k.startsWith('go') || k.includes('showroom')) return 'off';
  return 'khac';
};

/* ---------- Lark ---------- */
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
  const out = [];
  let page = '';
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
  for (const n of names) {
    const hit = keys.find(k => norm(k) === norm(n));
    if (hit) return row[hit];
  }
  return undefined;
};

/* Cột KHÔNG phải chi phí (đã có ý nghĩa riêng, hoặc là phần trăm) */
/* Cột định danh — so khớp theo tiền tố */
const COT_DINH_DANH = ['thang', 'nam', 'quy', 'shop', 'nguon', 'nentang', 'kenhkinhdoanh',
  'ghichu', 'stt', 'thutu', 'nhan'];
/* Từ khoá chỉ ra cột KHÔNG phải chi phí — dò ở BẤT KỲ vị trí nào trong tên.
   Phải dùng includes chứ không phải startsWith: cột thật trong Base tên là
   "Tổng Doanh Thu Năm", nếu chỉ so tiền tố thì nó lọt vào nhóm chi phí và
   một mình chiếm 100% biểu đồ cơ cấu. */
const TU_KHOA_KHONG_PHAI_CHI_PHI = /doanhthu|giavon|loinhuan|bien|traffic|tienrutve|phantram|^pct/;
const laCotChiPhi = ten => {
  const n = norm(ten);
  if (ten.includes('%')) return false;
  if (TU_KHOA_KHONG_PHAI_CHI_PHI.test(n)) return false;
  // Cột "Tổng ..." thường là cột cộng sẵn — lấy vào là cộng trùng
  if (n.startsWith('tong')) return false;
  return !COT_DINH_DANH.some(x => n === x || n.startsWith(x));
};

const fmtTy = n => (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
const fmtPct = n => (n == null ? '—' : n.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%');

/* =====================================================================
   KỲ BÁO CÁO — tháng / quý / 3 tháng / cả năm / tự chọn
===================================================================== */
const thangCua = k => Number(k.split('-')[1]);
const namCua  = k => Number(k.split('-')[0]);
const nhanThang = k => `T${thangCua(k)}/${namCua(k)}`;

/* Danh sách tháng từ tu đến den (bao gồm hai đầu) */
function daiThang(tu, den) {
  const out = [];
  let c = tu;
  for (let i = 0; i < 240 && c <= den; i++) { out.push(c); c = shiftMonth(c, 1); }
  return out;
}

function tinhKy(ky, moc, q) {
  const n = namCua(moc), m = thangCua(moc);
  switch (ky) {
    case 'quy': {
      const q0 = Math.floor((m - 1) / 3) * 3 + 1;
      const tu = `${n}-${String(q0).padStart(2, '0')}`, den = `${n}-${String(q0 + 2).padStart(2, '0')}`;
      return { tu, den, nhan: `Quý ${Math.floor((m - 1) / 3) + 1}/${n}`, phu: `T${q0}–T${q0 + 2}` };
    }
    case '3thang': {
      const tu = shiftMonth(moc, -2);
      return { tu, den: moc, nhan: `3 tháng gần nhất`, phu: `${nhanThang(tu)} – ${nhanThang(moc)}` };
    }
    case 'nam':
      return { tu: `${n}-01`, den: `${n}-12`, nhan: `Cả năm ${n}`, phu: 'Cộng dồn các tháng đã có số' };
    case 'tuychon': {
      const tu = monthKey(txt(q.tu)) || moc, den = monthKey(txt(q.den)) || moc;
      return tu <= den
        ? { tu, den, nhan: 'Khoảng tự chọn', phu: `${nhanThang(tu)} – ${nhanThang(den)}` }
        : { tu: den, den: tu, nhan: 'Khoảng tự chọn', phu: `${nhanThang(den)} – ${nhanThang(tu)}` };
    }
    default:
      return { tu: moc, den: moc, nhan: `Tháng ${m}/${n}`, phu: '' };
  }
}

/* Gộp nhiều tháng lại theo từng điểm bán */
function gomTheoShop(list) {
  const m = new Map();
  for (const r of list) {
    const k = norm(r.name);
    if (!m.has(k)) m.set(k, { name: r.name, grp: r.grp, nguon: r.nguon, dtt: 0, gv: 0, lnGop: 0, lnRong: 0, chiPhi: {} });
    const o = m.get(k);
    o.dtt += r.dtt || 0; o.gv += r.gv || 0; o.lnGop += r.lnGop || 0; o.lnRong += r.lnRong || 0;
    for (const [c, v] of Object.entries(r.chiPhi)) o.chiPhi[c] = (o.chiPhi[c] || 0) + v;
  }
  return [...m.values()].map(s => {
    const tongChiPhi = Object.values(s.chiPhi).reduce((a, b) => a + b, 0);
    return { ...s, tongChiPhi,
      gvPct: s.dtt > 0 ? s.gv / s.dtt * 100 : null,
      gopPct: s.dtt > 0 ? s.lnGop / s.dtt * 100 : null,
      rongPct: s.dtt > 0 ? s.lnRong / s.dtt * 100 : null };
  }).filter(s => s.dtt > 0 || s.tongChiPhi > 0)
    .sort((a, b) => b.dtt - a.dtt);
}
const congTong = shops => ({
  dtt: shops.reduce((a, s) => a + s.dtt, 0), gv: shops.reduce((a, s) => a + s.gv, 0),
  lnGop: shops.reduce((a, s) => a + s.lnGop, 0), lnRong: shops.reduce((a, s) => a + s.lnRong, 0),
  tongChiPhi: shops.reduce((a, s) => a + s.tongChiPhi, 0),
});
const gomChiPhi = shops => {
  const g = {};
  for (const s of shops) for (const [k, v] of Object.entries(s.chiPhi)) g[k] = (g[k] || 0) + v;
  return g;
};

/* =====================================================================
   PHÂN TÍCH CHI PHÍ — so từng khoản với kỳ trước
===================================================================== */
function soatChiPhi(nay, truoc, dttNay, dttTruoc, coKyTruoc) {
  const tenCot = [...new Set([...Object.keys(nay), ...Object.keys(truoc)])];
  const tongNay = Object.values(nay).reduce((a, b) => a + b, 0) || 1;

  return tenCot.map(ten => {
    const tien = nay[ten] || 0, tienTruoc = truoc[ten] || 0;
    const tyTrong = tien / tongNay * 100;
    const pctDT = dttNay > 0 ? tien / dttNay * 100 : null;
    const pctDTTruoc = dttTruoc > 0 ? tienTruoc / dttTruoc * 100 : null;
    const tang = tienTruoc > 0 ? (tien / tienTruoc - 1) * 100 : (tien > 0 ? null : 0);
    const lechDT = (pctDT != null && pctDTTruoc != null) ? pctDT - pctDTTruoc : null;

    /* Cờ cảnh báo — chỉ bật khi khoản đó đủ lớn để đáng bận tâm (≥3% tổng chi phí) */
    let co = '', lyDo = '';
    if (coKyTruoc && tyTrong >= 3) {
      if (tienTruoc === 0 && tien > 0) { co = 'moi'; lyDo = 'Khoản mới phát sinh, kỳ trước chưa có'; }
      else if (tang != null && tang >= 40) { co = 'do'; lyDo = `Tăng ${fmtPct(tang)} so với kỳ trước`; }
      else if (lechDT != null && lechDT >= 1.5) { co = 'do'; lyDo = `Ngốn thêm ${fmtPct(lechDT)} doanh thu so với kỳ trước`; }
      else if (tang != null && tang >= 20) { co = 'cam'; lyDo = `Tăng ${fmtPct(tang)} so với kỳ trước`; }
      else if (tang != null && tang <= -20) { co = 'xanh'; lyDo = `Giảm ${fmtPct(Math.abs(tang))} so với kỳ trước`; }
    }
    return { ten, tien, tienTruoc, tang, tyTrong, pctDT, pctDTTruoc, lechDT, co, lyDo };
  }).filter(c => c.tien > 0 || c.tienTruoc > 0)
    .sort((a, b) => b.tien - a.tien);
}

/* =====================================================================
   KÊNH CHỦ LỰC & KÊNH ĐANG LỖ
===================================================================== */
function soatKenh(shops, tong) {
  const coDT = shops.filter(s => s.dtt > 0);
  let don = 0;
  const chuLuc = [];
  for (const s of coDT) {
    const share = tong.dtt > 0 ? s.dtt / tong.dtt * 100 : 0;
    if (don < 80) { chuLuc.push({ ...s, share, luyKe: don + share }); don += share; }
  }
  const lo = shops.filter(s => s.lnRong < 0).sort((a, b) => a.lnRong - b.lnRong)
    .map(s => ({ ...s,
      share: tong.dtt > 0 ? s.dtt / tong.dtt * 100 : 0,
      keoTut: tong.lnRong !== 0 ? Math.abs(s.lnRong) / Math.abs(tong.lnRong) * 100 : null,
      cuuDuoc: s.lnGop > 0 }));
  return { chuLuc, lo };
}

/* =====================================================================
   NHẬN ĐỊNH
===================================================================== */
function phanTich({ shops, tong, chiPhiChiTiet, kenh, xuHuong, thieuSot, kyNhan, kyTruocNhan, coKyTruoc, tongTruoc }) {
  const nx = [];
  const bienRong = tong.dtt > 0 ? tong.lnRong / tong.dtt * 100 : null;
  const bienGop = tong.dtt > 0 ? tong.lnGop / tong.dtt * 100 : null;

  if (bienRong != null) nx.push({
    muc: bienRong < 0 ? 'canh-bao' : (bienRong < 5 ? 'luu-y' : 'tot'),
    tieuDe: bienRong < 0 ? `${kyNhan}: toàn hệ đang lỗ` : `${kyNhan}: biên lợi nhuận ròng ${fmtPct(bienRong)}`,
    noiDung: `Doanh thu thuần ${fmtTy(tong.dtt)}, lãi gộp ${fmtTy(tong.lnGop)} (${fmtPct(bienGop)}), `
      + `còn ${fmtTy(tong.lnRong)} sau khi trừ ${fmtTy(tong.lnGop - tong.lnRong)} chi phí. `
      + (bienRong < 0 ? 'Chi phí đang ăn hết lãi gộp.' : bienRong < 5 ? 'Mức này mỏng, dễ về 0 nếu giá vốn nhích lên.' : 'Mức này lành mạnh.'),
  });

  /* Kênh chủ lực */
  if (kenh.chuLuc.length) {
    const t = kenh.chuLuc;
    nx.push({
      muc: 'chu-luc',
      tieuDe: `${t.length} kênh gánh ${fmtPct(t[t.length - 1].luyKe)} doanh thu`,
      noiDung: t.slice(0, 5).map(s => `${s.name} ${fmtPct(s.share)}`).join(' · ')
        + (t.length > 5 ? ` · và ${t.length - 5} kênh nữa` : '')
        + `. Đây là phần xương sống — biến động ở nhóm này ảnh hưởng thẳng tới cả hệ, `
        + `ưu tiên giữ nguồn hàng và ngân sách cho họ trước.`,
    });
  }

  /* Kênh lỗ */
  if (kenh.lo.length) {
    const tongLo = kenh.lo.reduce((a, s) => a + s.lnRong, 0);
    nx.push({
      muc: 'canh-bao',
      tieuDe: `${kenh.lo.length} kênh đang lỗ, kéo tụt ${fmtTy(Math.abs(tongLo))}`,
      noiDung: kenh.lo.slice(0, 5).map(s => `${s.name} ${fmtTy(s.lnRong)}`).join(' · ')
        + (kenh.lo.length > 5 ? ` · và ${kenh.lo.length - 5} kênh nữa` : '')
        + `. Đưa hết nhóm này về hoà vốn thì lợi nhuận toàn hệ lên ${fmtTy(tong.lnRong - tongLo)}`
        + (tong.lnRong > 0 ? ` (tăng ${fmtPct(Math.abs(tongLo) / tong.lnRong * 100)})` : '') + '.',
    });
    const cuu = kenh.lo.filter(s => s.cuuDuoc);
    if (cuu.length) nx.push({
      muc: 'luu-y',
      tieuDe: `${cuu.length} kênh lỗ do chi phí, không phải do bán lỗ`,
      noiDung: cuu.slice(0, 4).map(s => `${s.name} (lãi gộp ${fmtTy(s.lnGop)} nhưng chi phí ${fmtTy(s.tongChiPhi)})`).join(' · ')
        + '. Nhóm này bán vẫn có lãi — xem lại cách phân bổ chi phí trước khi tính chuyện đóng điểm.',
    });
  }

  /* Chi phí bất thường */
  const batThuong = chiPhiChiTiet.filter(c => c.co === 'do' || c.co === 'moi');
  if (batThuong.length) nx.push({
    muc: 'canh-bao',
    tieuDe: `${batThuong.length} khoản chi phí tăng bất thường so với ${kyTruocNhan}`,
    noiDung: batThuong.slice(0, 5).map(c => `${c.ten}: ${fmtTy(c.tienTruoc)} → ${fmtTy(c.tien)} (${c.lyDo.toLowerCase()})`).join(' · ')
      + '. Kiểm tra chứng từ của các khoản này trước khi chốt sổ.',
  });
  const giam = chiPhiChiTiet.filter(c => c.co === 'xanh');
  if (giam.length) nx.push({
    muc: 'tot',
    tieuDe: `${giam.length} khoản chi phí giảm được`,
    noiDung: giam.slice(0, 4).map(c => `${c.ten}: ${fmtTy(c.tienTruoc)} → ${fmtTy(c.tien)}`).join(' · ')
      + '. Xem cách làm ở đây có nhân rộng sang khoản khác được không.',
  });

  /* Chi phí tập trung */
  if (chiPhiChiTiet.length) {
    const top = chiPhiChiTiet.slice(0, 3);
    nx.push({
      muc: '',
      tieuDe: 'Chi phí tập trung ở đâu',
      noiDung: top.map(c => `${c.ten} ${fmtTy(c.tien)} (${fmtPct(c.tyTrong)})`).join(' · ')
        + `. Ba khoản này chiếm ${fmtPct(top.reduce((a, c) => a + c.tyTrong, 0))} tổng chi phí — `
        + 'cải thiện lợi nhuận thì bắt đầu từ đây, không phải từ các khoản lẻ.',
    });
  }

  /* Giá vốn lệch mặt bằng */
  const coGV = shops.filter(s => s.gvPct != null && s.dtt > 0);
  if (coGV.length >= 3) {
    const tb = coGV.reduce((a, s) => a + s.gvPct, 0) / coGV.length;
    const cao = coGV.filter(s => s.gvPct > tb + 8).sort((a, b) => b.gvPct - a.gvPct);
    if (cao.length) nx.push({
      muc: 'luu-y', tieuDe: 'Giá vốn cao hơn mặt bằng',
      noiDung: `Trung bình toàn hệ ${fmtPct(tb)}. Cao hơn rõ rệt: `
        + cao.slice(0, 4).map(s => `${s.name} ${fmtPct(s.gvPct)}`).join(' · ')
        + '. Kiểm tra cơ cấu hàng bán hoặc mức chiết khấu đang chạy.',
    });
  }

  /* So với kỳ trước */
  if (coKyTruoc && tongTruoc.dtt > 0 && tong.dtt > 0) {
    const bNay = tong.lnRong / tong.dtt * 100, bTruoc = tongTruoc.lnRong / tongTruoc.dtt * 100;
    const lech = bNay - bTruoc, tangDT = (tong.dtt / tongTruoc.dtt - 1) * 100;
    if (Math.abs(lech) >= 1 || Math.abs(tangDT) >= 10) nx.push({
      muc: lech >= 0 ? 'tot' : 'canh-bao',
      tieuDe: `So với ${kyTruocNhan}: biên ${lech >= 0 ? 'tăng' : 'giảm'} ${fmtPct(Math.abs(lech))}`,
      noiDung: `Doanh thu ${fmtTy(tongTruoc.dtt)} → ${fmtTy(tong.dtt)} (${tangDT >= 0 ? '+' : ''}${fmtPct(tangDT)}), `
        + `biên ròng ${fmtPct(bTruoc)} → ${fmtPct(bNay)}. `
        + (lech >= 0 ? 'Giữ nhịp hiện tại.' : 'Doanh thu và chi phí đang không đi cùng tốc độ — truy khoản chi phí nào tăng nhanh hơn.'),
    });
  }

  if (thieuSot.length) nx.push({
    muc: 'chua-chot',
    tieuDe: `${thieuSot.length} điểm dữ liệu chưa chốt`,
    noiDung: thieuSot.slice(0, 8).join(' · ')
      + (thieuSot.length > 8 ? ` · và ${thieuSot.length - 8} mục nữa` : '')
      + '. Các con số phía trên chưa tính phần này, nên đọc như số tạm.',
  });

  return nx;
}

/* ---------- Handler ---------- */
module.exports = async (req, res) => {
  try {
    const toi = await A.canhCong(req, res, 'xem_tai_chinh');
    if (!toi) return;
    for (const k of ['LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_APP_TOKEN', 'LARK_TABLE_FINANCE']) {
      if (!process.env[k]) throw new Error(`Thiếu biến môi trường ${k} trên Vercel.`);
    }

    const token = await larkToken();
    const rows = await readTable(token, process.env.LARK_TABLE_FINANCE, 'Báo Cáo Chi Tiết - 2026');
    if (!rows.length) throw new Error('Bảng Báo Cáo Chi Tiết - 2026 chưa có dòng nào.');

    const tenCot = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const cotChiPhi = tenCot.filter(laCotChiPhi);

    const recs = rows.map(r => {
      const chiPhi = {};
      for (const c of cotChiPhi) { const v = num(r[c]); if (v != null && v !== 0) chiPhi[c] = v; }
      return {
        month: monthKey(pick(r, 'Tháng', 'Thang', 'Month'), pick(r, 'Năm', 'Nam')),
        quy: txt(pick(r, 'Quý', 'Quy')),
        name: txt(pick(r, 'Shop', 'Kênh Kinh Doanh', 'Kênh')),
        grp: grpOf(pick(r, 'Nguồn Doanh Thu', 'Nền Tảng', 'Nhóm')),
        nguon: txt(pick(r, 'Nguồn Doanh Thu', 'Nền Tảng')),
        dtt: num(pick(r, 'Doanh Thu Thuần', 'Doanh Thu Thuan', 'Doanh Thu')),
        gv: num(pick(r, 'Giá Vốn Hàng Bán', 'Gia Von Hang Ban', 'Giá Vốn')),
        lnGop: num(pick(r, 'Lợi Nhuận Gộp', 'Loi Nhuan Gop')),
        lnRong: num(pick(r, 'LỢI NHUẬN RÒNG', 'Lợi Nhuận Ròng', 'Loi Nhuan Rong')),
        chiPhi,
      };
    }).filter(x => x.month && x.name);

    const months = [...new Set(recs.filter(r => (r.dtt || 0) > 0).map(r => r.month))].sort();
    if (!months.length) throw new Error('Chưa tháng nào có doanh thu trong bảng Báo Cáo Chi Tiết.');

    const q = req.query || {};
    const ky = ['thang', 'quy', '3thang', 'nam', 'tuychon'].includes(txt(q.ky)) ? txt(q.ky) : 'thang';
    const moc = monthKey(txt(q.month)) || months[months.length - 1];
    const K = tinhKy(ky, moc, q);

    const trongKy = daiThang(K.tu, K.den).filter(m => months.includes(m));
    if (!trongKy.length) throw new Error(`Khoảng ${K.phu || K.nhan} chưa có tháng nào có số. Các tháng đang có: ${months.map(nhanThang).join(', ')}`);

    /* Kỳ trước: cùng số tháng, ngay liền trước */
    const soThang = trongKy.length;
    const truocDen = shiftMonth(trongKy[0], -1);
    const truocTu = shiftMonth(truocDen, -(soThang - 1));
    const trongKyTruoc = daiThang(truocTu, truocDen).filter(m => months.includes(m));
    const coKyTruoc = trongKyTruoc.length > 0;

    const shops = gomTheoShop(recs.filter(r => trongKy.includes(r.month)));
    const tong = congTong(shops);
    const shopsTruoc = coKyTruoc ? gomTheoShop(recs.filter(r => trongKyTruoc.includes(r.month))) : [];
    const tongTruoc = congTong(shopsTruoc);

    const chiPhiChiTiet = soatChiPhi(gomChiPhi(shops), gomChiPhi(shopsTruoc), tong.dtt, tongTruoc.dtt, coKyTruoc);
    const kenh = soatKenh(shops, tong);

    const xuHuong = months.map(m => {
      const rs = recs.filter(r => r.month === m);
      const s = f => rs.reduce((a, r) => a + (f(r) ?? 0), 0);
      return { thang: nhanThang(m), key: m, trongKy: trongKy.includes(m),
               dtt: s(r => r.dtt), gv: s(r => r.gv), lnGop: s(r => r.lnGop), lnRong: s(r => r.lnRong),
               chiPhi: rs.reduce((a, r) => a + Object.values(r.chiPhi).reduce((x, y) => x + y, 0), 0) };
    });

    /* Điểm chưa chốt */
    const thieuSot = [];
    for (const s of shops) {
      if (!s.dtt) thieuSot.push(`${s.name}: có chi phí nhưng chưa có doanh thu thuần`);
      else if (!s.gv) thieuSot.push(`${s.name}: chưa có giá vốn`);
      else if (!s.tongChiPhi) thieuSot.push(`${s.name}: chưa phân bổ chi phí`);
    }
    if (coKyTruoc) for (const t of shopsTruoc)
      if (t.dtt > 0 && !shops.some(s => norm(s.name) === norm(t.name)))
        thieuSot.push(`${t.name}: có ở kỳ trước nhưng thiếu ở kỳ này`);
    const lech = (tong.lnGop - tong.lnRong) - tong.tongChiPhi;
    if (tong.dtt > 0 && Math.abs(lech) > tong.dtt * 0.005)
      thieuSot.push(`Tổng cột chi phí lệch ${fmtTy(Math.abs(lech))} so với hiệu lãi gộp trừ lãi ròng — có thể một cột đang cộng trùng`);

    const kyNhan = K.nhan;
    const kyTruocNhan = coKyTruoc
      ? (soThang === 1 ? nhanThang(trongKyTruoc[0]) : `${soThang} tháng trước đó`)
      : 'kỳ trước';
    const nhanXet = phanTich({ shops, tong, chiPhiChiTiet, kenh, xuHuong, thieuSot, kyNhan, kyTruocNhan, coKyTruoc, tongTruoc });

    const vn = new Date(Date.now() + 7 * 3600 * 1000);
    const p2 = n => String(n).padStart(2, '0');
    const stamp = `${p2(vn.getUTCDate())}/${p2(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()} ${p2(vn.getUTCHours())}:${p2(vn.getUTCMinutes())}`;

    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({
      ok: true, ky, moc, months,
      kyInfo: { nhan: kyNhan, phu: K.phu, tu: trongKy[0], den: trongKy[trongKy.length - 1],
                soThang, thangTrongKy: trongKy, coKyTruoc, kyTruocNhan },
      toi: { email: toi.email, ten: toi.ten, quyen: toi.quyen },
      syncedAt: new Date().toISOString(),
      data: { shops, tong, tongTruoc, coKyTruoc, chiPhiChiTiet, kenh, xuHuong, nhanXet, thieuSot, cotChiPhi,
              sub: `Số liệu tự động đồng bộ từ Lark — bảng Báo Cáo Chi Tiết ${YEAR} · Cập nhật ${stamp} (giờ VN) · Đơn vị: đồng (VNĐ)` },
    });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: false, error: String(err.message || err) });
  }
};
