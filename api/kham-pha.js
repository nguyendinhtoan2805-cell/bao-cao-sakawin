/* =====================================================================
   /api/kham-pha — Khảo sát cấu trúc một Base bất kỳ
   Dùng khi cần thiết kế trang mới cho một Base chưa từng đọc.

   CHỈ TRẢ VỀ CẤU TRÚC: tên bảng, tên cột, kiểu dữ liệu, số bản ghi.
   KHÔNG đọc và KHÔNG trả về giá trị của bất kỳ ô nào — nhờ vậy dùng được
   cả với Base chứa CCCD, lương, thông tin cá nhân mà không sợ lộ.

   Chỉ quản trị viên gọi được.
     /api/kham-pha?base=<app_token>              → liệt kê bảng + cột
     /api/kham-pha?base=<app_token>&table=<id>   → chỉ một bảng
===================================================================== */
const A = require('./_auth.js');
const HOST = (process.env.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');

const KIEU = {
  1:'Văn bản', 2:'Số', 3:'Lựa chọn', 4:'Nhiều lựa chọn', 5:'Ngày', 7:'Ô tick',
  11:'Người', 13:'Số điện thoại', 15:'Liên kết', 17:'Tệp đính kèm', 18:'Liên kết bảng',
  19:'Tra cứu', 20:'Công thức', 21:'Liên kết 2 chiều', 22:'Vị trí', 23:'Nhóm chat',
  1001:'Ngày tạo', 1002:'Ngày sửa', 1003:'Người tạo', 1004:'Người sửa', 1005:'Tự tăng',
};
/* Cột nào nhìn tên là biết nhạy cảm — đánh dấu để nhắc khi thiết kế */
const NHAY_CAM = /cccd|cmnd|cancuoc|chungminh|dienthoai|sodt|diachi|ngaysinh|bhxh|luong|thunhap|taikhoan|nganhang|stk/;
const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]/g,'');

async function token() {
  const r = await fetch(`${HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method:'POST', headers:{'Content-Type':'application/json; charset=utf-8'},
    body: JSON.stringify({app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET}),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Lấy token thất bại (${j.code}): ${j.msg}`);
  return j.tenant_access_token;
}
const goi = async (tk, duong) => {
  const r = await fetch(`${HOST}${duong}`, { headers:{ Authorization:`Bearer ${tk}` } });
  return r.json();
};
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

module.exports = async (req, res) => {
  try {
    const toi = await A.canhCong(req, res, 'quan_tri');
    if (!toi) return;

    const base = String((req.query && req.query.base) || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!base) throw new Error('Thiếu tham số ?base=<app_token>. Lấy đoạn sau /wiki/ hoặc /base/ trong URL của Base.');

    const tk = await token();
    const ds = await goi(tk, `/open-apis/bitable/v1/apps/${base}/tables?page_size=100`);
    if (ds.code !== 0) throw new Error(`Không đọc được danh sách bảng (code ${ds.code}): ${ds.msg}. `
      + `Kiểm tra: đã thêm Lark App vào Base này chưa (Base → ⋯ → Add document application)?`);

    const chiMot = String((req.query && req.query.table) || '');
    const bang = (ds.data.items || []).filter(t => !chiMot || t.table_id === chiMot);

    const phan = [];
    for (const t of bang) {
      const f = await goi(tk, `/open-apis/bitable/v1/apps/${base}/tables/${t.table_id}/fields?page_size=200`);
      const r = await goi(tk, `/open-apis/bitable/v1/apps/${base}/tables/${t.table_id}/records?page_size=1`);
      phan.push({
        ten: t.name, id: t.table_id,
        soBanGhi: (r.data && r.data.total != null) ? r.data.total : '?',
        cot: (f.data && f.data.items || []).map(x => ({
          ten: x.field_name, kieu: KIEU[x.type] || ('type ' + x.type),
          nhayCam: NHAY_CAM.test(norm(x.field_name)),
        })),
      });
    }

    const html = `<!doctype html><meta charset="utf-8"><title>Khảo sát Base</title>
<style>
 body{font-family:'Be Vietnam Pro',system-ui,sans-serif;background:#FAFAF9;color:#1C1917;padding:26px 30px;line-height:1.5}
 h1{font-size:22px;border-bottom:3px solid #C8102E;padding-bottom:12px}
 h1 span{color:#C8102E}
 .meta{color:#78716C;font-size:13px;margin:10px 0 24px}
 .b{background:#fff;border:1px solid #E7E5E4;border-radius:12px;padding:16px 18px;margin-bottom:16px;
    box-shadow:0 1px 2px rgba(0,0,0,.04)}
 .b h2{font-size:15px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
 .id{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;background:#F5F5F4;color:#78716C;
     padding:3px 8px;border-radius:5px;user-select:all}
 .n{font-size:12px;color:#78716C;font-weight:600}
 table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
 th{text-align:left;background:#C8102E;color:#fff;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
 td{padding:8px 10px;border-bottom:1px solid #F0EEEC}
 tr.s td{background:#FFF4F4}
 .tag{font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:4px;background:#FEE2E2;color:#991B1B}
 .ok{color:#1A7F4B;font-weight:700}
 .note{background:#FFFBEB;border:1px solid #FDE8B8;border-radius:10px;padding:13px 16px;font-size:13px;margin-bottom:20px}
</style>
<h1>Khảo sát Base <span>${esc(base)}</span></h1>
<div class="meta">${phan.length} bảng · chỉ đọc cấu trúc, <b>không đọc giá trị ô nào</b></div>
<div class="note">🔒 Trang này cố ý <b>không hiển thị dữ liệu</b> — chỉ tên bảng, tên cột và kiểu.
Cột được đánh dấu <span class="tag">NHẠY CẢM</span> là gợi ý để cân nhắc <b>không đưa lên web</b>.</div>
${phan.map(b => `<div class="b">
  <h2>📋 ${esc(b.ten)} <span class="id">${esc(b.id)}</span> <span class="n">${b.soBanGhi} bản ghi · ${b.cot.length} cột</span></h2>
  <table><tr><th style="width:40px">#</th><th>Tên cột</th><th style="width:150px">Kiểu</th><th style="width:110px"></th></tr>
  ${b.cot.map((c,i)=>`<tr class="${c.nhayCam?'s':''}"><td>${i+1}</td><td>${esc(c.ten)}</td><td>${esc(c.kieu)}</td>
    <td>${c.nhayCam?'<span class="tag">NHẠY CẢM</span>':'<span class="ok">·</span>'}</td></tr>`).join('')}
  </table></div>`).join('')}`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).end(html);
  } catch (err) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).end(`<!doctype html><meta charset="utf-8">
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:12vh auto;padding:0 24px;line-height:1.7}
h1{font-size:19px;color:#C8102E}pre{background:#FAFAF9;border:1px solid #E7E5E4;border-radius:8px;padding:14px;white-space:pre-wrap}</style>
<h1>Không khảo sát được</h1><pre>${esc(err.message||err)}</pre>`);
  }
};
