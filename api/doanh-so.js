/* =====================================================================
   /api/doanh-so — Vercel Serverless Function
   TRANG: Doanh số & Target   (Sakawin Reports)

   Nguồn số DUY NHẤT của trang này là Base "TỔNG QUAN DOANH SỐ 2026 - SAKAWIN":

   1) "Báo Cáo Doanh Thu - Kênh Bán Hàng"  (bảng có sẵn)
      → Doanh thu bán hàng · Số đơn · Ngân sách ADS · Nền tảng
      → và cả Target + kế hoạch tháng sau, nếu thêm mấy cột dưới đây vào
        chính bảng này (cách gọn nhất — không phải nhập lại tên kênh/tháng):
            LÊN BÁO CÁO (ô tick) · TARGET · % Tăng trưởng
            SỐ ĐƠN (target) · % Trần ADS · Nhãn · Ghi chú
        (tên cột không phân biệt hoa thường và dấu tiếng Việt)
   2) "Nhận xét"  (tuỳ chọn) → nhận xét & định hướng cuối trang

   Muốn để Target ở bảng riêng thì khai LARK_TABLE_TARGET trỏ sang bảng đó;
   không khai thì mặc định đọc ngay trong bảng doanh thu.

   KHÔNG đọc bảng "Báo Cáo Chi Tiết - 2026". Bảng đó là doanh thu thuần,
   lãi lỗ và chi phí — thuộc về trang Tài chính sẽ làm sau, trộn vào đây
   là sai bản chất chỉ số.

   BIẾN MÔI TRƯỜNG trên Vercel (Settings → Environment Variables):
     LARK_APP_ID          cli_xxxxxxxx
     LARK_APP_SECRET      secret của Lark App
     LARK_APP_TOKEN       mã Base, lấy trong URL: .../base/<APP_TOKEN>?table=...
     LARK_TABLE_REVENUE   table_id bảng "Báo Cáo Doanh Thu - Kênh Bán Hàng"
     LARK_TABLE_TARGET    (tuỳ chọn) chỉ khai nếu để Target ở một bảng riêng
     LARK_TABLE_NOTES     (tuỳ chọn) table_id bảng "Nhận xét"
     LARK_HOST            (tuỳ chọn) mặc định https://open.larksuite.com
     REPORT_YEAR          (tuỳ chọn) mặc định 2026 — cột Tháng ở Base chỉ ghi 1..12
     REPORT_AUTHOR        (tuỳ chọn) tên người lập ở chân trang

   Gọi thử:  /api/doanh-so              → tháng chốt mới nhất có target
             /api/doanh-so?month=7      → chốt T7, lên kế hoạch T8
===================================================================== */

const HOST = (process.env.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');
const YEAR = Number(process.env.REPORT_YEAR) || 2026;

/* ---------- Đọc giá trị thô từ Lark Base ---------- */
const txt = v => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object') ? (x.text ?? x.name ?? '') : String(x)).join('').trim();
  if (typeof v === 'object') {
    // Cột công thức trả về {type, value}; cột lựa chọn trả về {text}/{name}
    if (Array.isArray(v.value)) return txt(v.value);
    return String(v.text ?? v.name ?? v.value ?? '').trim();
  }
  return String(v).trim();
};

const num = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && !Array.isArray(v) && typeof v.value === 'number') return v.value;
  const s = txt(v).replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;
  const sep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (sep === -1) return Number(s);
  // đúng 3 chữ số sau dấu cuối => dấu phân nhóm nghìn (1.234.567)
  const decimals = s.length - sep - 1;
  if (decimals === 3) return Number(s.replace(/[.,]/g, ''));
  return Number(s.slice(0, sep).replace(/[.,]/g, '') + '.' + s.slice(sep + 1));
};

