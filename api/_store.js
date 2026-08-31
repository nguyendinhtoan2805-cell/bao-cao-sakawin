/* =====================================================================
   Kho lưu tài khoản & phân quyền — Upstash Redis qua REST (không cần cài gói).

   Vercel → Storage → Upstash for Redis sẽ tự khai 2 biến:
     KV_REST_API_URL  /  KV_REST_API_TOKEN
   (bản cũ tên UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — đỡ cả hai)

   CỐ Ý KHÔNG lưu ở Lark Base: trang quản trị cần quyền ghi, mà quyền ghi của
   Lark App là ghi được cả Base — trong đó có bảng lương. Lark App giữ CHỈ ĐỌC.
===================================================================== */
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const KEY = 'sakawin:users';

const coKho = () => !!(URL_ && TOKEN);

async function cmd(...args) {
  if (!coKho()) throw new Error('Chưa kết nối kho lưu tài khoản (thiếu KV_REST_API_URL / KV_REST_API_TOKEN trên Vercel).');
  const r = await fetch(URL_.replace(/\/$/, ''), {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  if (j.error) throw new Error('Kho lưu trữ báo lỗi: ' + j.error);
  return j.result;
}

async function docDanhSach() {
  if (!coKho()) return [];
  const raw = await cmd('GET', KEY);
  if (!raw) return [];
  try { const d = JSON.parse(raw); return Array.isArray(d) ? d : []; }
  catch { return []; }
}

async function ghiDanhSach(list) {
  await cmd('SET', KEY, JSON.stringify(list));
  return list;
}

module.exports = { coKho, docDanhSach, ghiDanhSach };
