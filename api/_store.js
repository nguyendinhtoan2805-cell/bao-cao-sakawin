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
const banDoc = new WeakMap();

const coKho = () => !!(URL_ && TOKEN);

async function cmd(...args) {
  if (!coKho()) throw new Error('Chưa kết nối kho lưu tài khoản (thiếu KV_REST_API_URL / KV_REST_API_TOKEN trên Vercel).');
  const r = await fetch(URL_.replace(/\/$/, ''), {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Không truy cập được kho lưu tài khoản.');
  if (j.error) throw new Error('Kho lưu trữ báo lỗi: ' + j.error);
  return j.result;
}

async function docDanhSach() {
  if (!coKho()) return [];
  const raw = await cmd('GET', KEY);
  const list = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error('Dữ liệu tài khoản không hợp lệ; đã dừng để tránh ghi đè.');
  banDoc.set(list, raw);
  return list;
}

// So sánh và ghi trong cùng một lệnh Redis: bản đọc cũ không được khôi phục
// quyền vừa thu hồi (kể cả khi đăng nhập hoặc đổi mật khẩu đang lưu đồng thời).
async function ghiDanhSach(list, goc = list) {
  if (!Array.isArray(list) || !banDoc.has(goc)) throw new Error('Cần đọc lại danh sách tài khoản trước khi lưu.');
  const cu = banDoc.get(goc), moi = JSON.stringify(list);
  const daGhi = await cmd('EVAL', `
    local current = redis.call('GET', KEYS[1])
    if ARGV[1] == '0' then
      if current then return 0 end
    elseif current ~= ARGV[2] then return 0 end
    redis.call('SET', KEYS[1], ARGV[3])
    return 1
  `, 1, KEY, cu === null ? '0' : '1', cu === null ? '' : cu, moi);
  if (daGhi !== 1) {
    const err = new Error('Danh sách tài khoản đã thay đổi. Vui lòng tải lại và thực hiện lại thao tác.');
    err.statusCode = 409;
    throw err;
  }
  banDoc.set(list, moi);
  return list;
}

module.exports = { coKho, docDanhSach, ghiDanhSach };
