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
const COT_LOI = ['thang', 'nam', 'quy', 'shop', 'nguondoanhthu', 'nentang', 'kenhkinhdoanh',
  'doanhthu', 'giavon', 'loinhuan',   // 'loinhuan' bắt cả Gộp, Ròng và cột "LỢI NHUẬN" (8,83%)
  'bienloinhuan', 'ghichu', 'stt', 'thutu', 'nhan', 'traffic', 'tienrutvecty'];
const laCotChiPhi = ten => {
  const n = norm(ten);
  if (ten.includes('%')) return false;
  if (n.startsWith('pct') || n.includes('phantram') || n.includes('bien')) return false;
  return !COT_LOI.some(x => n === x || n.startsWith(x));
};

const fmtTy = n => (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
const fmtPct = n => (n == null ? '—' : n.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%');

/* =====================================================================
   PHÂN TÍCH TỰ ĐỘNG — đọc số rồi rút ra nhận định, không phải văn mẫu
===================================================================== */
function phanTich({ shops, tong, chiPhiTong, xuHuong, M, thieuSot }) {
  const nx = [];
  const bienRong = tong.dtt > 0 ? tong.lnRong / tong.dtt * 100 : null;
  const bienGop = tong.dtt > 0 ? tong.lnGop / tong.dtt * 100 : null;

  /* 1. Bức tranh chung */
  if (bienRong != null) {
    nx.push({
      muc: bienRong < 0 ? 'canh-bao' : (bienRong < 5 ? 'luu-y' : 'tot'),
      tieuDe: bienRong < 0 ? 'Toàn hệ đang lỗ' : `Biên lợi nhuận ròng ${fmtPct(bienRong)}`,
      noiDung: `Doanh thu thuần ${fmtTy(tong.dtt)}, lãi gộp ${fmtTy(tong.lnGop)} (${fmtPct(bienGop)}), `
        + `còn lại ${fmtTy(tong.lnRong)} sau chi phí. `
        + (bienRong < 0
            ? 'Chi phí đang ăn hết phần lãi gộp — đây là việc cần xử lý trước mọi việc khác.'
            : bienRong < 5
              ? 'Mức này mỏng: chỉ cần một tháng giá vốn nhích lên là về 0.'
              : 'Mức này lành mạnh, giữ nhịp.'),
    });
  }

  /* 2. Shop lỗ */
  const lo = shops.filter(s => s.lnRong != null && s.lnRong < 0).sort((a, b) => a.lnRong - b.lnRong);
  if (lo.length) {
    const tongLo = lo.reduce((a, s) => a + s.lnRong, 0);
    nx.push({
      muc: 'canh-bao',
      tieuDe: `${lo.length} điểm đang lỗ, tổng ${fmtTy(Math.abs(tongLo))}`,
      noiDung: lo.slice(0, 5).map(s => `${s.name} ${fmtTy(s.lnRong)}`).join(' · ')
        + (lo.length > 5 ? ` · và ${lo.length - 5} điểm nữa` : '')
        + `. Nếu cắt hết phần lỗ này, lợi nhuận toàn hệ lên ${fmtTy(tong.lnRong - tongLo)}.`,
    });
  }

  /* 3. Lỗ vì chi phí chứ không phải vì bán lỗ — nhóm cứu được */
  const cuuDuoc = lo.filter(s => s.lnGop != null && s.lnGop > 0);
  if (cuuDuoc.length) {
    nx.push({
      muc: 'luu-y',
      tieuDe: `${cuuDuoc.length} điểm lỗ do chi phí, không phải do bán lỗ`,
      noiDung: cuuDuoc.slice(0, 4).map(s => `${s.name} (lãi gộp ${fmtTy(s.lnGop)} nhưng chi phí ${fmtTy(s.tongChiPhi)})`).join(' · ')
        + '. Nhóm này bán vẫn có lãi, vấn đề nằm ở chi phí phân bổ — xem lại trước khi tính chuyện đóng điểm.',
    });
  }

  /* 4. Giá vốn bất thường */
  const coGV = shops.filter(s => s.gvPct != null && s.dtt > 0);
  if (coGV.length >= 3) {
    const tb = coGV.reduce((a, s) => a + s.gvPct, 0) / coGV.length;
    const cao = coGV.filter(s => s.gvPct > tb + 8).sort((a, b) => b.gvPct - a.gvPct);
    if (cao.length) nx.push({
      muc: 'luu-y',
      tieuDe: 'Giá vốn cao hơn mặt bằng',
      noiDung: `Trung bình toàn hệ ${fmtPct(tb)}. Cao hơn rõ rệt: `
        + cao.slice(0, 4).map(s => `${s.name} ${fmtPct(s.gvPct)}`).join(' · ')
        + '. Kiểm tra cơ cấu hàng bán hoặc mức chiết khấu đang chạy ở các điểm này.',
    });
  }

  /* 5. Chi phí lớn nhất */
  if (chiPhiTong.length) {
    const top = chiPhiTong.slice(0, 3);
    const tongCP = chiPhiTong.reduce((a, c) => a + c.tien, 0);
    nx.push({
      muc: '',
      tieuDe: 'Chi phí tập trung ở đâu',
      noiDung: top.map(c => `${c.ten} ${fmtTy(c.tien)} (${fmtPct(c.tien / tongCP * 100)})`).join(' · ')
        + `. Ba khoản này chiếm ${fmtPct(top.reduce((a, c) => a + c.tien, 0) / tongCP * 100)} tổng chi phí — `
        + 'muốn cải thiện lợi nhuận thì bắt đầu từ đây, không phải từ các khoản lẻ.',
    });
  }

  /* 6. So với tháng trước */
  if (xuHuong.length >= 2) {
    const nay = xuHuong[xuHuong.length - 1], truoc = xuHuong[xuHuong.length - 2];
    if (truoc.dtt > 0 && nay.dtt > 0) {
      const bNay = nay.lnRong / nay.dtt * 100, bTruoc = truoc.lnRong / truoc.dtt * 100;
      const lech = bNay - bTruoc;
      if (Math.abs(lech) >= 1) nx.push({
        muc: lech > 0 ? 'tot' : 'canh-bao',
        tieuDe: `Biên lợi nhuận ${lech > 0 ? 'cải thiện' : 'giảm'} ${fmtPct(Math.abs(lech))} so với tháng trước`,
        noiDung: `Tháng ${truoc.thang}: ${fmtPct(bTruoc)} → tháng ${nay.thang}: ${fmtPct(bNay)}. `
          + `Doanh thu ${fmtTy(truoc.dtt)} → ${fmtTy(nay.dtt)}. `
          + (lech > 0 ? 'Giữ cách làm đang có hiệu quả.' : 'Truy nguyên nhân: giá vốn tăng hay chi phí phát sinh?'),
      });
    }
  }

  /* 7. Điểm chưa chốt */
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

    /* Tự dò cột chi phí từ toàn bộ tên cột xuất hiện trong dữ liệu */
    const tenCot = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const cotChiPhi = tenCot.filter(laCotChiPhi);

    const recs = rows.map(r => {
      const chiPhi = {};
      for (const c of cotChiPhi) {
        const v = num(r[c]);
        if (v != null && v !== 0) chiPhi[c] = v;
      }
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

    const months = [...new Set(recs.map(r => r.month))].sort();
    const askedRaw = txt(req.query && req.query.month);
    const M = (askedRaw ? monthKey(askedRaw) : '') || months[months.length - 1];
    const cur = recs.filter(r => r.month === M);
    if (!cur.length) throw new Error(`Không có dòng nào cho tháng ${M}. Các tháng đang có: ${months.join(', ')}`);

    /* Từng shop */
    const shops = cur.map(r => {
      const tongChiPhi = Object.values(r.chiPhi).reduce((a, b) => a + b, 0);
      return {
        name: r.name, grp: r.grp, nguon: r.nguon,
        dtt: r.dtt, gv: r.gv, lnGop: r.lnGop, lnRong: r.lnRong, chiPhi: r.chiPhi, tongChiPhi,
        gvPct: (r.dtt > 0 && r.gv != null) ? r.gv / r.dtt * 100 : null,
        gopPct: (r.dtt > 0 && r.lnGop != null) ? r.lnGop / r.dtt * 100 : null,
        rongPct: (r.dtt > 0 && r.lnRong != null) ? r.lnRong / r.dtt * 100 : null,
      };
    }).sort((a, b) => (b.dtt ?? 0) - (a.dtt ?? 0));

    const cong = f => shops.reduce((a, s) => a + (f(s) ?? 0), 0);
    const tong = { dtt: cong(s => s.dtt), gv: cong(s => s.gv), lnGop: cong(s => s.lnGop),
                   lnRong: cong(s => s.lnRong), tongChiPhi: cong(s => s.tongChiPhi) };

    /* Cơ cấu chi phí toàn hệ */
    const gop = {};
    for (const s of shops) for (const [k, v] of Object.entries(s.chiPhi)) gop[k] = (gop[k] || 0) + v;
    const chiPhiTong = Object.entries(gop).map(([ten, tien]) => ({ ten, tien }))
      .filter(c => c.tien > 0).sort((a, b) => b.tien - a.tien);

    /* Xu hướng 12 tháng */
    const xuHuong = months.map(m => {
      const rs = recs.filter(r => r.month === m);
      const s = f => rs.reduce((a, r) => a + (f(r) ?? 0), 0);
      return { thang: 'T' + Number(m.split('-')[1]), key: m,
               dtt: s(r => r.dtt), gv: s(r => r.gv), lnGop: s(r => r.lnGop), lnRong: s(r => r.lnRong) };
    }).filter(x => x.dtt > 0);

    /* Điểm chưa chốt */
    const thieuSot = [];
    for (const s of shops) {
      if (!s.dtt) thieuSot.push(`${s.name}: chưa có doanh thu thuần`);
      else if (s.gv == null || s.gv === 0) thieuSot.push(`${s.name}: chưa có giá vốn`);
      else if (!s.tongChiPhi) thieuSot.push(`${s.name}: chưa phân bổ chi phí`);
    }
    const truoc = recs.filter(r => r.month === shiftMonth(M, -1)).map(r => r.name);
    for (const n of truoc) if (!shops.some(s => norm(s.name) === norm(n)))
      thieuSot.push(`${n}: có ở tháng trước nhưng thiếu ở tháng này`);

    const lech = (tong.lnGop - tong.lnRong) - tong.tongChiPhi;
    if (Math.abs(lech) > tong.dtt * 0.005)
      thieuSot.push(`Tổng cột chi phí lệch ${fmtTy(Math.abs(lech))} so với hiệu lãi gộp trừ lãi ròng — có thể một cột đang cộng trùng`);

    const nhanXet = phanTich({ shops, tong, chiPhiTong, xuHuong, M, thieuSot });

    const vn = new Date(Date.now() + 7 * 3600 * 1000);
    const p2 = n => String(n).padStart(2, '0');
    const stamp = `${p2(vn.getUTCDate())}/${p2(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()} ${p2(vn.getUTCHours())}:${p2(vn.getUTCMinutes())}`;

    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({
      ok: true, month: M, months, quy: cur[0] ? cur[0].quy : '',
      toi: { email: toi.email, ten: toi.ten, quyen: toi.quyen },
      syncedAt: new Date().toISOString(),
      data: { shops, tong, chiPhiTong, xuHuong, nhanXet, thieuSot, cotChiPhi,
              sub: `Số liệu tự động đồng bộ từ Lark — bảng Báo Cáo Chi Tiết ${YEAR} · Cập nhật ${stamp} (giờ VN) · Đơn vị: đồng (VNĐ)` },
    });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: false, error: String(err.message || err) });
  }
};
