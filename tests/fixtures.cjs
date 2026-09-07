'use strict';
// Fixtures offline: no environment loading or external network access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const clone = x => JSON.parse(JSON.stringify(x));
const ENV = { SESSION_SECRET: 'fixture-only-secret', LARK_APP_ID: 'fake', LARK_APP_SECRET: 'fake',
  LARK_APP_TOKEN_HR: 'fakeHR', LARK_APP_TOKEN: 'fakeBusiness', LARK_TABLE_SALARY: 'salary',
  KV_REST_API_URL: 'https://fake.invalid', KV_REST_API_TOKEN: 'fake' };

function load(file, deps = {}, extra = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), {
    module, exports: module.exports, Buffer, URL, process: { env: ENV },
    require: k => { if (Object.hasOwn(deps, k)) return deps[k]; if (k === 'crypto') return crypto; throw Error('Unexpected require: ' + k); },
    fetch: () => { throw Error('Network forbidden in tests'); }, ...extra,
  }, { filename: file });
  return module.exports;
}
const AUTH = load('api/_auth.js', { './_store.js': {} });
const user = (boPhan = 'Team A', grants = {}) => ({ email: 'fixture.user', ten: 'Fixture', kichHoat: true,
  boPhan, quyen: { ...AUTH.quyenRong(), xem_nhan_su: true, xem_tuyen_dung: true, ...grants } });
const guard = u => ({ ...AUTH, canhCong: async (req, res, key) => {
  if (!u) { res.status(401).json({ ok: false }); return null; }
  if (!u.quyen[key]) { res.status(403).json({ ok: false }); return null; }
  return u;
} });
async function call(handler, req = {}) {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.code = n; return this; }, json(x) { this.body = clone(x); return this; },
    end(x) { this.body = x; return this; } };
  await handler({ method: 'GET', query: {}, headers: {}, ...req }, res);
  return res;
}

function redis(raw = null) {
  const commands = [];
  // Mô phỏng giao thức CAS; triển khai Lua thực được kiểm riêng khi có Redis thử nghiệm.
  const fetch = async (url, opts) => {
    const a = JSON.parse(opts.body); commands.push(a);
    let result;
    if (a[0] === 'GET') result = raw;
    else if (a[0] === 'EVAL') {
      assert.equal(a[2], 1); assert.equal(a[3], 'sakawin:users');
      result = (a[4] === '0' ? raw === null : raw === a[5]) ? 1 : 0;
      if (result) raw = a[6];
    } else throw Error('Unconditional write forbidden');
    return { ok: true, json: async () => ({ result }) };
  };
  return { store: load('api/_store.js', {}, { fetch }), commands, value: () => JSON.parse(raw), raw: () => raw };
}

