'use strict';
// Local visual/interaction review only. No secrets, real accounts, or outbound API requests.
// Uses the unmodified production handler with Lark replaced by an in-memory fixture.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { AUTH, user, guard, load, lark, fixtures } = require('./fixtures.cjs');
const ROOT = path.resolve(__dirname, '..');
const baseline = execFileSync('git', ['show', '0027c37:tuyen-dung.html'], { cwd: ROOT });
const all = Object.fromEntries(Object.keys(AUTH.quyenRong()).map(k => [k, true]));
const roles = {
  all: { ...user('', all), ten: 'TÀI KHOẢN MINH HOẠ' },
  restricted: { ...user('Team A'), ten: 'CHỈ XEM · MINH HOẠ', quyen: { ...AUTH.quyenRong(), xem_tuyen_dung: true } },
  none: { ...user(), ten: 'CHƯA CẤP QUYỀN', quyen: AUTH.quyenRong() },
};
const states = new Set(['normal', 'empty', 'error', 'many']);
const data = fixtures();
const stages = ['Mới nhận', 'Mới nhận', 'Đạt vòng CV', 'Đã sơ vấn', 'Hẹn phỏng vấn', 'Hẹn phỏng vấn', 'Đã phỏng vấn', 'Gửi offer', 'Loại'];
function reset() {
  data.uv.rows = stages.map((stage, i) => ({ record_id: 'demo' + i, fields: {
    'Họ và tên': 'Ứng viên ' + String.fromCharCode(65 + i),
    'Bộ phận': 'Team A', 'Vị trí ứng tuyển': i === 3 ? 'Nhân viên Kho' : i % 2 ? 'Facebook Ads' : 'Content Marketing',
    'Nguồn': i % 2 ? 'TopCV' : 'Facebook', 'Trạng thái': stage,
    'Ngày nhận CV': Date.now() - (i < 2 ? 72 : 12) * 3600000,
    'Ngày phỏng vấn': i === 6 ? Date.now() : '',
    'Lịch phỏng vấn': i === 5 ? new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) + 'T17:00:00+07:00').getTime() : '',
    'Hiểu biết Sakawin': i === 4 ? '' : 'Đã đọc tài liệu minh hoạ',
    'Biên bản phỏng vấn': i === 6 ? 'Biên bản dùng để thử giao diện, không phải dữ liệu thật.' : '',
    'Tóm tắt nhanh': 'Hồ sơ minh hoạ để kiểm tra giao diện.',
    'Lý do loại': i === 8 ? 'Không phù hợp vị trí (minh hoạ)' : '',
    'Loại ở bước': i === 8 ? 'Vòng CV' : '',
  }}));
  data.uv.fields = [...new Set(data.uv.rows.flatMap(r => Object.keys(r.fields)).concat(['Lịch sử', 'Ngày duyệt CV', 'Ngày sơ vấn', 'Ngày gửi offer', 'Ngày chốt', 'Hình thức', 'Địa điểm / Link']))].map(field_name => ({ field_name, type: 1 }));
  data.jd.rows = [];
  data.kh.rows = [];
}
reset();
const requests = [];
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status = n => { res.statusCode = n; return res; };
    res.json = obj => { res.setHeader('Content-Type', types['.js'].replace('javascript', 'json')); res.end(JSON.stringify(obj)); return res; };
    if (url.pathname === '/fixture') {
      const role = url.searchParams.get('role') || 'all';
      const state = url.searchParams.get('state') || 'normal';
      if (!Object.hasOwn(roles, role) || !states.has(state)) return res.status(400).end();
      reset(); requests.length = 0;
      res.setHeader('Set-Cookie', [`demo_role=${role}; Path=/; HttpOnly; SameSite=Strict`, `demo_state=${state}; Path=/; HttpOnly; SameSite=Strict`]);
      res.writeHead(302, { Location: '/tuyen-dung.html' }); return res.end();
    }
    const role = (req.headers.cookie || '').match(/(?:^|;\s*)demo_role=(\w+)/)?.[1] || 'none';
    const state = (req.headers.cookie || '').match(/(?:^|;\s*)demo_state=(\w+)/)?.[1] || 'normal';
    const who = roles[role] || roles.none;
    if (url.pathname === '/api/auth/me') return res.json({ ...who, dangNhap: true });
    if (url.pathname === '/api/tuyen-dung') {
      if (state === 'error') return res.status(503).json({ ok: false, error: 'Lỗi kết nối minh hoạ' });
      let raw = ''; for await (const part of req) { raw += part; if (raw.length > 60000) throw Error('Body too large'); }
      req.body = raw ? JSON.parse(raw) : {};
      req.query = Object.fromEntries(url.searchParams);
      requests.push({ method: req.method, action: req.body.hanhDong || '', id: req.body.id || '', den: req.body.den || '' });
      const mockData = structuredClone(data);
      if (state === 'empty') mockData.uv.rows = [];
      if (state === 'many') mockData.uv.rows.push(...Array.from({length: 30}, (_, i) => ({ record_id: 'long' + i, fields: { ...data.uv.rows[0].fields, 'Họ và tên': 'Ứng viên kiểm tra tên dài trên màn hình nhỏ ' + (i + 1), 'Vị trí ứng tuyển': 'Chuyên viên phát triển nội dung và thương hiệu' } })));
      const mock = lark(mockData);
      const fetch = async (input, options = {}) => {
        const match = new URL(String(input)).pathname.match(/\/tables\/uv\/records\/(demo\d+)$/);
        if (options.method === 'PUT' && match) {
          const record = data.uv.rows.find(r => r.record_id === match[1]);
          if (!record) throw Error('Unknown fake record');
          Object.assign(record.fields, JSON.parse(options.body).fields);
        }
        return mock.fetch(input, options);
      };
      return await load('api/tuyen-dung.js', { './_auth.js': guard(who) }, { fetch })(req, res);
    }
    if (url.pathname === '/review-requests') return res.json(requests);
    if (url.pathname.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Local fixture only' });
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const target = path.resolve(ROOT, file);
    if (url.pathname === '/baseline') { res.setHeader('Content-Type', types['.html']); return res.end(baseline); }
    if (!(target.startsWith(path.join(ROOT, 'assets', 'recruitment') + path.sep) || ['index.html','tuyen-dung.html','nhan-su.html','admin.html','doanh-so.html','tai-chinh.html','quy-luong.html'].includes(file))) return res.status(404).end();
    const type = types[path.extname(target)];
    if (!type || !fs.existsSync(target)) return res.status(404).end();
    res.setHeader('Content-Type', type);
    return res.end(fs.readFileSync(target));
  } catch (error) { res.statusCode = 500; res.end('Fixture error: ' + error.message); }
}).listen(4321, '127.0.0.1', () => process.stdout.write('FAKE DATA ONLY — http://127.0.0.1:4321/fixture?role=all\n'));
