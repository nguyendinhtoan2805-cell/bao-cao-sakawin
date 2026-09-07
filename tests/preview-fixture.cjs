'use strict';
// node tests/preview-fixture.cjs — chỉ localhost, toàn bộ dữ liệu trong RAM.
// /fixture?role=admin|hr|recruitment|none để chọn tài khoản giả.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { AUTH, user, guard, redis, load, api } = require('./fixtures.cjs');
const ROOT = path.resolve(__dirname, '..');
const store = redis(JSON.stringify([{ ...user(), ten: 'Tài khoản giả Team A' },
  { ...user('Team B'), email: 'fixture.other', ten: 'Tài khoản giả Team B' }]));
const roles = {
  admin: { ...user('', { quan_tri: true }), ten: 'QUẢN TRỊ THỬ NGHIỆM', quyen: { ...AUTH.quyenRong(), quan_tri: true } },
  hr: { ...user(), ten: 'NHÂN SỰ THỬ NGHIỆM', quyen: { ...AUTH.quyenRong(), xem_nhan_su: true } },
  recruitment: { ...user(), ten: 'TUYỂN DỤNG THỬ NGHIỆM', quyen: { ...AUTH.quyenRong(), xem_tuyen_dung: true } },
  none: { ...user(), quyen: AUTH.quyenRong() },
};
const files = new Set(['index.html', 'admin.html', 'nhan-su.html', 'tuyen-dung.html']);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/fixture') {
      const role = url.searchParams.get('role');
      if (!Object.hasOwn(roles, role)) { res.writeHead(400); return res.end('Unknown fixture role'); }
      res.setHeader('Set-Cookie', `fixture_role=${role}; Path=/; SameSite=Strict; HttpOnly`);
      res.writeHead(302, { Location: '/' }); return res.end();
    }
    const role = (req.headers.cookie || '').match(/(?:^|;\s*)fixture_role=(\w+)/)?.[1] || 'none';
    const who = roles[role] || roles.none;
    res.status = n => { res.statusCode = n; return res; };
    res.json = x => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(x)); return res; };
    req.query = Object.fromEntries(url.searchParams);
    if (url.pathname === '/api/auth/me') return res.json({ ...who, dangNhap: true });
    if (url.pathname === '/api/users') {
      let raw = ''; for await (const c of req) { raw += c; if (raw.length > 50000) throw Error('Fixture payload too large'); }
      req.body = raw ? JSON.parse(raw) : {};
      return await load('api/users.js', { './_auth.js': guard(who), './_store.js': store.store })(req, res);
    }
    if (['/api/nhan-su', '/api/tuyen-dung'].includes(url.pathname)) {
      if (req.method !== 'GET') return res.status(405).json({ ok: false });
      return await api(url.pathname.slice(5), who).handler(req, res);
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!files.has(file)) { res.writeHead(404); return res.end('Fixture route only'); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(fs.readFileSync(path.join(ROOT, file)));
  } catch (e) { res.statusCode = 500; res.end('Fixture error: ' + e.message); }
});
server.listen(4318, '127.0.0.1', () => process.stdout.write('FAKE DATA ONLY http://127.0.0.1:4318/fixture?role=admin\n'));
