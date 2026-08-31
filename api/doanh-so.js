/* =====================================================================
   /api/doanh-so — Vercel Serverless Function
   TRANG: Doanh số & Target   (Sakawin Reports)

   Nguồn số DUY NHẤT của trang này là Base "TỔNG QUAN DOANH SỐ 2026 - SAKAWIN":

   1) "Báo Cáo Doanh Thu - Kênh Bán Hàng"  (bảng có sẵn, chỉ đọc, KHÔNG sửa)
      → Doanh thu bán hàng · Số đơn · Ngân sách ADS · Nền tảng
   2) "Target & Kế hoạch"                   (bảng tạo mới)
      → Target · kế hoạch tháng sau · quyết định kênh nào lên báo cáo,
        tên hiển thị và thứ tự dòng
   3) "Nhận xét"                            (tuỳ chọn)

   KHÔNG đọc bảng "Báo Cáo Chi Tiết - 2026". Bảng đó là doanh thu thuần,
   lãi lỗ và chi phí — thuộc về trang Tài chính sẽ làm sau, trộn vào đây
   là sai bản chất chỉ số.

   BIẾN MÔI TRƯỜNG trên Vercel (Settings → Environment Variables):
     LARK_APP_ID          cli_xxxxxxxx
     LARK_APP_SECRET      secret của Lark App
     LARK_APP_TOKEN       mã Base, lấy trong URL: .../base/<APP_TOKEN>?table=...
     LARK_TABLE_REVENUE   table_id bảng "Báo Cáo Doanh Thu - Kênh Bán Hàng"
     LARK_TABLE_TARGET    table_id bảng "Target & Kế hoạch"
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

/* ---------- Handler ---------- */
module.exports = async (req, res) => {
  try {
    for (const k of ['LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_APP_TOKEN', 'LARK_TABLE_REVENUE', 'LARK_TABLE_TARGET']) {
      if (!process.env[k]) throw new Error(`Thiếu biến môi trường ${k} trên Vercel.`);
    }

    const token = await larkToken();
    const [revRaw, tgtRaw] = await Promise.all([
      readTable(token, process.env.LARK_TABLE_REVENUE, 'Báo Cáo Doanh Thu - Kênh Bán Hàng'),
      readTable(token, process.env.LARK_TABLE_TARGET, 'Target & Kế hoạch'),
    ]);

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
      tt: num(pick(r, '% tăng trưởng KH', 'Tăng trưởng KH', '%TT KH')),
      donNext: num(pick(r, 'Số đơn KH', 'So don KH', 'Đơn KH')),
      adsPctNext: num(pick(r, 'Trần Ads % KH', 'Tran Ads % KH', 'Ads % KH')),
      badge: txt(pick(r, 'Nhãn', 'Nhan', 'Badge')),
      note: txt(pick(r, 'Ghi chú', 'Ghi chu', 'Note')),
      order: num(pick(r, 'Thứ tự', 'STT', 'Order')),
      grp: txt(pick(r, 'Nhóm', 'Nhom', 'Nền Tảng')),
    })).filter(t => t.month && t.kenh);

    if (!tgts.length) throw new Error('Bảng "Target & Kế hoạch" chưa có dòng nào hợp lệ (cần cột Tháng + Kênh Kinh Doanh).');

    const months = [...new Set(tgts.map(t => t.month))].sort();
    const asked = txt(req.query && req.query.month);
    const M = (asked ? monthKey(asked) : '') || months[months.length - 1];
    const P = shiftMonth(M, -1);
    const N = shiftMonth(M, 1);

    const cur = tgts.filter(t => t.month === M);
    if (!cur.length) throw new Error(`Bảng Target chưa có dòng nào cho tháng ${M}. Các tháng đang có: ${months.join(', ')}`);
    cur.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    const warnings = [];
    const shops = cur.map(t => {
      const now = rev.get(M + '|' + norm(t.kenh));
      const before = rev.get(P + '|' + norm(t.kenh));
      if (!now) warnings.push(`Không tìm thấy "${t.kenh}" tháng ${M} trong bảng doanh thu — kiểm tra tên kênh có khớp nhau không.`);

      const dt7 = now ? now.dt : null;
      const dt6 = before ? before.dt : null;
      if (now && dt7 == null) warnings.push(`"${t.kenh}" tháng ${M}: đã có dòng trong bảng doanh thu nhưng cột "Doanh Thu Kinh Doanh (số thực)" đang để trống.`);

      const s = {
        name: t.hienThi || t.kenh,
        // Nhóm: ưu tiên cột trong bảng Target → Nền Tảng ở bảng doanh thu → suy từ tên kênh
        grp: t.grp ? grpOf(t.grp) : (now ? now.grp : grpOf(t.kenh)),
        dt6,
        dt7,
        tgt7: t.tgt,
        ads7: now ? now.ads : null,
        don7: now ? now.don : null,
        tt: t.tt ?? 0,
        don8: t.donNext,
        adsPct8: t.adsPctNext ?? 0,
        note: t.note || '',
      };
      if (t.badge) s.badge = { cls: /🔥|top|hot/i.test(t.badge) ? 'fire' : 'ok', txt: t.badge };
      return s;
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
          .filter(c => c.text && (!c.month || c.month === M))
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
          .map(({ tone, text }) => ({ tone, text }));
      } catch (e) {
        warnings.push('Không đọc được bảng Nhận xét: ' + e.message);
      }
    }

    const vn = new Date(Date.now() + 7 * 3600 * 1000);
    const p2 = n => String(n).padStart(2, '0');
    const stamp = `${p2(vn.getUTCDate())}/${p2(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()} ${p2(vn.getUTCHours())}:${p2(vn.getUTCMinutes())}`;

    const data = {
      month: title(N),
      prevMonth: label(M),
      prev2Month: label(P),
      sub: `Số liệu tự động đồng bộ từ Lark — Base TỔNG QUAN DOANH SỐ 2026 · Cập nhật ${stamp} (giờ VN) · Đơn vị: đồng (VNĐ)`,
      footer: `Người lập: ${process.env.REPORT_AUTHOR || 'Nguyễn Đình Toàn'} · Doanh thu / số đơn / ngân sách ADS lấy từ bảng "Báo Cáo Doanh Thu - Kênh Bán Hàng"; target và kế hoạch lấy từ bảng "Target & Kế hoạch" · Đồng bộ lúc ${stamp}`,
      shops,
      comments,
    };

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    res.status(200).json({ ok: true, month: M, months, warnings, syncedAt: new Date().toISOString(), data });
  } catch (err) {
    // Không cache lỗi — sửa cấu hình xong là thấy kết quả ngay
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: false, error: String(err.message || err) });
  }
};
