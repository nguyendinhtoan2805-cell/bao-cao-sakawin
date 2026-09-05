/* =====================================================================
   /api/nhan-su — Trang Quản trị & Phát triển Nhân sự

   Đọc Base nhân sự riêng (KHÁC Base báo cáo kinh doanh):
     LARK_APP_TOKEN_HR   token Base nhân sự, vd X1hIwxnaziZo0mk8BIal4Ljggxe

   Bốn bảng, TỰ DÒ THEO TÊN — không cần khai báo table_id:
     "QUẢN LÝ THÔNG TIN NHÂN SỰ"  hồ sơ gốc
     "THÔNG TIN HĐLĐ"             hạn hợp đồng
     "Đánh giá Nhân sự"           chấm Skill-Will theo quý  (có thì đọc)
     "Đào tạo"                    khoá đã học               (có thì đọc)
   Hai bảng sau chưa tạo cũng không sao — trang vẫn chạy, chỉ thiếu phần đó.

   ────────────────────────────────────────────────────────────────────
   DANH SÁCH TRẮNG — chỉ những cột dưới đây được đọc. Base này chứa CCCD,
   số điện thoại, địa chỉ, BHXH, lương; không cột nào trong số đó có mặt ở
   đây, nên không có đường nào ra tới trình duyệt. Muốn thêm cột thì sửa
   COT_DUOC_DOC chứ đừng đọc thẳng row[...] ở chỗ khác.
   ──────────────────────────────────────────────────────────────────── */
