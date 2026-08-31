/* =====================================================================
   /api/data — Vercel Serverless Function
   Đọc số liệu từ LARK BASE và trả về đúng định dạng DATA của web báo cáo.

   BIẾN MÔI TRƯỜNG cần khai trên Vercel (Settings → Environment Variables):
     LARK_APP_ID        vd: cli_a1b2c3d4e5f6
     LARK_APP_SECRET    secret của Lark App
     LARK_APP_TOKEN     mã Base, lấy trong URL: .../base/<APP_TOKEN>?table=...
     LARK_TABLE_SHOPS   table_id bảng "Doanh so theo thang" (tblXXXX trong URL)
     LARK_TABLE_NOTES   (tuỳ chọn) table_id bảng "Nhan xet"
     LARK_HOST          (tuỳ chọn) mặc định https://open.larksuite.com
                        Nếu dùng Feishu (bản Trung Quốc): https://open.feishu.cn
     REPORT_AUTHOR      (tuỳ chọn) tên người lập ghi ở chân trang

   Gọi thử: /api/data            → tháng mới nhất có trong bảng
            /api/data?month=2026-07  → chốt số tháng 7, lên kế hoạch tháng 8
===================================================================== */

const HOST = (process.env.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');

/* ---------- Helpers đọc giá trị từ Lark Base ---------- */
const txt = v => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object') ? (x.text ?? x.name ?? '') : String(x)).join('').trim();
  if (typeof v === 'object') return String(v.text ?? v.name ?? v.value ?? '').trim();
  return String(v).trim();
};

const num = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = txt(v).replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;
  const sep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (sep === -1) return Number(s);
  // ".123" ở cuối => dấu phân nhóm nghìn (1.234.567). Ngược lại là dấu thập phân (6,5)
  const decimals = s.length - sep - 1;
  if (decimals === 3) return Number(s.replace(/[.,]/g, ''));
  return Number(s.slice(0, sep).replace(/[.,]/g, '') + '.' + s.slice(sep + 1));
};