const y = new Date().getFullYear();
const row = (record_id, fields) => ({ record_id, fields });
function fixtures() {
  const employee = (ma, ten, bp, more = {}) => row(ma, { 'Mã NV': ma, 'Họ và tên': ten, 'Phòng ban/Bộ phận': bp,
    'Onboarding date': `${y}-01-01`, 'Hình ảnh': [{ file_token: 'photo' + ma }], 'Số điện thoại': 'FAKE_PRIVATE_PHONE', ...more });
  const related = (id, ma, ten, more = {}) => row(id, { 'Mã NV': ma, 'Họ và tên': ten, ...more });
  const criteria = Object.fromEntries(['S1 Kết quả', 'S2 Chuyên môn', 'S3 Tốc độ', 'S4 Tự xử lý', 'S5 Đào tạo',
    'W1 Chủ động', 'W2 Áp lực', 'W3 Học hỏi', 'W4 Gắn bó', 'W5 Team'].map(k => [k, 6]));
  return {
    ns: { name: 'QUẢN LÝ THÔNG TIN NHÂN SỰ', rows: [employee('A1', 'An', 'Team A'), employee('A2', 'Trùng Tên', 'Team A'),
      employee('B1', 'SECRET_B', 'Team B', { 'Offboarding date': `${y}-02-01`, 'Ghi Chú': 'SECRET_NOTE' }),
      employee('B2', 'Trùng Tên', 'Team B', { 'Onboarding date': '' })] },
    hd: { name: 'THÔNG TIN HĐLĐ', rows: [related('hA', 'A1', 'An', { 'Ngày hết hạn': Date.now() }),
      related('hB', 'B1', 'SECRET_B', { 'Ngày hết hạn': Date.now() })] },
    dg: { name: 'Đánh giá Nhân sự', rows: [related('dA', 'A1', 'An', { ...criteria, 'Kỳ đánh giá': 'Q1', 'Điểm mạnh': 'ALLOWED_REVIEW' }),
      related('dB', 'B1', 'SECRET_B', { ...criteria, 'Kỳ đánh giá': 'SECRET_PERIOD', 'Điểm mạnh': 'SECRET_REVIEW' }),
      related('dDup', '', 'Trùng Tên', { ...criteria, 'Kỳ đánh giá': 'AMBIGUOUS_PERIOD' })] },
    dt: { name: 'Đào tạo', rows: [related('tA', 'A1', 'An', { 'Tên khoá': 'ALLOWED_COURSE' }),
      related('tB', 'B1', 'SECRET_B', { 'Tên khoá': 'SECRET_COURSE' }),
      related('tDup', '', 'Trùng Tên', { 'Tên khoá': 'AMBIGUOUS_COURSE' }),
      related('tBad', 'UNKNOWN', 'An', { 'Tên khoá': 'UNKNOWN_CODE_COURSE' }),
      related('tMismatch', 'A1', 'SECRET_B', { 'Tên khoá': 'MISMATCH_COURSE' })] },
    co: { name: 'Checklist Onboard Nhân sự', fields: [{ field_name: 'Thông tin', type: 1 }, { field_name: 'Bàn giao', type: 7 }],
      rows: [row('cB', { 'Thông tin': 'B2 - Trùng Tên', 'Bàn giao': true }), row('cA', { 'Thông tin': 'A1 - An', 'Bàn giao': false })] },
    uv: { name: 'ỨNG VIÊN', rows: ['A', 'B'].map(bp => row('rec' + bp, { 'Họ và tên': bp === 'A' ? 'Applicant A' : 'SECRET_APPLICANT',
      'Bộ phận': 'Team ' + bp, 'Vị trí ứng tuyển': 'Designer', 'Trạng thái': 'Đạt vòng CV', 'File CV': [{ file_token: 'cv' + bp }],
      'Ảnh': [{ file_token: 'appPhoto' + bp }], 'Biên bản phỏng vấn': bp === 'A' ? 'ALLOWED_NOTES' : 'SECRET_NOTES' })) },
    jd: { name: 'JD VỊ TRÍ NHÂN SỰ', rows: ['A', 'B'].map(bp => row('jd' + bp, { 'Vị trí': 'Designer', 'Bộ phận': 'Team ' + bp,
      'Mức lương từ': bp === 'A' ? 100 : 900, 'Yêu cầu bắt buộc': bp === 'A' ? 'ALLOWED_REQUIREMENT' : 'SECRET_REQUIREMENT' })) },
    kh: { name: 'KẾ HOẠCH TUYỂN DỤNG', rows: ['A', 'B'].map(bp => row('kh' + bp, { 'Vị trí tuyển dụng': 'Designer', 'Phòng ban/Nhóm': 'Team ' + bp })) },
    salary: { name: 'Salary fixture', rows: [row('salA', { 'Ảnh': [{ file_token: 'salaryPhoto' }] })] },
  };
}
function lark(data = fixtures()) {
  const calls = [];
  const fetch = async (input, opts = {}) => {
    const u = new URL(String(input)), method = opts.method || 'GET'; calls.push({ url: u.pathname, method, body: opts.body });
    let result;
    if (u.pathname.includes('/auth/v3/')) result = { code: 0, tenant_access_token: 'fixtureToken' };
    else if (u.pathname.includes('/medias/')) return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => Buffer.from('FAKE_FILE') };
    else {
      const match = u.pathname.match(/\/tables(?:\/([^/]+))?(?:\/(records|fields)(?:\/([^/]+))?)?$/);
      assert.ok(match, 'Unexpected request: ' + u.pathname);
      const [, table, resource, id] = match;
      if (!table) result = { code: 0, data: { items: Object.entries(data).map(([table_id, t]) => ({ table_id, name: t.name })) } };
      else if (resource === 'fields') result = { code: 0, data: { items: data[table].fields || [] } };
      else if (method === 'PUT') result = { code: 0 };
      else if (id) result = { code: 0, data: { record: data[table].rows.find(x => x.record_id === id) } };
      else result = { code: 0, data: { items: data[table].rows, has_more: false } };
    }
    return { ok: true, json: async () => clone(result) };
  };
  return { fetch, calls };
}
function api(file, who = user(), data) {
  const mock = lark(data);
  return { handler: load('api/' + file + '.js', { './_auth.js': guard(who) }, { fetch: mock.fetch }), calls: mock.calls };
}


module.exports = { ENV, load, AUTH, user, guard, call, redis, y, fixtures, lark, api };
