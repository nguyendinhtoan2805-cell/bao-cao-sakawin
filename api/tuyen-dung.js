/* =====================================================================
   /api/tuyen-dung — Quản trị Tuyển dụng

   Trang ĐẦU TIÊN trong hệ thống được phép GHI ngược vào Lark. Năm trang kia
   chỉ đọc. Vì vậy phần ghi có ba lớp khoá độc lập, mô tả ở mục KHOÁ GHI.

   Đọc Base nhân sự (LARK_APP_TOKEN_HR), nhóm bảng TUYỂN DỤNG:
     "ỨNG VIÊN"              hồ sơ + trạng thái       (đọc & GHI)
     "KẾ HOẠCH TUYỂN DỤNG"   vị trí đang tuyển        (chỉ đọc)
     "JD VỊ TRÍ NHÂN SỰ"     tên 3 tiêu chí lõi       (chỉ đọc, có thì dùng)

   GET  /api/tuyen-dung          → danh sách ứng viên + thống kê
   POST /api/tuyen-dung          → đổi trạng thái một ứng viên
        body {id, tu, den, lyDo?, ghiChu?}

   Cố ý KHÔNG dùng chung hàm với nhan-su.js dù trùng một ít code: năm trang
   kia đã chốt và đang chạy, tách hàm dùng chung là đụng vào chúng.
===================================================================== */
const A = require('./_auth.js');
const HOST = (process.env.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');

/* ─────────────── KHOÁ GHI — lớp 2: chỉ những cột này được ghi ───────────────
   Cột lương, CCCD, hay bất cứ thứ gì khác không có tên ở đây thì không có
   đường nào ra tới lệnh ghi. */
const COT_DUOC_GHI = [
  'Trạng thái', 'Lịch sử', 'Loại ở bước', 'Lý do loại',
  'Ngày duyệt CV', 'Ngày sơ vấn', 'Ngày phỏng vấn', 'Ngày gửi offer', 'Ngày chốt',
];

/* ─────────────── KHOÁ GHI — lớp 3: luồng trạng thái hợp lệ ───────────────
   Mỗi trạng thái chỉ đi tiếp được tới đúng vài trạng thái kế. "Mới nhận"
   không nhảy thẳng sang "Gửi offer" được, dù có sửa gói tin gửi lên.
     quyen 'ghi'   → cần quyền ghi_tuyen_dung    (HR ghi nhận việc đã làm)
     quyen 'duyet' → cần quyền duyet_tuyen_dung  (quyết định đi tiếp hay dừng)
     ngay          → cột ngày web tự điền khi chuyển sang trạng thái đó */
const LUONG = {
  'Mới nhận': [
    { den: 'Đạt vòng CV',    quyen: 'duyet', ngay: 'Ngày duyệt CV' },
    { den: 'Loại',           quyen: 'duyet', ngay: 'Ngày chốt', buoc: 'Vòng CV' },
  ],
  'Đạt vòng CV': [
    { den: 'Đã sơ vấn',      quyen: 'ghi',   ngay: 'Ngày sơ vấn' },
    { den: 'Loại',           quyen: 'duyet', ngay: 'Ngày chốt', buoc: 'Vòng CV' },
  ],
  'Đã sơ vấn': [
    { den: 'Hẹn phỏng vấn',  quyen: 'duyet' },
    { den: 'Loại',           quyen: 'duyet', ngay: 'Ngày chốt', buoc: 'Sau sơ vấn' },
  ],
  'Hẹn phỏng vấn': [
    { den: 'Đã phỏng vấn',   quyen: 'ghi',   ngay: 'Ngày phỏng vấn' },
    { den: 'Loại',           quyen: 'duyet', ngay: 'Ngày chốt', buoc: 'Sau sơ vấn' },
  ],
  'Đã phỏng vấn': [
    { den: 'Gửi offer',      quyen: 'duyet', ngay: 'Ngày gửi offer' },
    { den: 'Loại',           quyen: 'duyet', ngay: 'Ngày chốt', buoc: 'Sau phỏng vấn' },
  ],
  'Gửi offer': [
    { den: 'Nhận việc',      quyen: 'ghi',   ngay: 'Ngày chốt' },
    { den: 'Từ chối offer',  quyen: 'ghi',   ngay: 'Ngày chốt', buoc: 'Từ chối offer' },
  ],
  'Nhận việc': [], 'Loại': [], 'Từ chối offer': [],
};
const KET_THUC = ['Nhận việc', 'Loại', 'Từ chối offer'];

/* Scorecard — trọng số theo mẫu chấm điểm trong vault (mục 05. Mẫu chấm điểm) */
const TIEU_CHI = [
  { ten: 'Kỹ năng lõi 1', ts: 0.20, loi: 1 },
  { ten: 'Kỹ năng lõi 2', ts: 0.20, loi: 2 },
  { ten: 'Kỹ năng lõi 3', ts: 0.20, loi: 3 },
  { ten: 'Thực thi',      ts: 0.20 },
  { ten: 'Giao tiếp',     ts: 0.10 },
  { ten: 'Phù hợp JD',    ts: 0.10 },
];

/* SLA lấy thẳng từ SOP "Quy trình Chiêu mộ & Giữ chân Nhân tài" */
const SLA = { sangLoc: 48, phanHoiPV: 48, guiOffer: 24, itNguon: 5, sauNgay: 3 };

/* ---------- đọc giá trị ô ---------- */
const txt = v => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object') ? (x.text ?? x.name ?? x.link ?? '') : String(x)).join(', ').trim();
  if (typeof v === 'object') {
    if (Array.isArray(v.value)) return txt(v.value);
    return String(v.text ?? v.name ?? v.link ?? v.value ?? '').trim();
  }
  return String(v).trim();
};
const num = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && !Array.isArray(v) && typeof v.value === 'number') return v.value;
  if (typeof v === 'object' && Array.isArray(v.value) && typeof v.value[0] === 'number') return v.value[0];
  const s = txt(v).replace(/[^\d.,-]/g, '');
  const n = Number(s.replace(/,/g, '.'));
  return Number.isFinite(n) ? n : null;
};
const norm = s => txt(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');

/* Múi giờ VN — cùng lý do như trang Nhân sự: Lark trả epoch theo giờ Base,
   cắt ngày theo UTC là ra hôm trước. */
const TZ = 7 * 3600000, NGAY = 86400000;
function ngay(v) {
  const n = (typeof v === 'number') ? v : (typeof v === 'object' && v && typeof v.value === 'number' ? v.value : null);
  if (n && n > 1e11) return new Date(n);
  const s = txt(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
const isoNgay = d => d ? new Date(d.getTime() + TZ).toISOString().slice(0, 10) : '';
const soNgayLich = d => Math.floor((d.getTime() + TZ) / NGAY);
/* Epoch cho Lark: 00:00 giờ VN của ngày hôm nay */
const epochHomNay = () => {
  const h = new Date();
  const iso = isoNgay(h).split('-').map(Number);
  return Date.UTC(iso[0], iso[1] - 1, iso[2]) - TZ;
};
const gioPhutVN = () => {
  const t = new Date(Date.now() + TZ);
  const p = n => String(n).padStart(2, '0');
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
};
const gioTu = d => d ? Math.floor((Date.now() - d.getTime()) / 3600000) : null;

/* ---------- Lark ---------- */
let _tk = { v: '', het: 0 };
async function larkToken() {
  if (_tk.v && Date.now() < _tk.het) return _tk.v;
  const r = await fetch(`${HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Lấy token Lark thất bại (${j.code}): ${j.msg}`);
  _tk = { v: j.tenant_access_token, het: Date.now() + 100 * 60 * 1000 };
  return _tk.v;
}
async function dsBang(tk, base) {
  const out = []; let page = '';
  for (let i = 0; i < 10; i++) {
    const u = new URL(`${HOST}/open-apis/bitable/v1/apps/${base}/tables`);
    u.searchParams.set('page_size', '100');
    if (page) u.searchParams.set('page_token', page);
    const j = await (await fetch(u, { headers: { Authorization: `Bearer ${tk}` } })).json();
    if (j.code !== 0) throw new Error(`Không đọc được danh sách bảng (${j.code}): ${j.msg}`);
    out.push(...(j.data.items || []));
    if (!j.data.has_more) break;
    page = j.data.page_token;
  }
  return out;
}
/* Khác nhan-su.js ở chỗ GIỮ LẠI record_id — không có id thì không ghi ngược được */
async function docBang(tk, base, tableId) {
  const out = []; let page = '';
  for (let i = 0; i < 20; i++) {
    const u = new URL(`${HOST}/open-apis/bitable/v1/apps/${base}/tables/${tableId}/records`);
    u.searchParams.set('page_size', '500');
    if (page) u.searchParams.set('page_token', page);
    const j = await (await fetch(u, { headers: { Authorization: `Bearer ${tk}` } })).json();
    if (j.code !== 0) throw new Error(`Đọc bảng thất bại (${j.code}): ${j.msg}`);
    for (const it of (j.data.items || [])) out.push({ id: it.record_id, f: it.fields || {} });
    if (!j.data.has_more) break;
    page = j.data.page_token;
  }
  return out;
}
async function docMot(tk, base, tableId, id) {
  const j = await (await fetch(
    `${HOST}/open-apis/bitable/v1/apps/${base}/tables/${tableId}/records/${id}`,
    { headers: { Authorization: `Bearer ${tk}` } })).json();
  if (j.code !== 0) throw new Error(`Không đọc được hồ sơ (${j.code}): ${j.msg}`);
  return j.data?.record?.fields || {};
}
const pick = (row, ...names) => {
  for (const n of names) if (row[n] !== undefined) return row[n];
  const keys = Object.keys(row);
  for (const n of names) { const h = keys.find(k => norm(k) === norm(n)); if (h) return row[h]; }
  return undefined;
};
const timBang = (bangs, ...tens) => {
  for (const t of tens) { const b = bangs.find(x => norm(x.name) === norm(t)); if (b) return b; }
  for (const t of tens) { const b = bangs.find(x => norm(x.name).includes(norm(t))); if (b) return b; }
  return null;
};

/* Điểm scorecard có trọng số — thiếu tiêu chí nào thì trả null, vì chấm nửa
   vời mà vẫn ra điểm thì con số đó đánh lừa người đọc. */
function diemPV(f) {
  const v = TIEU_CHI.map(t => num(pick(f, t.ten)));
  if (v.some(x => x == null)) return null;
  return Math.round(v.reduce((a, x, i) => a + x * TIEU_CHI[i].ts, 0) * 100) / 100;
}

module.exports = async (req, res) => {
  try {
    const BASE = process.env.LARK_APP_TOKEN_HR;
    if (!BASE) throw new Error('Thiếu biến môi trường LARK_APP_TOKEN_HR trên Vercel.');

    const toi = await A.canhCong(req, res, 'xem_tuyen_dung');
    if (!toi) return;

    /* ===== Tệp CV / ảnh: /api/tuyen-dung?cv=<file_token> =====
       Phải có endpoint riêng gác bằng xem_tuyen_dung. Trước đây trang trỏ nhầm
       sang /api/nhan-su?anh= — endpoint đó đòi quyền xem_nhan_su, nên HR chỉ có
       quyền tuyển dụng bấm vào là nhận 403 mà không hiểu vì sao. */
    if (req.query && req.query.cv) {
      try {
        const ft = String(req.query.cv).replace(/[^A-Za-z0-9_-]/g, '');
        if (!ft) return res.status(400).end('token không hợp lệ');
        const tkf = await larkToken();
        const r = await fetch(`${HOST}/open-apis/drive/v1/medias/${ft}/download`,
          { headers: { Authorization: `Bearer ${tkf}` } });
        if (!r.ok) return res.status(404).end('không tải được tệp');
        const buf = Buffer.from(await r.arrayBuffer());
        const kieu = r.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', kieu);
        /* inline để PDF và ảnh hiện thẳng trong khung, không bị tải xuống */
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.status(200).end(buf);
      } catch (err) {
        return res.status(502).end('lỗi tải tệp: ' + String(err.message || err));
      }
    }

    const tk = await larkToken();
    const bangs = await dsBang(tk, BASE);
    const bUV = timBang(bangs, 'ỨNG VIÊN', 'ung vien');
    const bKH = timBang(bangs, 'KẾ HOẠCH TUYỂN DỤNG', 'ke hoach tuyen dung');
    const bJD = timBang(bangs, 'JD VỊ TRÍ NHÂN SỰ', 'jd vi tri');
    if (!bUV) throw new Error('Chưa có bảng "ỨNG VIÊN" trong Base — tạo bảng theo spec rồi thử lại.');

    /* Lead chỉ thấy ứng viên vào bộ phận mình. Chặn ở máy chủ, xoá hẳn khỏi
       phản hồi — không phải ẩn ở giao diện. */
    const gioiHan = (!toi.quyen.quan_tri && toi.boPhan) ? norm(toi.boPhan) : '';
    const trongTam = x => !gioiHan || norm(x.boPhan) === gioiHan;

    /* ═══════════════ GHI: đổi trạng thái ═══════════════ */
    if (req.method === 'POST') {
      const b = req.body || {};
      const id = String(b.id || '').trim();
      const den = String(b.den || '').trim();
      if (!id || !den) return res.status(400).json({ ok: false, error: 'Thiếu hồ sơ hoặc trạng thái đích.' });

      /* Đọc lại hồ sơ NGAY TRƯỚC KHI GHI — vừa để biết trạng thái thật, vừa
         để phát hiện người khác vừa bấm. Lark không khoá bản ghi nên đây là
         cách duy nhất tránh ghi đè âm thầm. */
      const f = await docMot(tk, BASE, bUV.table_id, id);
      const ten = txt(pick(f, 'Họ và tên')) || 'hồ sơ này';
      const boPhan = txt(pick(f, 'Bộ phận'));
      if (gioiHan && norm(boPhan) !== gioiHan)
        return res.status(403).json({ ok: false, error: `${ten} không thuộc bộ phận ${toi.boPhan}.` });

      const tuThat = txt(pick(f, 'Trạng thái')) || 'Mới nhận';
      if (b.tu && b.tu !== tuThat) {
        const lich = txt(pick(f, 'Lịch sử')).trim().split('\n').pop() || '';
        return res.status(409).json({ ok: false, xungDot: true,
          error: `${ten} vừa được người khác cập nhật sang "${tuThat}". Tải lại trang để xem mới nhất.`,
          ganNhat: lich, trangThai: tuThat });
      }

      /* LỚP 3 — nước đi có nằm trong luồng không */
      const nuoc = (LUONG[tuThat] || []).find(x => x.den === den);
      if (!nuoc) return res.status(400).json({ ok: false,
        error: `Không thể chuyển từ "${tuThat}" sang "${den}".` });

      /* Quyền theo loại nút */
      const canQuyen = nuoc.quyen === 'duyet' ? 'duyet_tuyen_dung' : 'ghi_tuyen_dung';
      if (!toi.quyen[canQuyen]) return res.status(403).json({ ok: false,
        error: nuoc.quyen === 'duyet'
          ? `Chỉ tài khoản có quyền "Duyệt hoặc loại ứng viên" mới bấm được nút này.`
          : `Tài khoản chưa được cấp quyền ghi nhận tiến độ tuyển dụng.` });

      /* Loại người thì bắt buộc có lý do — dữ liệu này để sau còn biết mình
         đang loại vì thiếu kỹ năng hay vì lệch lương */
      const lyDo = String(b.lyDo || '').trim();
      if (nuoc.buoc && !lyDo)
        return res.status(400).json({ ok: false, error: 'Cần chọn lý do trước khi loại.' });

      /* Dựng bản vá, rồi LỚP 2 lọc lại lần nữa */
      const vaThô = { 'Trạng thái': den };
      if (nuoc.ngay) vaThô[nuoc.ngay] = epochHomNay();
      if (nuoc.buoc) { vaThô['Loại ở bước'] = nuoc.buoc; vaThô['Lý do loại'] = lyDo; }

      const cu = txt(pick(f, 'Lịch sử'));
      const dong = `${gioPhutVN()} · ${toi.ten || toi.email} · ${tuThat} → ${den}`
        + (lyDo ? ` (${lyDo})` : '') + (b.ghiChu ? ` — ${String(b.ghiChu).slice(0, 200)}` : '');
      vaThô['Lịch sử'] = (cu ? cu + '\n' : '') + dong;

      const va = {};
      for (const k of Object.keys(vaThô)) {
        if (!COT_DUOC_GHI.includes(k)) continue;          // ← LỚP 2
        va[k] = vaThô[k];
      }
      if (!Object.keys(va).length)
        return res.status(500).json({ ok: false, error: 'Không có cột nào hợp lệ để ghi.' });

      /* LỚP 1 — địa chỉ ghi dựng từ table_id đã dò được của đúng bảng ỨNG VIÊN,
         không nhận table_id từ phía gọi. Không có đường nào trỏ sang bảng khác. */
      const r = await fetch(
        `${HOST}/open-apis/bitable/v1/apps/${BASE}/tables/${bUV.table_id}/records/${id}`,
        { method: 'PUT',
          headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ fields: va }) });
      const j = await r.json();
      if (j.code !== 0) {
        if (j.code === 91403 || j.code === 99991672)
          throw new Error(`Lark từ chối ghi (${j.code}). Kiểm tra: app đã có scope "bitable:app" chưa, `
            + `và đã thêm app vào Base với quyền "Can edit" chưa.`);
        throw new Error(`Ghi vào Lark thất bại (${j.code}): ${j.msg}`);
      }
      return res.status(200).json({ ok: true, ten, tu: tuThat, den, dong });
    }

    /* ═══════════════ ĐỌC ═══════════════ */
    const rUV = await docBang(tk, BASE, bUV.table_id);
    const homNay = new Date();

    /* Tên 3 tiêu chí lõi theo vị trí — có bảng JD thì dùng, không có thì
       hiện tên chung. Không bắt buộc. */
    const loiTheoViTri = new Map();
    const jdTheoViTri = new Map();
    if (bJD) {
      for (const { f } of await docBang(tk, BASE, bJD.table_id)) {
        const vt = txt(pick(f, 'Vị trí', 'Vị trí tuyển dụng', 'Tên vị trí'));
        if (!vt) continue;
        const l = [1, 2, 3].map(i => txt(pick(f, `Tiêu chí lõi ${i}`))).filter(Boolean);
        if (l.length) loiTheoViTri.set(norm(vt), l);
        /* Khung lương và yêu cầu bắt buộc — để phiếu tóm tắt đối chiếu được.
           Không có cũng không sao, chỉ là phiếu bớt thông tin. */
        jdTheoViTri.set(norm(vt), {
          luongTu: num(pick(f, 'Mức lương từ', 'Lương từ')),
          luongDen: num(pick(f, 'Mức lương đến', 'Lương đến')),
          batBuoc: txt(pick(f, 'Yêu cầu bắt buộc', 'Must-have'))
            .split(/[\n·;]+/).map(s => s.trim()).filter(Boolean),
        });
      }
    }

    const uv = rUV.map(({ id, f }) => {
      const tt = txt(pick(f, 'Trạng thái')) || 'Mới nhận';
      const nhanCV = ngay(pick(f, 'Ngày nhận CV'));
      const nPV = ngay(pick(f, 'Ngày phỏng vấn'));
      const viTri = txt(pick(f, 'Vị trí ứng tuyển'));
      const cv = pick(f, 'File CV');
      const anh = pick(f, 'Ảnh');
      const luong = num(pick(f, 'Mức lương mong muốn'));
      const hieuBiet = txt(pick(f, 'Hiểu biết Sakawin'));
      const jd = jdTheoViTri.get(norm(viTri));
      const namKN = num(pick(f, 'Số năm kinh nghiệm'));

      /* ─── PHIẾU TÓM TẮT ───
         Ghép dữ liệu Lark với ba nguyên tắc trong SOP, để Lead nhìn là quyết
         được mà không phải mở Lark hay đọc hết CV:
           · đối chiếu must-have TRƯỚC (Giai đoạn 2 — loại nhanh nếu thiếu)
           · lương trong hay vượt khung JD (Mẫu sơ vấn, phần D)
           · gate hiểu biết Sakawin (bài học case Đinh Diễm Quỳnh)
         KHÔNG đọc nội dung CV — CV là dữ liệu cá nhân, không gửi đi đâu cả. */
      const co = [];
      if (namKN != null) co.push({ muc: 'tin', nhan: 'Kinh nghiệm', gt: namKN + ' năm' });
      const ctyCu = txt(pick(f, 'Công ty gần nhất'));
      if (ctyCu) co.push({ muc: 'tin', nhan: 'Công ty gần nhất', gt: ctyCu });

      if (luong != null && jd && (jd.luongTu != null || jd.luongDen != null)) {
        const tren = jd.luongDen != null && luong > jd.luongDen;
        const duoi = jd.luongTu != null && luong < jd.luongTu;
        co.push({ muc: tren ? 'canh' : 'tot',
          nhan: 'Lương mong muốn',
          gt: tren ? 'vượt khung JD' : (duoi ? 'dưới khung JD' : 'trong khung JD') });
      }
      if (!hieuBiet && !['Mới nhận'].includes(tt))
        co.push({ muc: 'canh', nhan: 'Gate Sakawin', gt: 'chưa ghi mức hiểu biết' });
      else if (/chua/.test(norm(hieuBiet)))
        co.push({ muc: 'canh', nhan: 'Gate Sakawin', gt: 'chưa tìm hiểu — cần giao mini-task' });
      else if (hieuBiet)
        co.push({ muc: 'tot', nhan: 'Gate Sakawin', gt: hieuBiet });

      if (!cv || !(Array.isArray(cv) && cv.length))
        co.push({ muc: 'canh', nhan: 'Hồ sơ', gt: 'chưa đính CV' });

      return {
        anh: (Array.isArray(anh) && anh[0] && anh[0].file_token) ? anh[0].file_token : '',
        namKN, ctyCu, tomTat: txt(pick(f, 'Tóm tắt nhanh')),
        co, batBuoc: (jd && jd.batBuoc.length) ? jd.batBuoc : null,
        khungLuong: jd ? { tu: jd.luongTu, den: jd.luongDen } : null,
        id, ten: txt(pick(f, 'Họ và tên')),
        sdt: txt(pick(f, 'Số điện thoại')), email: txt(pick(f, 'Email')),
        viTri, boPhan: txt(pick(f, 'Bộ phận')) || '(chưa phân)',
        nguon: txt(pick(f, 'Nguồn')) || '(chưa ghi)',
        nhanCV: isoNgay(nhanCV),
        cv: (Array.isArray(cv) && cv[0] && cv[0].file_token) ? cv[0].file_token : '',
        cvTen: (Array.isArray(cv) && cv[0]) ? txt(cv[0].name) : '',
        trangThai: tt,
        ngayDuyetCV: isoNgay(ngay(pick(f, 'Ngày duyệt CV'))),
        ngaySoVan: isoNgay(ngay(pick(f, 'Ngày sơ vấn'))),
        ngayPV: isoNgay(nPV),
        ngayOffer: isoNgay(ngay(pick(f, 'Ngày gửi offer'))),
        ngayChot: isoNgay(ngay(pick(f, 'Ngày chốt'))),
        loaiOBuoc: txt(pick(f, 'Loại ở bước')), lyDoLoai: txt(pick(f, 'Lý do loại')),
        hieuBiet: txt(pick(f, 'Hiểu biết Sakawin')),
        ketQuaSoVan: txt(pick(f, 'Kết quả sơ vấn')),
        luongMongMuon: num(pick(f, 'Mức lương mong muốn')),
        nguoiPV: txt(pick(f, 'Người phỏng vấn')),
        diem: TIEU_CHI.map(t => num(pick(f, t.ten))),
        tenLoi: loiTheoViTri.get(norm(viTri)) || null,
        diemTong: diemPV(f),
        ghiChuPV: txt(pick(f, 'Ghi chú phỏng vấn')),
        ghiChu: txt(pick(f, 'Ghi chú')),
        lichSu: txt(pick(f, 'Lịch sử')),
        dangMo: !KET_THUC.includes(tt),
        gioCho: tt === 'Mới nhận' ? gioTu(nhanCV) : (tt === 'Đã phỏng vấn' ? gioTu(nPV) : null),
        /* Nút nào hiện ra — tính ở máy chủ theo đúng luồng, giao diện chỉ vẽ lại */
        nut: (LUONG[tt] || []).map(x => ({ den: x.den, quyen: x.quyen, buoc: x.buoc || '' }))
          .filter(x => toi.quyen[x.quyen === 'duyet' ? 'duyet_tuyen_dung' : 'ghi_tuyen_dung']),
      };
    }).filter(x => x.ten).filter(trongTam);

    /* Phễu */
    const BUOC = ['Mới nhận', 'Đạt vòng CV', 'Đã sơ vấn', 'Hẹn phỏng vấn', 'Đã phỏng vấn', 'Gửi offer', 'Nhận việc'];
    const pheu = BUOC.map(b => ({ ten: b, so: uv.filter(x => x.trangThai === b).length }));

    /* Vị trí đang tuyển */
    let viTri = [];
    if (bKH) {
      viTri = (await docBang(tk, BASE, bKH.table_id)).map(({ f }) => {
        const ten = txt(pick(f, 'Vị trí tuyển dụng'));
        const mo = ngay(pick(f, 'Ngày mở tuyển'));
        const ds = uv.filter(x => norm(x.viTri) === norm(ten));
        return {
          ten, boPhan: txt(pick(f, 'Phòng ban/Nhóm')) || '(chưa phân)',
          canTuyen: num(pick(f, 'SL cần tuyển')) || 1,
          trangThai: txt(pick(f, 'Trạng thái')),
          moTuyen: isoNgay(mo),
          ngayMo: mo ? soNgayLich(homNay) - soNgayLich(mo) : null,
          soCV: ds.length, dangMo: ds.filter(x => x.dangMo).length,
          nhanViec: ds.filter(x => x.trangThai === 'Nhận việc').length,
        };
      }).filter(x => x.ten).filter(trongTam);
    }

    /* Hiệu quả nguồn — đếm cả CV lẫn người thật sự nhận việc */
    const mN = new Map();
    for (const x of uv) {
      if (!mN.has(x.nguon)) mN.set(x.nguon, { ten: x.nguon, cv: 0, pv: 0, nhan: 0 });
      const o = mN.get(x.nguon); o.cv++;
      if (x.ngayPV) o.pv++;
      if (x.trangThai === 'Nhận việc') o.nhan++;
    }
    const nguon = [...mN.values()].sort((a, b) => b.cv - a.cv);

    /* Lý do loại */
    const mL = new Map();
    for (const x of uv.filter(x => x.lyDoLoai)) mL.set(x.lyDoLoai, (mL.get(x.lyDoLoai) || 0) + 1);
    const lyDo = [...mL.entries()].map(([ten, so]) => ({ ten, so })).sort((a, b) => b.so - a.so);

    /* ---------- Cảnh báo, bám đúng SLA trong SOP ---------- */
    const canhBao = [];
    const tonDong = uv.filter(x => x.trangThai === 'Mới nhận' && x.gioCho != null && x.gioCho > SLA.sangLoc);
    if (tonDong.length) canhBao.push({ muc: 'canh-bao',
      tieuDe: `${tonDong.length} hồ sơ quá ${SLA.sangLoc}h chưa ai sàng lọc`,
      noiDung: `${tonDong.slice(0, 4).map(x => `${x.ten} (${Math.floor(x.gioCho / 24)} ngày)`).join(', ')}`
        + `${tonDong.length > 4 ? '…' : ''}. Đây chính là chỗ CV bị bỏ quên.` });

    const choPhanHoi = uv.filter(x => x.trangThai === 'Đã phỏng vấn' && x.gioCho != null && x.gioCho > SLA.phanHoiPV);
    if (choPhanHoi.length) canhBao.push({ muc: 'canh-bao',
      tieuDe: `${choPhanHoi.length} người phỏng vấn xong quá ${SLA.phanHoiPV}h chưa có kết quả`,
      noiDung: `${choPhanHoi.slice(0, 4).map(x => x.ten).join(', ')}${choPhanHoi.length > 4 ? '…' : ''}. `
        + 'SOP quy định phản hồi trong 48h dù đạt hay không — ứng viên giỏi có thể đang phỏng vấn nơi khác.' });

    const thieuGate = uv.filter(x => ['Hẹn phỏng vấn', 'Đã phỏng vấn'].includes(x.trangThai) && !x.hieuBiet);
    if (thieuGate.length) canhBao.push({ muc: 'luu-y',
      tieuDe: `${thieuGate.length} người vào phỏng vấn mà chưa ghi mức hiểu biết Sakawin`,
      noiDung: `${thieuGate.slice(0, 4).map(x => x.ten).join(', ')}${thieuGate.length > 4 ? '…' : ''}. `
        + 'Đây là gate sinh ra từ case Đinh Diễm Quỳnh — bỏ qua là lặp lại đúng lỗi cũ.' });

    const itNguon = viTri.filter(v => /dang tuyen|mo|open/.test(norm(v.trangThai))
      && v.ngayMo != null && v.ngayMo >= SLA.sauNgay && v.soCV < SLA.itNguon);
    if (itNguon.length) canhBao.push({ muc: 'luu-y',
      tieuDe: `${itNguon.length} vị trí mở trên ${SLA.sauNgay} ngày mà dưới ${SLA.itNguon} hồ sơ`,
      noiDung: `${itNguon.map(v => `${v.ten} (${v.soCV} hồ sơ)`).join(', ')}. `
        + 'SOP đặt mốc 15–20 hồ sơ trong 7 ngày — dưới mức này thì phải chủ động tìm nguồn.' });

    const nhanViecMoi = uv.filter(x => x.trangThai === 'Nhận việc');
    if (nhanViecMoi.length) canhBao.push({ muc: 'tot',
      tieuDe: `${nhanViecMoi.length} người đã nhận việc`,
      noiDung: `${nhanViecMoi.map(x => x.ten).join(', ')}. Nhớ tạo hồ sơ trong bảng nhân sự và chạy checklist onboard.` });

    res.status(200).json({
      ok: true,
      toi: { email: toi.email, ten: toi.ten, quyen: toi.quyen, boPhan: toi.boPhan || '' },
      capNhat: new Date().toISOString(),
      data: {
        uv, pheu, viTri, nguon, lyDo, canhBao,
        buoc: BUOC, tieuChi: TIEU_CHI.map(t => ({ ten: t.ten, ts: t.ts })),
        gioiHan: gioiHan ? toi.boPhan : '',
        tong: {
          dangMo: uv.filter(x => x.dangMo).length,
          tonDong: tonDong.length,
          quaHan: choPhanHoi.length,
          nhanViec: uv.filter(x => x.trangThai === 'Nhận việc').length,
          viTriMo: viTri.filter(v => /dang tuyen|mo|open/.test(norm(v.trangThai))).length,
        },
        coJD: !!bJD, coKH: !!bKH,
      },
    });
  } catch (err) {
    res.status(200).json({ ok: false, error: String(err.message || err) });
  }
};