/* "2026-08" | "8/2026" | date field (epoch ms) → "2026-08" */
const ym = v => {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && v > 1e11) {
    const d = new Date(v);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const s = txt(v);
  let m = s.match(/(\d{4})[-/.](\d{1,2})/);              // 2026-08
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}`;
  m = s.match(/(?:T|tháng)?\s*(\d{1,2})[-/.](\d{4})/i);  // 8/2026, T8/2026
  if (m) return `${m[2]}-${String(+m[1]).padStart(2, '0')}`;
  return s;
};

const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const label = key => 'T' + Number(key.split('-')[1]);              // 2026-08 → T8
const title = key => `${Number(key.split('-')[1])}/${key.split('-')[0]}`; // → 8/2026

/* Nhóm kênh: chấp nhận nhiều cách gõ, quy về 4 mã của web */
const GRP = { shopee: 'shopee', tiktok: 'tiktok', 'tik tok': 'tiktok', 'kênh khác': 'khac', 'kenh khac': 'khac', khac: 'khac', khác: 'khac', offline: 'off', off: 'off', 'aeon': 'off', 'go!': 'off' };
const grpOf = v => {
  const k = txt(v).toLowerCase().trim();
  if (GRP[k]) return GRP[k];
  if (k.includes('shopee')) return 'shopee';
  if (k.includes('tiktok') || k.includes('tik tok')) return 'tiktok';
  if (k.includes('off') || k.includes('aeon') || k.includes('go')) return 'off';
  return 'khac';
};

const TONE = { 'tốt': 'good', tot: 'good', good: 'good', 'tích cực': 'good', 'cảnh báo': 'warn', 'canh bao': 'warn', warn: 'warn', 'rủi ro': 'warn' };
const toneOf = v => TONE[txt(v).toLowerCase().trim()] || '';

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

async function readTable(token, tableId) {
  const out = [];
  let pageToken = '';
  for (let guard = 0; guard < 20; guard++) {
    const url = new URL(`${HOST}/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${tableId}/records`);
    url.searchParams.set('page_size', '500');
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    if (j.code !== 0) throw new Error(`Đọc bảng ${tableId} thất bại (code ${j.code}): ${j.msg}`);
    for (const it of (j.data.items || [])) out.push(it.fields || {});
    if (!j.data.has_more) break;
    pageToken = j.data.page_token;
  }
  return out;
}

/* Lấy field theo nhiều tên gọi có thể có (phòng khi cột bị đổi tên nhẹ) */
const pick = (row, ...names) => {
  for (const n of names) if (row[n] !== undefined) return row[n];
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find(k => k.toLowerCase().replace(/\s+/g, '') === n.toLowerCase().replace(/\s+/g, ''));
    if (k) return row[k];
  }
  return undefined;
};

/* ---------- Handler ---------- */
module.exports = async (req, res) => {
  try {
    for (const k of ['LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_APP_TOKEN', 'LARK_TABLE_SHOPS']) {
      if (!process.env[k]) throw new Error(`Thiếu biến môi trường ${k} trên Vercel.`);
    }

    const token = await larkToken();
    const rows = await readTable(token, process.env.LARK_TABLE_SHOPS);

    /* Chuẩn hoá từng dòng: 1 dòng = 1 shop × 1 tháng ĐÃ CHỐT
       (cột kế hoạch trên dòng đó là kế hoạch cho tháng liền sau) */
    const recs = rows.map(r => ({
      month: ym(pick(r, 'Tháng', 'Thang', 'Month')),
      name: txt(pick(r, 'Shop', 'Tên shop', 'Kênh', 'Điểm bán')),
      grp: grpOf(pick(r, 'Nhóm', 'Nhom', 'Nhóm kênh', 'Group')),
      dt: num(pick(r, 'Doanh thu', 'Doanh số', 'Revenue')),
      tgt: num(pick(r, 'Target', 'Chỉ tiêu', 'Mục tiêu')),
      ads: num(pick(r, 'Chi phí Ads', 'Chi phi Ads', 'Ads', 'Chi phí quảng cáo')),
      don: num(pick(r, 'Số đơn', 'So don', 'Đơn', 'Orders')),
      tt: num(pick(r, '% tăng trưởng KH', '% tang truong KH', 'Tăng trưởng KH', '%TT KH')),
      donNext: num(pick(r, 'Số đơn KH', 'So don KH', 'Đơn KH')),
      adsPctNext: num(pick(r, 'Trần Ads % KH', 'Tran Ads % KH', 'Ads % KH', 'Trần Ads%')),
      badge: txt(pick(r, 'Nhãn', 'Nhan', 'Badge')),
      note: txt(pick(r, 'Ghi chú', 'Ghi chu', 'Note')),
      order: num(pick(r, 'Thứ tự', 'STT', 'Order')),
    })).filter(x => x.month && x.name);

    if (!recs.length) throw new Error('Bảng Lark chưa có dòng nào hợp lệ (cần tối thiểu cột Tháng + Shop).');

    const months = [...new Set(recs.map(r => r.month))].sort();
    const M = ym(req.query && req.query.month) || months[months.length - 1]; // tháng vừa chốt
    const P = shiftMonth(M, -1);                                             // tháng trước nữa
    const N = shiftMonth(M, 1);                                              // tháng target

    const cur = recs.filter(r => r.month === M);
    if (!cur.length) throw new Error(`Không có dòng nào cho tháng ${M}. Các tháng đang có: ${months.join(', ')}`);
    const prevByName = new Map(recs.filter(r => r.month === P).map(r => [r.name, r]));

    cur.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (b.dt ?? 0) - (a.dt ?? 0));

    const shops = cur.map(r => {
      const s = {
        name: r.name,
        grp: r.grp,
        dt6: prevByName.has(r.name) ? prevByName.get(r.name).dt : null,
        dt7: r.dt,
        tgt7: r.tgt,
        ads7: r.ads,
        don7: r.don,
        tt: r.tt ?? 0,
        don8: r.donNext,
        adsPct8: r.adsPctNext ?? 0,
        note: r.note || '',
      };
      if (r.badge) s.badge = { cls: /🔥|top|hot/i.test(r.badge) ? 'fire' : 'ok', txt: r.badge };
      return s;
    });

    /* Nhận xét (bảng phụ, tuỳ chọn) */
    let comments = [];
    if (process.env.LARK_TABLE_NOTES) {
      try {
        const nrows = await readTable(token, process.env.LARK_TABLE_NOTES);
        comments = nrows
          .map(r => ({
            month: ym(pick(r, 'Tháng', 'Thang', 'Month')),
            order: num(pick(r, 'Thứ tự', 'STT', 'Order')),
            tone: toneOf(pick(r, 'Mức độ', 'Muc do', 'Tone', 'Loại')),
            text: txt(pick(r, 'Nội dung', 'Noi dung', 'Nhận xét', 'Text')),
          }))
          .filter(c => c.text && (!c.month || c.month === M))
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
          .map(({ tone, text }) => ({ tone, text }));
      } catch (e) { /* thiếu bảng nhận xét thì bỏ qua, không làm hỏng báo cáo */ }
    }

    const now = new Date(Date.now() + 7 * 3600 * 1000); // giờ VN
    const stamp = `${String(now.getUTCDate()).padStart(2, '0')}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${now.getUTCFullYear()} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

    const data = {
      month: title(N),
      prevMonth: label(M),
      prev2Month: label(P),
      sub: `Số liệu tự động đồng bộ từ Lark Base · Cập nhật ${stamp} (giờ VN) · Đơn vị: đồng (VNĐ)`,
      footer: `Người lập: ${process.env.REPORT_AUTHOR || 'Nguyễn Đình Toàn'} · Số liệu lấy trực tiếp từ Lark Base lúc ${stamp} · Nguồn: Lark Base — Doanh số theo tháng`,
      shops,
      comments,
    };

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    res.status(200).json({ ok: true, month: M, months, syncedAt: new Date().toISOString(), data });
  } catch (err) {
    // Không cache lỗi — sửa cấu hình xong là thấy kết quả ngay
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: false, error: String(err.message || err) });
  }
};