/* So khớp tên shop giữa 2 bảng: bỏ dấu, bỏ khoảng trắng, không phân biệt hoa thường */
const norm = s => txt(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');

/* Cột Tháng ở Base chỉ ghi số 1..12 → ghép với REPORT_YEAR (hoặc cột Năm nếu có) */
const monthKey = (thang, nam) => {
  const raw = txt(thang);
  const direct = raw.match(/^(\d{4})[-/](\d{1,2})$/);          // đã ghi sẵn 2026-07
  if (direct) return `${direct[1]}-${String(+direct[2]).padStart(2, '0')}`;
  const m = num(thang);
  if (!m || m < 1 || m > 12) return '';
  const y = num(nam) || YEAR;
  return `${y}-${String(m).padStart(2, '0')}`;
};
const shiftMonth = (key, d) => {
  const [y, m] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
};
const label = k => 'T' + Number(k.split('-')[1]);
const title = k => `${Number(k.split('-')[1])}/${k.split('-')[0]}`;

/* Nền Tảng trên Lark → 4 khối của báo cáo */
const grpOf = v => {
  const k = norm(v);
  if (k.includes('shopee')) return 'shopee';
  if (k.includes('tiktok')) return 'tiktok';
  if (k.includes('aeon') || k.startsWith('go') || k.includes('showroom')) return 'off';
  return 'khac';   // Facebook, Đơn Ngoài, Sỉ...
};

const toneOf = v => {
  const k = norm(v);
  if (k.startsWith('tot') || k === 'good' || k.includes('tichcuc')) return 'good';
  if (k.includes('canhbao') || k === 'warn' || k.includes('ruiro')) return 'warn';
  return '';
};

/* ---------- Lark API ---------- */
async function larkToken() {
  const r = await fetch(`${HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Lấy token Lark thất bại (code ${j.code}): ${j.msg}`);
  return j.tenant_access_token;
}

async function readTable(token, tableId, tenGoi) {
  const out = [];
  let pageToken = '';
  for (let guard = 0; guard < 20; guard++) {
    const url = new URL(`${HOST}/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${tableId}/records`);
    url.searchParams.set('page_size', '500');
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    if (j.code !== 0) throw new Error(`Đọc bảng ${tenGoi} thất bại (code ${j.code}): ${j.msg}`);
    for (const it of (j.data.items || [])) out.push(it.fields || {});
    if (!j.data.has_more) break;
    pageToken = j.data.page_token;
  }
  return out;
}

/* Lấy field theo nhiều tên gọi — chịu được việc cột bị đổi tên nhẹ hoặc thêm/bớt dấu */
const pick = (row, ...names) => {
  for (const n of names) if (row[n] !== undefined) return row[n];
  const keys = Object.keys(row);
  for (const n of names) {
    const hit = keys.find(k => norm(k) === norm(n));
    if (hit) return row[hit];
  }
  return undefined;
};

/* =====================================================================
   KỲ BÁO CÁO — gộp nhiều tháng
   "Kỳ chốt" là khoảng đang xem; "kỳ trước" là cùng số tháng ngay liền trước;
   "kỳ kế hoạch" là khoảng cùng độ dài ngay sau.
===================================================================== */
const thangCua = k => Number(k.split('-')[1]);
const namCua = k => Number(k.split('-')[0]);
const nhanThang = k => 'T' + thangCua(k);
function daiThang(tu, den) { const o = []; let c = tu; for (let i = 0; i < 240 && c <= den; i++) { o.push(c); c = shiftMonth(c, 1); } return o; }

function tinhKy(ky, moc, q) {
  const n = namCua(moc), m = thangCua(moc);
  switch (ky) {
    case 'quy': {
      const q0 = Math.floor((m - 1) / 3) * 3 + 1, sq = Math.floor((m - 1) / 3) + 1;
      return { tu: `${n}-${String(q0).padStart(2,'0')}`, den: `${n}-${String(q0+2).padStart(2,'0')}`,
               nhan: `Quý ${sq}/${n}`, ngan: `Q${sq}`, phu: `T${q0}–T${q0+2}` };
    }
    case '3thang': { const tu = shiftMonth(moc, -2);
      return { tu, den: moc, nhan: '3 tháng gần nhất', ngan: `T${thangCua(tu)}–T${m}`, phu: `${nhanThang(tu)} – ${nhanThang(moc)}` }; }
    case 'nam': return { tu: `${n}-01`, den: `${n}-12`, nhan: `Cả năm ${n}`, ngan: `${n}`, phu: 'Cộng dồn các tháng đã có số' };
    case 'tuychon': {
      const a = monthKey(txt(q.tu)) || moc, b = monthKey(txt(q.den)) || moc;
      const tu = a <= b ? a : b, den = a <= b ? b : a;
      return { tu, den, nhan: 'Khoảng tự chọn', ngan: `T${thangCua(tu)}–T${thangCua(den)}`, phu: `${nhanThang(tu)} – ${nhanThang(den)}` };
    }
    default: return { tu: moc, den: moc, nhan: `Tháng ${m}/${n}`, ngan: `T${m}`, phu: '' };
  }
}

/* ---------- Handler ---------- */
const A = require('./_auth.js');

module.exports = async (req, res) => {
  try {
    /* Chặn ngay từ server: chưa đăng nhập hoặc chưa có quyền thì không trả số nào.
       Ẩn cột ở giao diện là chuyện của con mắt, chặn ở đây mới là phân quyền. */
    const toi = await A.canhCong(req, res, 'xem_doanh_so');
    if (!toi) return;
    for (const k of ['LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_APP_TOKEN', 'LARK_TABLE_REVENUE']) {
      if (!process.env[k]) throw new Error(`Thiếu biến môi trường ${k} trên Vercel.`);
    }

    /* Target nằm ở đâu?
       - Mặc định: ngay trong bảng doanh thu, chỉ cần thêm cột (KHÔNG nhập lại tên kênh/tháng).
       - Nếu khai LARK_TABLE_TARGET khác bảng doanh thu thì đọc từ bảng riêng đó. */
    const targetTable = process.env.LARK_TABLE_TARGET;
    const roiRieng = !!targetTable && targetTable !== process.env.LARK_TABLE_REVENUE;

    const token = await larkToken();
    const [revRaw, tgtSeparate] = await Promise.all([
      readTable(token, process.env.LARK_TABLE_REVENUE, 'Báo Cáo Doanh Thu - Kênh Bán Hàng'),
      roiRieng ? readTable(token, targetTable, 'Target & Kế hoạch') : Promise.resolve([]),
    ]);
    const tgtRaw = roiRieng ? tgtSeparate : revRaw;

    /* --- Bảng doanh thu: khoá theo (tháng, tên kênh đã chuẩn hoá) --- */
    const rev = new Map();
    for (const r of revRaw) {
      const mk = monthKey(pick(r, 'Tháng', 'Thang', 'Month'), pick(r, 'Năm', 'Nam', 'Year'));
      const kenh = txt(pick(r, 'Kênh Kinh Doanh', 'Kenh Kinh Doanh', 'Kênh', 'Shop'));
      if (!mk || !kenh) continue;
      rev.set(mk + '|' + norm(kenh), {
        dt: num(pick(r, 'Doanh Thu Kinh Doanh (số thực)', 'Doanh Thu Kinh Doanh', 'Doanh Thu', 'Doanh thu')),
        don: num(pick(r, 'Số Lượng Đơn Hàng', 'So Luong Don Hang', 'Số đơn', 'Số Đơn')),
        ads: num(pick(r, 'Ngân Sách ADS', 'Ngan Sach ADS', 'Chi phí Ads', 'Ads')),
        grp: grpOf(pick(r, 'Nền Tảng', 'Nen Tang', 'Nhóm', 'Platform')),
      });
    }
    if (!rev.size) throw new Error('Bảng doanh thu không có dòng nào hợp lệ (cần cột Tháng + Kênh Kinh Doanh).');

    /* --- Bảng target: quyết định shop nào lên báo cáo, tên hiển thị, thứ tự --- */
    const tgts = tgtRaw.map(r => ({
      month: monthKey(pick(r, 'Tháng', 'Thang', 'Month'), pick(r, 'Năm', 'Nam', 'Year')),
      kenh: txt(pick(r, 'Kênh Kinh Doanh', 'Kenh Kinh Doanh', 'Kênh', 'Shop')),
      hienThi: txt(pick(r, 'Tên hiển thị', 'Ten hien thi', 'Tên trên báo cáo')),
      tgt: num(pick(r, 'Target', 'Chỉ tiêu', 'Mục tiêu')),
      tt: num(pick(r, '% Tăng trưởng', '% tăng trưởng KH', 'Tăng trưởng KH', '%TT KH')),
      donNext: num(pick(r, 'SỐ ĐƠN (target)', 'Số đơn target', 'Số đơn KH', 'Đơn KH')),
      adsPctNext: num(pick(r, '% Trần ADS', 'Trần Ads % KH', 'Trần Ads', 'Ads % KH')),
      badge: txt(pick(r, 'Nhãn', 'Nhan', 'Badge')),
      note: txt(pick(r, 'Ghi chú', 'Ghi chu', 'Note')),
      order: num(pick(r, 'Thứ tự', 'STT', 'Order')),
      grp: txt(pick(r, 'Nhóm', 'Nhom', 'Nền Tảng')),
      show: pick(r, 'Lên báo cáo', 'Len bao cao', 'Hiện trên báo cáo'),
      dt: num(pick(r, 'Doanh Thu Kinh Doanh (số thực)', 'Doanh Thu Kinh Doanh', 'Doanh Thu', 'Doanh thu')),
    })).filter(t => t.month && t.kenh);

    if (!tgts.length) throw new Error(roiRieng
      ? 'Bảng "Target & Kế hoạch" chưa có dòng nào hợp lệ (cần cột Tháng + Kênh Kinh Doanh).'
      : 'Bảng doanh thu chưa có dòng nào hợp lệ (cần cột Tháng + Kênh Kinh Doanh).');

    /* Kênh nào được lên báo cáo?
       - Có cột "Lên báo cáo" (ô tick) → chỉ lấy dòng được tick.
       - Không có cột đó → lấy kênh có Target, hoặc có doanh thu. */
    const coCotTick = tgts.some(t => t.show === true);
    const duocLen = t => coCotTick ? t.show === true : (t.tgt != null || t.dt != null);

    const months = [...new Set(tgts.filter(duocLen).map(t => t.month))].sort();
    if (!months.length) throw new Error('Chưa tháng nào có kênh lên báo cáo.');

    /* Bảng Lark thường đã tạo sẵn dòng cho cả 12 tháng và tick luôn, nên "tháng
       mới nhất được tick" có thể là T12 chưa có số nào. Mặc định phải mở tháng
       mới nhất THỰC SỰ CÓ DOANH THU. */
    const thangCoSo = [...new Set(
      tgts.filter(t => {
        if (!duocLen(t)) return false;
        const r = rev.get(t.month + '|' + norm(t.kenh));
        return r && r.dt > 0;
      }).map(t => t.month)
    )].sort();

    const q = req.query || {};
    const ky = ['thang', 'quy', '3thang', 'nam', 'tuychon'].includes(txt(q.ky)) ? txt(q.ky) : 'thang';
    const moc = monthKey(txt(q.month))
      || thangCoSo[thangCoSo.length - 1]
      || months[months.length - 1];
    const K = tinhKy(ky, moc, q);
    const trongKy = daiThang(K.tu, K.den).filter(m => months.includes(m));
    if (!trongKy.length) throw new Error(`Khoảng ${K.phu || K.nhan} chưa có tháng nào có số. Các tháng đang có: ${months.map(nhanThang).join(', ')}`);

    const soThang = trongKy.length;
    const M = trongKy[trongKy.length - 1];                    // tháng cuối của kỳ chốt
    const truocDen = shiftMonth(trongKy[0], -1);
    const trongKyTruoc = daiThang(shiftMonth(truocDen, -(soThang - 1)), truocDen);

    /* Gộp các tháng trong kỳ lại theo từng kênh.
       Target tháng sau (t8) phải cộng theo TỪNG THÁNG rồi mới tổng, vì mỗi
       tháng có %tăng trưởng riêng — lấy tổng doanh thu nhân một %TT chung là sai. */
    const gopKenh = danhSachThang => {
      const m = new Map();
      for (const th of danhSachThang) {
        for (const t of tgts.filter(x => x.month === th && duocLen(x))) {
          const k = norm(t.kenh);
          const r = rev.get(th + '|' + k);
          if (!m.has(k)) m.set(k, { kenh: t.kenh, hienThi: t.hienThi, grp: t.grp, badge: '', note: '',
            order: t.order, dt: 0, tgt: 0, ads: 0, don: 0, t8: 0, ads8: 0, don8: 0, coDt: false,
            soThangDt: 0, soThangTgt: 0 });
          const o = m.get(k);
          if (t.badge && !o.badge) o.badge = t.badge;
          if (t.note && !o.note) o.note = t.note;
          if (o.order == null) o.order = t.order;
          const dt = r && r.dt != null ? r.dt : null;
          if (dt != null) { o.dt += dt; o.coDt = true; o.soThangDt++; }
          if (t.tgt != null) { o.tgt += t.tgt; o.soThangTgt++; }
          if (r && r.ads != null) o.ads += r.ads;
          if (r && r.don != null) o.don += r.don;
          if (dt != null) {
            const t8 = Math.round(dt * (1 + (t.tt ?? 0) / 100));
            o.t8 += t8;
            o.ads8 += Math.round(t8 * (t.adsPctNext ?? 0) / 100);
          }
          if (t.donNext != null) o.don8 += t.donNext;
          if (!o.grp && t.grp) o.grp = t.grp;
        }
      }
      return m;
    };

    const gopNay = gopKenh(trongKy);
    const gopTruoc = gopKenh(trongKyTruoc);
    const cur = [...gopNay.values()]
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999) || (b.dt ?? 0) - (a.dt ?? 0));
    if (!cur.length) throw new Error(coCotTick
      ? `Khoảng ${K.nhan} chưa có kênh nào được tick "Lên báo cáo".`
      : `Khoảng ${K.nhan} chưa có kênh nào có Target hoặc doanh thu.`);

    const warnings = [];

    /* Xem gộp nhiều tháng mà chỉ vài tháng có Target thì % hoàn thành bị thổi lên:
       doanh thu cộng đủ kỳ trong khi target chỉ cộng được vài tháng. Phải cảnh báo,
       không thì đọc nhầm thành vượt chỉ tiêu. */
    /* Kênh CÓ doanh thu nhưng KHÔNG được tick "Lên báo cáo" thì bị loại khỏi bảng.
       Đây là chỗ dễ mất số nhất mà không ai biết: thêm dòng mới trong Lark, quên
       tick, rồi tưởng báo cáo hỏng. Phải gọi tên ra. */
    if (coCotTick) {
      const boSot = new Map();
      for (const th of trongKy) {
        for (const t of tgts.filter(x => x.month === th && !duocLen(x))) {
          const r = rev.get(th + '|' + norm(t.kenh));
          if (r && r.dt > 0) {
            const o = boSot.get(t.kenh) || { dt: 0, thang: [] };
            o.dt += r.dt; o.thang.push(nhanThang(th));
            boSot.set(t.kenh, o);
          }
        }
      }
      if (boSot.size) {
        const ds = [...boSot.entries()].sort((a, b) => b[1].dt - a[1].dt);
        const tong = ds.reduce((a, [, v]) => a + v.dt, 0);
        warnings.push(
          `${ds.length} kênh CÓ doanh thu nhưng CHƯA tick "LÊN BÁO CÁO" nên không hiện trong bảng — `
          + `tổng ${Math.round(tong).toLocaleString('vi-VN')} đ đang bị bỏ ngoài báo cáo: `
          + ds.slice(0, 8).map(([k, v]) => `${k} (${Math.round(v.dt).toLocaleString('vi-VN')} đ)`).join(' · ')
          + `${ds.length > 8 ? ` · và ${ds.length - 8} kênh nữa` : ''}. `
          + `Mở bảng "Báo Cáo Doanh Thu - Kênh Bán Hàng" trong Lark, tick ô LÊN BÁO CÁO ở các dòng này.`);
      }
    }

    if (soThang > 1) {
      const lechTgt = cur.filter(t => t.soThangTgt > 0 && t.soThangTgt < t.soThangDt);
      if (lechTgt.length) warnings.push(
        `${lechTgt.length} kênh có doanh thu nhiều tháng hơn số tháng đã điền Target `
        + `(${lechTgt.slice(0, 5).map(t => `${t.hienThi || t.kenh}: doanh thu ${t.soThangDt} tháng / target ${t.soThangTgt} tháng`).join(' · ')}`
        + `${lechTgt.length > 5 ? ` · và ${lechTgt.length - 5} kênh nữa` : ''}). `
        + `Cột "% hoàn thành" của các kênh này đang cao hơn thực tế vì doanh thu cộng đủ kỳ `
        + `còn target chỉ cộng được vài tháng — điền nốt Target rồi xem lại.`);
      const khongTgt = cur.filter(t => t.soThangTgt === 0 && t.coDt);
      if (khongTgt.length) warnings.push(
        `${khongTgt.length} kênh chưa có Target tháng nào trong kỳ: `
        + khongTgt.slice(0, 6).map(t => t.hienThi || t.kenh).join(', ')
        + `${khongTgt.length > 6 ? `…(+${khongTgt.length - 6})` : ''}.`);
    }

    const shops = cur.map(t => {
      const truoc = gopTruoc.get(norm(t.kenh));
      if (!t.coDt) warnings.push(`"${t.kenh}" ${K.nhan}: chưa có doanh thu trong bảng Kênh Bán Hàng.`);

      /* %TT và trần Ads của cả kỳ suy ngược từ tổng, không lấy trung bình cộng
         các tháng — trung bình cộng sẽ sai khi doanh thu giữa các tháng lệch nhau. */
      const dt7 = t.coDt ? t.dt : null;
      const t8 = t.t8 || null;
      const s2 = {
        name: t.hienThi || t.kenh,
        grp: t.grp ? grpOf(t.grp) : grpOf(t.kenh),
        dt6: truoc && truoc.coDt ? truoc.dt : null,
        dt7,
        tgt7: t.tgt || null,
        ads7: t.ads || null,
        don7: t.don || null,
        tt: (dt7 && t8) ? (t8 / dt7 - 1) * 100 : 0,
        don8: t.don8 || null,
        adsPct8: (t8 && t.ads8) ? t.ads8 / t8 * 100 : 0,
        note: t.note || '',
      };
      if (t.badge) s2.badge = { cls: /🔥|top|hot/i.test(t.badge) ? 'fire' : 'ok', txt: t.badge };
      return s2;
    });

    /* --- Nhận xét (bảng phụ, tuỳ chọn) --- */
    let comments = [];
    if (process.env.LARK_TABLE_NOTES) {
      try {
        const nrows = await readTable(token, process.env.LARK_TABLE_NOTES, 'Nhận xét');
        comments = nrows
          .map(r => ({
            month: monthKey(pick(r, 'Tháng', 'Thang', 'Month'), pick(r, 'Năm', 'Nam', 'Year')),
            order: num(pick(r, 'Thứ tự', 'STT', 'Order')),
            tone: toneOf(pick(r, 'Mức độ', 'Muc do', 'Tone', 'Loại')),
            text: txt(pick(r, 'Nội dung', 'Noi dung', 'Nhận xét', 'Text')),
          }))
          .filter(c => c.text && (!c.month || trongKy.includes(c.month)))
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
          .map(({ tone, text }) => ({ tone, text }));
      } catch (e) {
        warnings.push('Không đọc được bảng Nhận xét: ' + e.message);
      }
    }

    const vn = new Date(Date.now() + 7 * 3600 * 1000);
    const p2 = n => String(n).padStart(2, '0');
    const stamp = `${p2(vn.getUTCDate())}/${p2(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()} ${p2(vn.getUTCHours())}:${p2(vn.getUTCMinutes())}`;

    /* Nhãn ba cột thời gian. Một tháng thì vẫn là T6 / T7 / 8/2026 như cũ;
       nhiều tháng thì đổi sang nhãn của kỳ để tiêu đề cột khỏi vô nghĩa. */
    const nhanKyTruoc = soThang === 1 ? label(shiftMonth(trongKy[0], -1)) : 'kỳ trước';
    const nhanKyNay   = soThang === 1 ? label(M) : K.ngan;
    const nhanKySau   = soThang === 1 ? title(shiftMonth(M, 1)) : 'kỳ tới';

    const data = {
      month: nhanKySau,
      nhanM: soThang === 1 ? null : 'kỳ tới',
      prevMonth: nhanKyNay,
      prev2Month: nhanKyTruoc,
      sub: `Số liệu tự động đồng bộ từ Lark — Base TỔNG QUAN DOANH SỐ 2026 · Cập nhật ${stamp} (giờ VN) · Đơn vị: đồng (VNĐ)`,
      footer: `Người lập: ${process.env.REPORT_AUTHOR || 'Nguyễn Đình Toàn'} · ${K.nhan}${soThang > 1 ? ` — cộng dồn ${soThang} tháng ${nhanThang(trongKy[0])}–${nhanThang(M)}` : ''} · Doanh thu / số đơn / ngân sách ADS lấy từ bảng "Báo Cáo Doanh Thu - Kênh Bán Hàng" · Đồng bộ lúc ${stamp}`,
      shops,
      comments,
    };

    /* --- Che số nhạy cảm theo quyền: XOÁ HẲN khỏi phản hồi, không chỉ ẩn ở giao diện --- */
    const an = [];
    if (!toi.quyen.xem_target) {
      an.push('target');
      for (const s of data.shops) { s.tgt7 = null; s.tt = 0; s.don8 = null; }
    }
    if (!toi.quyen.xem_ads) {
      an.push('ads');
      for (const s of data.shops) { s.ads7 = null; s.adsPct8 = 0; }
    }

    // Có người dùng riêng nên không dùng cache dùng chung của Vercel
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({
      ok: true, ky, moc, month: M, months: (thangCoSo.length ? thangCoSo : months), warnings, an,
      kyInfo: { nhan: K.nhan, ngan: K.ngan, phu: K.phu, tu: trongKy[0], den: M, soThang,
                coKyTruoc: trongKyTruoc.some(m => months.includes(m)) },
      toi: { email: toi.email, ten: toi.ten, quyen: toi.quyen },
      syncedAt: new Date().toISOString(), data,
    });
  } catch (err) {
    // Không cache lỗi — sửa cấu hình xong là thấy kết quả ngay
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: false, error: String(err.message || err) });
  }
};