const A = require('./_auth.js');
const HOST = (process.env.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');

const COT_DUOC_DOC = [
  'Mã NV', 'Họ và tên', 'Giới tính', 'Trạng thái', 'Chức vụ', 'Phòng ban/Bộ phận',
  'Đội/Nhóm', 'Vị trí Chuyên môn', 'Onboarding date', 'Offboarding date',
  'Số năm', 'Thâm niên', 'Loại tuổi', 'Hình ảnh', 'Cơ chế KPIs', 'Ghi Chú',
  /* Bốn cột dưới thêm theo yêu cầu 04/09/2026. Chỉ tài khoản có quyền
     xem_ca_nhan mới nhận được — không có quyền thì XOÁ HẲN khỏi phản hồi API
     chứ không ẩn ở giao diện. Quyền này mặc định TẮT, kể cả với người đã có
     quyền xem trang Nhân sự. */
  'Số điện thoại', 'Địa chỉ thường trú', 'Ngày/tháng/năm/sinh', 'Email',
];
const COT_CA_NHAN = ['Số điện thoại', 'Địa chỉ thường trú', 'Ngày/tháng/năm/sinh', 'Email'];

/* Trọng số đã chốt 03/09/2026. Đổi ở đây là đổi toàn hệ thống. */
const TIEU_CHI_S = ['S1 Kết quả', 'S2 Chuyên môn', 'S3 Tốc độ', 'S4 Tự xử lý', 'S5 Đào tạo'];
const TIEU_CHI_W = ['W1 Chủ động', 'W2 Áp lực', 'W3 Học hỏi', 'W4 Gắn bó', 'W5 Team'];
/* S5 "Đào tạo" chỉ nặng với người có quân. Để 5% cho nhân viên thường vì đào tạo
   người khác không nằm trong vai trò của họ — tính nặng là phạt oan cả công ty
   (kỳ Q2/2026: S5 trung bình 3,44 trong khi bốn tiêu chí kia ~6,0). */
const TS_S = { nv: [0.35, 0.25, 0.15, 0.20, 0.05], ld: [0.30, 0.20, 0.15, 0.15, 0.20] };
const TS_W = [0.30, 0.20, 0.25, 0.10, 0.15];
const NGUONG = 5.5;   // cố định, không dùng trung vị — xem ghi chú ở cuối file

const O = {
  1: { ma: 1, ten: 'Ngôi sao',            chienLuoc: 'Delegate — giao việc khó, giữ chân', uuTien: 'Cao — giữ bằng mọi giá' },
  2: { ma: 2, ten: 'Tân binh nhiệt huyết', chienLuoc: 'Guide — đào tạo, kèm cặp',          uuTien: 'Cao — đầu tư phát triển' },
  3: { ma: 3, ten: 'Vấn đề',              chienLuoc: 'Direct — chỉ đạo hoặc thay thế',     uuTien: 'Cấp bách — xem xét nhanh' },
  4: { ma: 4, ten: 'Cao thủ chán nản',    chienLuoc: 'Excite — khơi lại động lực',         uuTien: 'Cao — tránh mất người' },
};
const oCua = (s, w) => (s >= NGUONG ? (w >= NGUONG ? 1 : 4) : (w >= NGUONG ? 2 : 3));
/* Sát vạch: lệch mốc dưới 0,3 điểm. Với những người này, chỉ cần một tiêu chí
   chấm lệch một điểm là nhảy sang ô khác — nên đừng đối xử với họ như một ca
   đã rõ ràng. Kỳ Q2/2026 có 10/27 người rơi vào vùng này. */
const BIEN = 0.3;
const satVach = (s, w) => Math.abs(s - NGUONG) < BIEN || Math.abs(w - NGUONG) < BIEN;

/* ---------- đọc giá trị từ ô Lark ----------
   Cột công thức trả về lựa chọn thì Lark đưa nguyên MÃ NỘI BỘ dạng "opthDZgsDw"
   thay vì nhãn tiếng Việt (đã lọt ra giao diện ở cột Loại tuổi). Không có cách
   nào đổi mã đó thành nhãn qua API records, nên coi như rỗng — thà để trống còn
   hơn hiện một chuỗi vô nghĩa cho người đọc. */
const MA_NOI_BO = /^(opt|fld|tbl|rec|usr)[A-Za-z0-9]{6,}$/;
const boMa = s => MA_NOI_BO.test(s) ? '' : s;
const txt = v => {
  if (v == null) return '';
  if (Array.isArray(v)) return boMa(v.map(x => (x && typeof x === 'object') ? (x.text ?? x.name ?? x.link ?? '') : String(x)).join(', ').trim());
  if (typeof v === 'object') {
    if (Array.isArray(v.value)) return txt(v.value);
    return boMa(String(v.text ?? v.name ?? v.link ?? v.value ?? '').trim());
  }
  return boMa(String(v).trim());
};
const num = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && !Array.isArray(v) && typeof v.value === 'number') return v.value;
  if (typeof v === 'object' && Array.isArray(v.value) && typeof v.value[0] === 'number') return v.value[0];
  const s = txt(v).replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;
  const n = Number(s.replace(/,/g, '.'));
  return Number.isFinite(n) ? n : null;
};
const norm = s => txt(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');

/* Ngày: Lark trả epoch ms cho cột kiểu Ngày. Cột "Offboarding date" hiện đang là
   kiểu Văn bản nên phải đỡ thêm dạng chuỗi dd/mm/yyyy — bỏ được khi đã đổi kiểu. */
function ngay(v) {
  const n = (typeof v === 'number') ? v : (typeof v === 'object' && v && typeof v.value === 'number' ? v.value : null);
  if (n && n > 1e11) return new Date(n);
  const s = txt(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
/* MÚI GIỜ — Lark lưu cột Ngày theo múi giờ của Base (Việt Nam, UTC+7) rồi trả về
   epoch ms. Ngày 15/03 lúc 00:00 giờ VN chính là 14/03 lúc 17:00 giờ UTC, nên lấy
   phần ngày theo UTC là ra ngày HÔM TRƯỚC. Đó là lý do ngày sinh bị lùi một ngày —
   và lỗi này dính mọi cột ngày: onboard, offboard, hạn hợp đồng, ngày review,
   ngày đào tạo. Cộng bù +7 giờ trước khi cắt phần ngày là khớp lại với Lark.

   Chuỗi "dd/mm/yyyy" parse bằng Date.UTC ở hàm ngay() cũng đi qua đây và vẫn
   đúng: 00:00 UTC + 7h vẫn nằm trong cùng một ngày. */
const TZ = 7 * 3600000;
const NGAY = 86400000;
const isoNgay = d => d ? new Date(d.getTime() + TZ).toISOString().slice(0, 10) : '';
const thangCua = d => d ? isoNgay(d).slice(0, 7) : '';
/* Số ngày lịch (theo giờ VN) kể từ epoch — để đếm "còn bao nhiêu ngày" bằng cách
   trừ hai ngày lịch, thay vì trừ hai mốc thời gian rồi làm tròn (cách cũ lệch một
   ngày tuỳ giờ trong ngày lúc mở trang). */
const soNgayLich = d => Math.floor((d.getTime() + TZ) / NGAY);
const soThangGiua = (a, b) => !a || !b ? null : Math.max(0, Math.round((b - a) / NGAY / 30.44));

/* ---------- Lark ---------- */
/* Token sống ~2 tiếng bên Lark nhưng trước đây mỗi lần gọi larkToken() là xin
   mới — trang có ảnh thì mỗi bức ảnh một request riêng, 53 người là 53 lần xin
   token dồn dập, dễ chạm giới hạn tốc độ của Lark. Giữ tạm trong bộ nhớ của
   tiến trình (còn hạn thì dùng lại) để một lượt tải trang chỉ xin token 1 lần
   dù có bao nhiêu ảnh. */
let _tokenCache = { tk: '', het: 0 };
async function larkToken() {
  if (_tokenCache.tk && Date.now() < _tokenCache.het) return _tokenCache.tk;
  const r = await fetch(`${HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Lấy token Lark thất bại (${j.code}): ${j.msg}`);
  _tokenCache = { tk: j.tenant_access_token, het: Date.now() + 100 * 60 * 1000 };
  return _tokenCache.tk;
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
/* Danh sách cột kèm kiểu — cần để tự nhận ra đâu là ô tick trong hai bảng
   checklist, thay vì khai cứng tên từng bước (đổi tên bước trong Lark là hỏng). */
async function dsCot(tk, base, tableId) {
  const j = await (await fetch(
    `${HOST}/open-apis/bitable/v1/apps/${base}/tables/${tableId}/fields?page_size=200`,
    { headers: { Authorization: `Bearer ${tk}` } })).json();
  if (j.code !== 0) throw new Error(`Đọc cột thất bại (${j.code}): ${j.msg}`);
  return j.data?.items || [];
}
async function docBang(tk, base, tableId) {
  const out = []; let page = '';
  for (let i = 0; i < 20; i++) {
    const u = new URL(`${HOST}/open-apis/bitable/v1/apps/${base}/tables/${tableId}/records`);
    u.searchParams.set('page_size', '500');
    if (page) u.searchParams.set('page_token', page);
    const j = await (await fetch(u, { headers: { Authorization: `Bearer ${tk}` } })).json();
    if (j.code !== 0) throw new Error(`Đọc bảng thất bại (${j.code}): ${j.msg}`);
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
/* Lọc mọi bản ghi xuống đúng danh sách trắng NGAY khi vừa đọc về, trước khi
   bất kỳ đoạn nào khác chạm vào. Cột ngoài danh sách coi như không tồn tại. */
const locTrang = (rows, cot = COT_DUOC_DOC) => rows.map(r => {
  const o = {};
  for (const c of cot) { const v = pick(r, c); if (v !== undefined) o[c] = v; }
  return o;
});
const timBang = (bangs, ...tens) => {
  for (const t of tens) { const b = bangs.find(x => norm(x.name) === norm(t)); if (b) return b; }
  for (const t of tens) { const b = bangs.find(x => norm(x.name).includes(norm(t))); if (b) return b; }
  return null;
};

/* Đọc một bảng checklist (onboard hoặc offboard).
   Các bước được nhận ra bằng KIỂU cột là "ô tick" (type 7), không khai cứng tên —
   thêm/đổi bước trong Lark là web tự cập nhật theo.

   Về riêng tư: vài bước có tên chứa chữ "lương"/"BHXH" (Lương bảng 41, Xử lý công
   lương, Báo giảm BHXH, Trả sổ và tờ rời BHXH). Đọc ở đây là đọc Ô TICK — tức
   "bước này đã làm xong chưa" — chứ không phải số tiền hay mã sổ. Không có giá
   trị lương nào chạm tới. */
async function docChecklist(tk, base, bang) {
  const cot = await dsCot(tk, base, bang.table_id);
  const buoc = cot.filter(f => f.type === 7).map(f => f.field_name);
  const cotTen = (cot.find(f => /thongtin|hoten|nhansu|nsnghi/.test(norm(f.field_name))) || cot[0] || {}).field_name;
  if (!cotTen || !buoc.length) return [];
  const rows = await docBang(tk, base, bang.table_id);
  return rows.map(r => {
    const xong = buoc.filter(b => pick(r, b) === true);
    return {
      raw: txt(pick(r, cotTen)),
      soXong: xong.length, tong: buoc.length,
      buoc: buoc.map(b => ({ ten: b, xong: pick(r, b) === true })),
      ngayNghi: isoNgay(ngay(pick(r, 'Ngày nghỉ việc'))),
    };
  }).filter(x => x.raw);
}
/* Ghép checklist với hồ sơ: ô tên trong checklist thường ghi cả mã lẫn tên,
   nên so khớp theo kiểu "chứa nhau" chứ không đòi bằng tuyệt đối. */
const ghepCL = (ds, ten, ma) => {
  const t = norm(ten), m = norm(ma);
  return ds.find(x => { const r = norm(x.raw); return t && (r === t || r.includes(t) || t.includes(r)); })
      || (m ? ds.find(x => norm(x.raw).includes(m)) : null) || null;
};

const laLeader = cv => /leader|truong|quanly|giamdoc|phogiamdoc|phophong/.test(norm(cv));
/* Trước đây dùng danh sách CHO PHÉP (phải khớp đúng từ mới tính đang làm việc) —
   rủi ro cao vì không biết chính xác Lark viết "Trạng thái" thế nào, và sai thì
   TOÀN BỘ công ty bị tính nhầm thành đã nghỉ (đã xảy ra: 93 người ra 0 đang làm).
   Đổi sang danh sách LOẠI TRỪ: mặc định coi là đang làm việc, trừ khi trạng thái
   nói rõ đã nghỉ/thôi việc, hoặc có ngày Offboarding. An toàn hơn nhiều. */
const daNghiTheoTT = tt => /nghiviec|danghi|thoiviec|chamdut|offboard|resign|terminat|sathai/.test(norm(tt));
const anhTu = v => (Array.isArray(v) && v[0] && typeof v[0] === 'object' && v[0].file_token) ? v[0].file_token : '';

/* Điểm có trọng số. Thiếu bất kỳ tiêu chí nào thì trả null — chấm nửa vời
   mà vẫn ra điểm thì con số đó đánh lừa người đọc. */
function diem(row, tieuChi, ts) {
  const v = tieuChi.map(t => num(pick(row, t)));
  if (v.some(x => x == null)) return null;
  return Math.round(v.reduce((a, x, i) => a + x * ts[i], 0) * 100) / 100;
}

module.exports = async (req, res) => {
  try {
    const q = req.query || {};

    /* ===== Ảnh nhân sự: /api/nhan-su?anh=<file_token> =====
       Nhánh này PHẢI tự bắt lỗi và trả đúng mã HTTP lỗi (4xx/5xx) — nếu để lỗi
       rơi xuống khối catch() chung ở cuối file, nó trả JSON kèm status 200. Với
       thẻ <img>, một phản hồi 200 dù nội dung không phải ảnh vẫn coi là "tải
       thành công" ở tầng HTTP nên onerror không chắc chắn được gọi — người dùng
       thấy icon ảnh vỡ mà không rơi về avatar chữ cái dự phòng. Đã gặp thật khi
       53 ảnh cùng lúc làm token bị giới hạn tốc độ. */
    if (q.anh) {
      try {
        const toi = await A.canhCong(req, res, 'xem_nhan_su');
        if (!toi) return;
        const ft = String(q.anh).replace(/[^A-Za-z0-9_-]/g, '');
        if (!ft) return res.status(400).end('token không hợp lệ');
        const tk = await larkToken();
        const r = await fetch(`${HOST}/open-apis/drive/v1/medias/${ft}/download`,
          { headers: { Authorization: `Bearer ${tk}` } });
        if (!r.ok) return res.status(404).end('không tải được ảnh');
        const buf = Buffer.from(await r.arrayBuffer());
        res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        return res.status(200).end(buf);
      } catch (err) {
        return res.status(502).end('lỗi tải ảnh: ' + String(err.message || err));
      }
    }

    /* ===== Khảo sát cấu trúc Base: /api/nhan-su?kham-pha=<app_token> =====
       Gộp vào đây thay vì để riêng một function, vì Vercel Hobby chỉ cho 12.
       Chỉ trả cấu trúc, tuyệt đối không đọc giá trị ô nào. */
    if (q['kham-pha']) {
      const toi = await A.canhCong(req, res, 'quan_tri');
      if (!toi) return;
      const base = String(q['kham-pha']).replace(/[^A-Za-z0-9]/g, '');
      const tk = await larkToken();
      const bangs = await dsBang(tk, base);
      const NC = /cccd|cmnd|cancuoc|dienthoai|sodt|diachi|ngaysinh|bhxh|luong|thunhap|nganhang|stk/;
      const KIEU = { 1:'Văn bản',2:'Số',3:'Lựa chọn',4:'Nhiều lựa chọn',5:'Ngày',7:'Ô tick',11:'Người',
        13:'Số điện thoại',15:'Liên kết',17:'Tệp đính kèm',18:'Liên kết bảng',19:'Tra cứu',20:'Công thức',
        21:'Liên kết 2 chiều',22:'Vị trí',1001:'Ngày tạo',1002:'Ngày sửa',1005:'Tự tăng' };
      const out = [];
      for (const b of bangs) {
        const j = await (await fetch(
          `${HOST}/open-apis/bitable/v1/apps/${base}/tables/${b.table_id}/fields?page_size=200`,
          { headers: { Authorization: `Bearer ${tk}` } })).json();
        out.push({ ten: b.name, id: b.table_id,
          cot: (j.data?.items || []).map(f => ({ ten: f.field_name, kieu: KIEU[f.type] || `#${f.type}`,
            nhayCam: NC.test(norm(f.field_name)) })) });
      }
      return res.status(200).json({ ok: true, base, bang: out });
    }

    /* ===== Trang chính ===== */
    const toi = await A.canhCong(req, res, 'xem_nhan_su');
    if (!toi) return;

    const BASE = process.env.LARK_APP_TOKEN_HR;
    if (!BASE) throw new Error('Thiếu biến môi trường LARK_APP_TOKEN_HR trên Vercel (token Base nhân sự).');

    const tk = await larkToken();
    const bangs = await dsBang(tk, BASE);
    const bNS = timBang(bangs, 'QUẢN LÝ THÔNG TIN NHÂN SỰ', 'thong tin nhan su');
    const bHD = timBang(bangs, 'THÔNG TIN HĐLĐ', 'hdld');
    const bDG = timBang(bangs, 'Đánh giá Nhân sự', 'danh gia nhan su', 'danh gia');
    const bDT = timBang(bangs, 'Đào tạo', 'dao tao');
    const bCO = timBang(bangs, 'Checklist Onboard Nhân sự', 'checklist onboard');
    const bCF = timBang(bangs, 'Checklist Offboard Nhân sự', 'checklist offboard');
    if (!bNS) throw new Error('Không tìm thấy bảng "QUẢN LÝ THÔNG TIN NHÂN SỰ" trong Base.');

    /* Quyền xem thông tin cá nhân. Không có thì bốn cột này bị loại ngay từ
       bước lọc — dữ liệu không rời khỏi máy chủ, gọi thẳng API cũng không thấy. */
    const coCaNhan = !!toi.quyen.xem_ca_nhan;
    const cotDoc = coCaNhan ? COT_DUOC_DOC : COT_DUOC_DOC.filter(c => !COT_CA_NHAN.includes(c));
    const recs = locTrang(await docBang(tk, BASE, bNS.table_id), cotDoc);
    const homNay = new Date();

    /* ---------- Hồ sơ nhân sự ---------- */
    const nhanSu = recs.map(r => {
      const on = ngay(pick(r, 'Onboarding date'));
      const off = ngay(pick(r, 'Offboarding date'));
      const cv = txt(pick(r, 'Chức vụ'));
      const tt = txt(pick(r, 'Trạng thái'));
      const conLam = !off && !daNghiTheoTT(tt);
      return {
        ma: txt(pick(r, 'Mã NV')),
        ten: txt(pick(r, 'Họ và tên')),
        gioiTinh: txt(pick(r, 'Giới tính')),
        trangThai: tt,
        chucVu: cv,
        boPhan: txt(pick(r, 'Phòng ban/Bộ phận')) || '(chưa phân)',
        doiNhom: txt(pick(r, 'Đội/Nhóm')),
        viTri: txt(pick(r, 'Vị trí Chuyên môn')),
        onboard: isoNgay(on),
        offboard: isoNgay(off),
        thangLam: soThangGiua(on, off || homNay),
        thamNien: txt(pick(r, 'Thâm niên')),
        loaiTuoi: txt(pick(r, 'Loại tuổi')),
        /* Bốn trường cá nhân — chỉ gán khi tài khoản có quyền xem_ca_nhan.
           Không có quyền thì thuộc tính không tồn tại, chứ không phải chuỗi rỗng. */
        ...(coCaNhan ? {
          sdt: txt(pick(r, 'Số điện thoại')),
          diaChi: txt(pick(r, 'Địa chỉ thường trú')),
          ngaySinh: isoNgay(ngay(pick(r, 'Ngày/tháng/năm/sinh'))),
          email: txt(pick(r, 'Email')),
        } : {}),
        anh: anhTu(pick(r, 'Hình ảnh')),
        coCheKPI: txt(pick(r, 'Cơ chế KPIs')),
        ghiChu: txt(pick(r, 'Ghi Chú')),
        laLeader: laLeader(cv),
        conLam,
      };
    }).filter(x => x.ten);

    /* Checklist onboard / offboard — gắn vào từng hồ sơ. Bảng thiếu cũng không sao. */
    const clOn  = bCO ? await docChecklist(tk, BASE, bCO) : [];
    const clOff = bCF ? await docChecklist(tk, BASE, bCF) : [];
    for (const x of nhanSu) {
      const a = ghepCL(clOn, x.ten, x.ma);
      const b = ghepCL(clOff, x.ten, x.ma);
      x.onbCL = a ? { soXong: a.soXong, tong: a.tong, buoc: a.buoc } : null;
      x.offCL = b ? { soXong: b.soXong, tong: b.tong, buoc: b.buoc } : null;
      /* Ngày nghỉ trong checklist là cột kiểu Ngày chuẩn, đáng tin hơn cột
         "Offboarding date" ở bảng chính đang là kiểu Văn bản — ưu tiên dùng. */
      if (b && b.ngayNghi && !x.offboard) x.offboard = b.ngayNghi;
    }

    const dangLamDS = nhanSu.filter(x => x.conLam);
    const daNghi = nhanSu.filter(x => !x.conLam);

    /* Trưởng bộ phận chỉ thấy team mình — chặn ở server, xoá hẳn khỏi phản hồi.
       Tài khoản có trường boPhan thì bị giới hạn; admin và người không đặt thì thấy hết. */
    const gioiHan = (!toi.quyen.quan_tri && toi.boPhan) ? norm(toi.boPhan) : '';
    const trongTam = x => !gioiHan || norm(x.boPhan) === gioiHan;

    /* ---------- Bộ phận ---------- */
    const mBP = new Map();
    for (const x of dangLamDS) {
      const k = x.boPhan;
      if (!mBP.has(k)) mBP.set(k, { ten: k, soNguoi: 0, nam: 0, nu: 0, leader: 0, tongThang: 0, coThang: 0 });
      const o = mBP.get(k);
      o.soNguoi++;
      if (/^nam$/.test(norm(x.gioiTinh))) o.nam++; else if (/^nu$/.test(norm(x.gioiTinh))) o.nu++;
      if (x.laLeader) o.leader++;
      if (x.thangLam != null) { o.tongThang += x.thangLam; o.coThang++; }
    }
    const boPhan = [...mBP.values()].map(o => ({ ...o,
      thangTB: o.coThang ? Math.round(o.tongThang / o.coThang) : null })).sort((a, b) => b.soNguoi - a.soNguoi);

    /* ---------- Thâm niên ---------- */
    const BAC = [
      { ten: 'Dưới 6 tháng', min: 0,  max: 6 },
      { ten: '6–12 tháng',   min: 6,  max: 12 },
      { ten: '1–2 năm',      min: 12, max: 24 },
      { ten: '2–3 năm',      min: 24, max: 36 },
      { ten: 'Trên 3 năm',   min: 36, max: 1e9 },
    ];
    const thamNien = BAC.map(b => ({ ten: b.ten,
      so: dangLamDS.filter(x => x.thangLam != null && x.thangLam >= b.min && x.thangLam < b.max).length }));

    /* ---------- Biến động vào / ra ---------- */
    const mBD = new Map();
    const ghiBD = (iso, loai) => {
      if (!iso) return;
      const k = iso.slice(0, 7);
      if (!mBD.has(k)) mBD.set(k, { thang: k, vao: 0, ra: 0 });
      mBD.get(k)[loai]++;
    };
    for (const x of nhanSu) { ghiBD(x.onboard, 'vao'); ghiBD(x.offboard, 'ra'); }
    const bienDong = [...mBD.values()].sort((a, b) => a.thang.localeCompare(b.thang)).slice(-24);

    /* Năm theo lịch VN, không theo UTC: mở trang lúc 0–7h sáng ngày 1/1 thì giờ
       UTC vẫn đang là 31/12 năm cũ, đếm "vào/ra năm nay" sẽ ra năm trước. */
    const nam = Number(isoNgay(homNay).slice(0, 4));
    const raNamNay = daNghi.filter(x => x.offboard && x.offboard.startsWith(String(nam))).length;
    const vaoNamNay = nhanSu.filter(x => x.onboard && x.onboard.startsWith(String(nam))).length;
    const tyLeNghi = dangLamDS.length ? Math.round(raNamNay / (dangLamDS.length + raNamNay) * 1000) / 10 : 0;

    /* Nghỉ sớm: vào chưa đủ 6 tháng đã đi — dấu hiệu tuyển sai hoặc onboarding hỏng */
    const nghiSom = daNghi.filter(x => x.thangLam != null && x.thangLam < 6).length;
    const tyLeNghiSom = daNghi.length ? Math.round(nghiSom / daNghi.length * 1000) / 10 : 0;

    /* ---------- Hợp đồng sắp hết hạn ---------- */
    let hopDong = [];
    if (bHD) {
      const rHD = await docBang(tk, BASE, bHD.table_id);
      hopDong = rHD.map(r => {
        const het = ngay(pick(r, 'Ngày hết hạn'));
        const con = het ? soNgayLich(het) - soNgayLich(homNay) : null;
        return {
          ma: txt(pick(r, 'Mã NV')), ten: txt(pick(r, 'Họ và tên')),
          boPhan: txt(pick(r, 'Bộ phận/Phòng ban')) || '(chưa phân)',
          viTri: txt(pick(r, 'Vị trí')), loai: txt(pick(r, 'Loại HĐ hiện tại')),
          hetHan: isoNgay(het), conLai: con,
          trangThai: txt(pick(r, 'Trạng thái')),
        };
      }).filter(x => x.ten && x.conLai != null && x.conLai <= 90 && !daNghiTheoTT(x.trangThai))
        .sort((a, b) => a.conLai - b.conLai);
    }

    /* ---------- Đánh giá Skill-Will ---------- */
    const danhGia = { coBang: !!bDG, dsKy: [], ky: '', nguoi: [], oThongKe: [], chuaCham: [], tieuChiS: TIEU_CHI_S, tieuChiW: TIEU_CHI_W, trongSo: { S: TS_S, W: TS_W }, nguong: NGUONG };
    if (bDG) {
      const rDG = await docBang(tk, BASE, bDG.table_id);
      const dg = rDG.map(r => {
        const ten = txt(pick(r, 'Họ và tên'));
        const ho = nhanSu.find(x => norm(x.ten) === norm(ten))
                || nhanSu.find(x => x.ma && norm(x.ma) === norm(txt(pick(r, 'Mã NV'))));
        const ld = ho ? ho.laLeader : laLeader(txt(pick(r, 'Vị trí Chuyên môn')));
        const s = diem(r, TIEU_CHI_S, ld ? TS_S.ld : TS_S.nv);
        const w = diem(r, TIEU_CHI_W, TS_W);
        return {
          ma: ho ? ho.ma : txt(pick(r, 'Mã NV')),
          ten: ten || (ho ? ho.ten : ''),
          boPhan: (ho ? ho.boPhan : txt(pick(r, 'Phòng ban'))) || '(chưa phân)',
          viTri: ho ? ho.viTri : txt(pick(r, 'Vị trí Chuyên môn')),
          anh: ho ? ho.anh : '',
          laLeader: ld,
          ky: txt(pick(r, 'Kỳ đánh giá')),
          ngay: isoNgay(ngay(pick(r, 'Ngày review'))),
          nguoiCham: txt(pick(r, 'Người chấm')),
          diemS: s, diemW: w,
          o: (s != null && w != null) ? oCua(s, w) : null,
          satVach: (s != null && w != null) ? satVach(s, w) : false,
          thoS: TIEU_CHI_S.map(t => num(pick(r, t))),
          thoW: TIEU_CHI_W.map(t => num(pick(r, t))),
          manh: txt(pick(r, 'Điểm mạnh')),
          caiThien: txt(pick(r, 'Cần cải thiện')),
          muon: txt(pick(r, 'Điều nhân sự muốn')),
          camKet: txt(pick(r, 'Cam kết kỳ tới')),
          daNgoi: pick(r, 'Đã ngồi review cùng NS') === true,
        };
      }).filter(x => x.ten);

      danhGia.dsKy = [...new Set(dg.map(x => x.ky).filter(Boolean))].sort().reverse();
      danhGia.ky = txt(q.ky) || danhGia.dsKy[0] || '';
      const trongKy = dg.filter(x => !danhGia.ky || x.ky === danhGia.ky);
      danhGia.tatCa = dg.filter(trongTam);
      danhGia.nguoi = trongKy.filter(trongTam).filter(x => x.o);
      danhGia.oThongKe = [1, 2, 3, 4].map(k => ({ ...O[k],
        so: danhGia.nguoi.filter(x => x.o === k).length }));
      const daCham = new Set(trongKy.map(x => norm(x.ten)));
      danhGia.chuaCham = dangLamDS.filter(trongTam).filter(x => !daCham.has(norm(x.ten)))
        .map(x => ({ ma: x.ma, ten: x.ten, boPhan: x.boPhan, viTri: x.viTri, laLeader: x.laLeader }));
      danhGia.chuaNgoi = danhGia.nguoi.filter(x => !x.daNgoi).length;
      danhGia.satVach = danhGia.nguoi.filter(x => x.satVach).length;
      danhGia.bien = BIEN;

      /* Bảng có dòng mà không ai chấm đủ 10 tiêu chí → gần như chắc chắn do tên
         cột trong Lark khác tên code đang tìm. Liệt kê tên cột THẬT ra để đối
         chiếu, thay vì chỉ báo "chưa có ai chấm" rồi để tự đoán. */
      if (rDG.length && !danhGia.nguoi.length) {
        const cot = (await dsCot(tk, BASE, bDG.table_id)).map(f => f.field_name);
        const thieu = [...TIEU_CHI_S, ...TIEU_CHI_W, 'Kỳ đánh giá', 'Họ và tên']
          .filter(c => !cot.some(k => norm(k) === norm(c)));
        danhGia.cotThat = cot;
        danhGia.cotThieu = thieu;
      }
    }

    /* ---------- Đào tạo ---------- */
    const daoTao = { coBang: !!bDT, khoa: [], theoNguoi: [] };
    if (bDT) {
      const rDT = await docBang(tk, BASE, bDT.table_id);
      daoTao.khoa = rDT.map(r => ({
        ten: txt(pick(r, 'Họ và tên')), ma: txt(pick(r, 'Mã NV')),
        khoa: txt(pick(r, 'Tên khoá', 'Tên khóa')), loai: txt(pick(r, 'Loại')),
        batDau: isoNgay(ngay(pick(r, 'Ngày bắt đầu'))),
        hoanThanh: isoNgay(ngay(pick(r, 'Ngày hoàn thành'))),
        trangThai: txt(pick(r, 'Trạng thái')),
        apDung: txt(pick(r, 'Đã áp dụng được gì')),
      })).filter(x => x.khoa && x.ten);
      const m = new Map();
      for (const k of daoTao.khoa) {
        const n = norm(k.ten);
        if (!m.has(n)) m.set(n, { ten: k.ten, tong: 0, xong: 0, boDo: 0, apDung: 0 });
        const o = m.get(n); o.tong++;
        if (/hoanthanh/.test(norm(k.trangThai))) o.xong++;
        if (/bodo/.test(norm(k.trangThai))) o.boDo++;
        if (k.apDung) o.apDung++;
      }
      daoTao.theoNguoi = [...m.values()].sort((a, b) => b.xong - a.xong);
    }

    /* ---------- Cảnh báo ---------- */
    const canhBao = [];
    if (!bDG) canhBao.push({ muc: 'luu-y', tieuDe: 'Chưa có bảng "Đánh giá Nhân sự" trong Base',
      noiDung: 'Tạo bảng theo đúng tên cột đã thống nhất là phần ma trận Skill-Will hiện ra ngay, không cần chỉnh code.' });

    /* Bảng đã có, đã chấm, nhưng web không đọc ra điểm nào — chỉ đích danh cột
       cần sửa thay vì để mò. Tên cột so khớp bỏ dấu, bỏ khoảng trắng và dấu
       chấm, nên "S1.KẾT QUẢ" và "S1 Kết quả" là một; chỉ khác chữ mới lệch. */
    if (danhGia.cotThieu && danhGia.cotThieu.length)
      canhBao.push({ muc: 'canh-bao',
        tieuDe: `Bảng Đánh giá có dữ liệu nhưng web chưa đọc được — thiếu ${danhGia.cotThieu.length} cột`,
        noiDung: `Cần có cột: ${danhGia.cotThieu.join(' · ')}. `
          + `Cột đang có trong bảng: ${danhGia.cotThat.slice(0, 14).join(' · ')}`
          + (danhGia.cotThat.length > 14 ? '…' : '') + '.' });
    else if (danhGia.cotThat)
      canhBao.push({ muc: 'canh-bao',
        tieuDe: 'Bảng Đánh giá đủ cột nhưng chưa dòng nào chấm đủ 10 tiêu chí',
        noiDung: 'Thiếu một tiêu chí là cả dòng không ra điểm — cố ý để vậy, vì chấm nửa vời '
          + 'mà vẫn ra điểm thì con số đó đánh lừa người đọc. Soát lại xem có ô nào bỏ trống không.' });
    if (!bDT) canhBao.push({ muc: 'luu-y', tieuDe: 'Chưa có bảng "Đào tạo" trong Base',
      noiDung: 'Không có bảng này thì tiêu chí W3 Học hỏi chỉ dựa vào cảm nhận của người chấm, không có gì đối chiếu.' });

    const thieuOnboard = nhanSu.filter(x => !x.onboard).length;
    if (thieuOnboard) canhBao.push({ muc: 'luu-y', tieuDe: `${thieuOnboard} người thiếu ngày onboard`,
      noiDung: 'Không có ngày vào thì không tính được thâm niên, và những người này biến mất khỏi biểu đồ gắn bó.' });

    const offLaChu = recs.some(r => { const v = pick(r, 'Offboarding date'); return v && typeof v !== 'number' && !(typeof v === 'object' && typeof v.value === 'number'); });
    if (offLaChu) canhBao.push({ muc: 'canh-bao', tieuDe: 'Cột "Offboarding date" đang là kiểu Văn bản',
      noiDung: 'Web đang phải đoán định dạng ngày từ chuỗi chữ. Đổi sang kiểu Ngày trong Lark thì số liệu nghỉ việc mới chắc chắn đúng.' });

    /* Tự soát: nếu số người "đang làm việc" ra 0 hoặc bất thường thấp so với tổng,
       liệt kê nguyên văn các giá trị cột Trạng thái đang gặp — để thấy ngay wording
       thật của Lark thay vì đoán mò từ xa. */
    if (recs.length && dangLamDS.length < recs.length * 0.3) {
      const dem = new Map();
      for (const r of recs) {
        const v = txt(pick(r, 'Trạng thái')) || '(để trống)';
        dem.set(v, (dem.get(v) || 0) + 1);
      }
      const ds = [...dem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([v, n]) => `"${v}" × ${n}`).join(' · ');
      canhBao.push({ muc: 'canh-bao',
        tieuDe: `Chỉ ${dangLamDS.length}/${recs.length} người được tính là đang làm việc — có thể sai`,
        noiDung: `Các giá trị cột Trạng thái đang gặp: ${ds}. Nếu con số này thấp bất thường so với thực tế, `
          + `báo lại nguyên văn cách viết đúng để chỉnh danh sách từ khoá nhận diện "đã nghỉ" trong code.` });
    }

    if (hopDong.filter(x => x.conLai <= 30).length)
      canhBao.push({ muc: 'canh-bao', tieuDe: `${hopDong.filter(x => x.conLai <= 30).length} hợp đồng hết hạn trong 30 ngày`,
        noiDung: 'Quá hạn mà chưa ký lại là rủi ro pháp lý, và nhân sự cũng thấy mình bị bỏ quên.' });

    if (bDG && danhGia.chuaCham.length) {
      const ld = danhGia.chuaCham.filter(x => x.laLeader);
      canhBao.push({ muc: ld.length ? 'canh-bao' : 'luu-y',
        tieuDe: `${danhGia.chuaCham.length} người chưa chấm kỳ ${danhGia.ky}`,
        noiDung: ld.length
          ? `Trong đó có ${ld.length} vị trí quản lý (${ld.slice(0, 3).map(x => x.ten).join(', ')}${ld.length > 3 ? '…' : ''}). Nên chấm nhóm này trước — họ là người sẽ đi chấm người khác.`
          : 'Chấm thiếu thì tỷ lệ bốn ô không phản ánh đúng cả đội.' });
    }

    if (bDG && danhGia.satVach && danhGia.nguoi.length)
      canhBao.push({ muc: 'luu-y',
        tieuDe: `${danhGia.satVach}/${danhGia.nguoi.length} người nằm sát vạch phân loại`,
        noiDung: `Điểm của họ lệch mốc ${NGUONG} chưa tới ${BIEN}, nghĩa là chấm lệch một điểm ở một tiêu chí là đổi ô. `
          + 'Đừng ra quyết định nhân sự dựa vào ô của nhóm này — hãy đọc phần ghi chép buổi review của họ.' });

    /* Onboarding bỏ dở: người vào rồi mà quy trình tiếp nhận chưa xong. Đây là
       thứ hay rơi rụng nhất và cũng là nguyên nhân quen thuộc của nghỉ sớm. */
    const onDoDang = dangLamDS.filter(x => x.onbCL && x.onbCL.soXong < x.onbCL.tong);
    if (onDoDang.length)
      canhBao.push({ muc: 'luu-y', tieuDe: `${onDoDang.length} người chưa hoàn tất onboarding`,
        noiDung: `${onDoDang.slice(0, 4).map(x => x.ten).join(', ')}${onDoDang.length > 4 ? '…' : ''}. `
          + 'Onboarding bỏ dở thường không ai nhắc, nhưng lại là lý do quen thuộc khiến người mới nghỉ sớm.' });

    const offDoDang = daNghi.filter(x => x.offCL && x.offCL.soXong < x.offCL.tong);
    if (offDoDang.length)
      canhBao.push({ muc: 'canh-bao', tieuDe: `${offDoDang.length} hồ sơ nghỉ việc chưa chốt xong`,
        noiDung: `${offDoDang.slice(0, 4).map(x => x.ten).join(', ')}${offDoDang.length > 4 ? '…' : ''}. `
          + 'Còn bước dang dở như thu hồi thiết bị, khoá tài khoản, báo giảm BHXH hay trả sổ — '
          + 'để lâu vừa rủi ro vừa phiền cho chính người đã nghỉ.' });

    if (tyLeNghiSom >= 25 && daNghi.length >= 8)
      canhBao.push({ muc: 'canh-bao', tieuDe: `${tyLeNghiSom}% người đã nghỉ ra đi trước mốc 6 tháng`,
        noiDung: `${nghiSom}/${daNghi.length} trường hợp. Nghỉ sớm thường không phải lỗi của người mới — mà là tuyển sai kỳ vọng hoặc onboarding bỏ mặc.` });

    res.status(200).json({
      ok: true,
      toi: { email: toi.email, ten: toi.ten, quyen: toi.quyen, boPhan: toi.boPhan || '' },
      capNhat: new Date().toISOString(),
      data: {
        nhanSu: nhanSu.filter(trongTam),
        tong: {
          dangLam: dangLamDS.filter(trongTam).length,
          daNghi: daNghi.filter(trongTam).length,
          boPhan: boPhan.filter(trongTam).length,
          leader: dangLamDS.filter(trongTam).filter(x => x.laLeader).length,
          nam: dangLamDS.filter(trongTam).filter(x => /^nam$/.test(norm(x.gioiTinh))).length,
          nu: dangLamDS.filter(trongTam).filter(x => /^nu$/.test(norm(x.gioiTinh))).length,
          vaoNamNay, raNamNay, tyLeNghi, nghiSom, tyLeNghiSom, nam_: nam,
        },
        boPhan: boPhan.filter(trongTam), thamNien, bienDong,
        hopDong: hopDong.filter(trongTam),
        danhGia, daoTao, canhBao, gioiHan: gioiHan ? toi.boPhan : '',
        coCL: { onboard: !!bCO, offboard: !!bCF }, coCaNhan,
      },
    });
  } catch (err) {
    res.status(200).json({ ok: false, error: String(err.message || err) });
  }
};

/* Vì sao ngưỡng cố định 5,5 chứ không phải trung vị:
   trung vị luôn cho đúng 50% mỗi bên, kỳ nào cũng vậy. Cả đội cùng tiến bộ thì
   biểu đồ vẫn 50/50 — không nhìn ra được gì. Ngưỡng cố định mới so sánh được
   giữa các quý, đó mới là thứ đáng xem. */
