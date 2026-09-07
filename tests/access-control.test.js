'use strict';
// Chỉ dữ liệu giả. Không đọc .env, không gọi mạng, không ghi Lark/Redis thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const clone = x => JSON.parse(JSON.stringify(x));
const { load, AUTH, user, guard, call, redis, y, fixtures, lark, api } = require('./fixtures.cjs');

test('CAS rejects stale grant, password-login write, and stale deletion', async () => {
  const r = redis(JSON.stringify([user()]));
  const [revocation, login, deletion] = await Promise.all([r.store.docDanhSach(), r.store.docDanhSach(), r.store.docDanhSach()]);
  revocation[0].quyen.xem_nhan_su = false;
  await r.store.ghiDanhSach(revocation);
  login[0].sai = 0;
  await assert.rejects(r.store.ghiDanhSach(login), e => e.statusCode === 409);
  await assert.rejects(r.store.ghiDanhSach([], deletion), e => e.statusCode === 409);
  assert.equal(r.value()[0].quyen.xem_nhan_su, false);
  const fresh = await r.store.docDanhSach();
  await r.store.ghiDanhSach([], fresh);
  assert.deepEqual(r.value(), []);
});
test('CAS handles empty store, rejects untracked writes and corrupt storage', async () => {
  const r = redis();
  const a = await r.store.docDanhSach(), b = await r.store.docDanhSach();
  a.push(user()); await r.store.ghiDanhSach(a);
  await assert.rejects(r.store.ghiDanhSach(b), e => e.statusCode === 409);
  await assert.rejects(r.store.ghiDanhSach([]), /đọc lại/);
  for (const raw of ['{broken', '{}', 'null', '']) await assert.rejects(redis(raw).store.docDanhSach());
});

for (const [label, patch] of Object.entries({ grant: { quyen: { xem_ca_nhan: true } },
  deactivate: { kichHoat: false }, reset: { datLaiMatKhau: true }, rename: { ten: 'Updated' } })) {
  test('Admin ' + label + ' preserves scope and unrelated permissions', async () => {
    const old = { ...user(), loai: 'mk', bam: 'fakeHash', muoi: 'fakeSalt' };
    const r = redis(JSON.stringify([old]));
    const handler = load('api/users.js', { './_auth.js': guard(user('', { quan_tri: true })), './_store.js': r.store });
    const res = await call(handler, { method: 'POST', body: { email: old.email, revision: old.revision || '0', ...patch } });
    assert.equal(res.body.ok, true, JSON.stringify(res.body));
    const saved = r.value()[0];
    assert.equal(saved.boPhan, 'Team A'); assert.equal(saved.quyen.xem_tuyen_dung, true);
    assert.equal(saved.quyen.xem_luong, false); assert.equal(saved.quyen.quan_tri, false);
    if (label !== 'reset') assert.equal(saved.bam, old.bam);
    else { assert.equal(saved.phaiDoi, true); assert.notEqual(saved.bam, old.bam); }
  });
}
test('Admin scope update, explicit clear, rejected invalid input and no reactivation on reset', async () => {
  const r = redis(JSON.stringify([{ ...user(), kichHoat: false }]));
  const handler = load('api/users.js', { './_auth.js': guard(user('', { quan_tri: true })), './_store.js': r.store });
  const post = body => call(handler, { method: 'POST', body: { email: 'fixture.user', revision: r.value()[0].revision || '0', ...body } });
  for (const body of [{ boPhan: '' }, { boPhan: null }, { boPhan: '!!!' }, { quyen: { quan_tri: 'true' } },
    { quyen: { unknown: true } }, { kichHoat: 'false' }]) assert.equal((await post(body)).code, 400);
  assert.equal(r.value()[0].boPhan, 'Team A');
  assert.equal((await post({ boPhan: 'Team B' })).body.ok, true);
  assert.equal(r.value()[0].boPhan, 'Team B');
  await post({ datLaiMatKhau: true }); assert.equal(r.value()[0].kichHoat, false);
  assert.equal((await post({ boPhan: '', xacNhanToanBo: true })).body.ok, true);
  assert.equal(r.value()[0].boPhan, '');
});
test('Users rejects non-admin before reading or writing store', async () => {
  const handler = load('api/users.js', { './_auth.js': guard(user()), './_store.js': {} });
  assert.equal((await call(handler, { method: 'POST', body: { email: 'fixture.user', quyen: { quan_tri: true } } })).code, 403);
});
test('Stale admin browser cannot restore removed permissions, reset password or delete a changed account', async () => {
  const r = redis(JSON.stringify([user()]));
  const handler = load('api/users.js', { './_auth.js': guard(user('', { quan_tri: true })), './_store.js': r.store });
  const first = await call(handler, { method: 'POST', body: { email: 'fixture.user', revision: '0', quyen: { xem_nhan_su: false } } });
  assert.equal(first.body.ok, true); assert.notEqual(first.body.revision, '0');
  for (const stale of [{ quyen: AUTH.quyenDay() }, { boPhan: '', xacNhanToanBo: true }, { datLaiMatKhau: true }]) {
    assert.equal((await call(handler, { method: 'POST', body: { email: 'fixture.user', revision: '0', ...stale } })).code, 409);
  }
  assert.equal((await call(handler, { method: 'POST', body: { email: 'fixture.user', quyen: AUTH.quyenDay() } })).code, 409);
  assert.equal((await call(handler, { method: 'DELETE', query: { email: 'fixture.user', revision: '0' } })).code, 409);
  assert.equal(r.value()[0].quyen.xem_nhan_su, false); assert.equal(r.value()[0].boPhan, 'Team A');
  assert.equal((await call(handler, { method: 'DELETE', query: { email: 'fixture.user', revision: first.body.revision } })).body.ok, true);
  assert.deepEqual(r.value(), []);
});
test('Existing session reads current revoked rights, scope, disabled state, and mandatory password change', async () => {
  let list = [user()];
  const a = load('api/_auth.js', { './_store.js': { docDanhSach: async () => clone(list) } });
  const token = a.kyPhien({ email: 'fixture.user', quyen: AUTH.quyenDay(), boPhan: '' });
  const req = { headers: { cookie: a.COOKIE + '=' + token } };
  assert.equal((await a.nguoiDung(req)).boPhan, 'Team A');
  list[0].boPhan = 'Team B'; assert.equal((await a.nguoiDung(req)).boPhan, 'Team B');
  list[0].quyen.xem_nhan_su = false;
  const endpoint = async (req, res) => { const u = await a.canhCong(req, res, 'xem_nhan_su'); if (u) res.json({ ok: true }); };
  assert.equal((await call(endpoint, req)).code, 403);
  list[0] = { ...user(), loai: 'mk', phaiDoi: true };
  assert.equal((await call(endpoint, req)).body.phaiDoiMatKhau, true);
  list[0] = { ...user(), kichHoat: false }; assert.equal((await call(endpoint, req)).code, 403);
  list = []; assert.equal((await call(endpoint, req)).code, 403);
});
test('Department boundary fails closed for malformed scope and similar but distinct names', () => {
  for (const scope of ['!!!', '   ', 0, false, {}, []]) assert.equal(AUTH.phamViBoPhan(user(scope)).choPhep('Team A'), false);
  for (const [scope, row] of [['R&D', 'RD'], ['Kế toán', 'Ke toan'], ['Team A', 'TeamA']])
    assert.equal(AUTH.phamViBoPhan(user(scope)).choPhep(row), false);
  assert.equal(AUTH.phamViBoPhan(user('  TEAM  A  ')).choPhep('Team A'), true);
  assert.equal(AUTH.phamViBoPhan(user('Team A', { quan_tri: true })).choPhep('Team B'), true);
  assert.equal(AUTH.phamViBoPhan(user('')).choPhep('Team B'), true);
});

test('HR filters every statistic, checklist, review, training and warning before responding', async () => {
  const { handler } = api('nhan-su'); const res = await call(handler);
  assert.equal(res.body.ok, true, JSON.stringify(res.body));
  const d = res.body.data;
  assert.deepEqual(d.nhanSu.map(x => x.ma), ['A1', 'A2']);
  assert.equal(d.tong.dangLam, 2); assert.equal(d.tong.daNghi, 0); assert.equal(d.tong.boPhan, 1);
  assert.equal(d.tong.vaoNamNay, 2); assert.equal(d.tong.raNamNay, 0);
  assert.deepEqual(d.bienDong, [{ thang: y + '-01', vao: 2, ra: 0 }]);
  assert.equal(d.thamNien.reduce((s, x) => s + x.so, 0), 2);
  assert.deepEqual(d.boPhan.map(x => x.ten), ['Team A']);
  assert.equal(d.hopDong.length, 1); assert.equal(d.daoTao.khoa.length, 1);
  assert.deepEqual(d.danhGia.dsKy, ['Q1']); assert.equal(d.danhGia.nguoi.length, 1);
  assert.equal(d.nhanSu[0].onbCL.soXong, 0); assert.equal(d.nhanSu[1].onbCL, null);
  const json = JSON.stringify(d);
  for (const forbidden of ['SECRET_', 'AMBIGUOUS_', 'UNKNOWN_CODE_', 'MISMATCH_', 'FAKE_PRIVATE_PHONE']) assert.ok(!json.includes(forbidden), forbidden);
  assert.match(res.headers['Cache-Control'], /no-store/);
});
test('HR retains explicitly global access and personal-info gate', async () => {
  for (const who of [user(''), user('Team A', { quan_tri: true })]) {
    const res = await call(api('nhan-su', who).handler); assert.equal(res.body.data.nhanSu.length, 4);
  }
  const res = await call(api('nhan-su', user('Team A', { xem_ca_nhan: true })).handler);
  assert.equal(res.body.data.nhanSu.length, 2); assert.equal(res.body.data.nhanSu[0].sdt, 'FAKE_PRIVATE_PHONE');
});
test('HR unknown/invalid scope yields zero private rows and no outside statistics', async () => {
  for (const scope of ['Unknown team', '!!!', ' ']) {
    const res = await call(api('nhan-su', user(scope)).handler);
    assert.equal(res.body.ok, true); assert.equal(res.body.data.nhanSu.length, 0);
    assert.equal(res.body.data.tong.vaoNamNay, 0); assert.equal(res.body.data.daoTao.khoa.length, 0);
    assert.equal(res.body.data.danhGia.dsKy.length, 0);
    assert.ok(!JSON.stringify(res.body.data).includes('SECRET_'));
  }
});
test('HR and recruitment scopes work in both directions, including file access', async () => {
  const hr = await call(api('nhan-su', user('Team B')).handler);
  assert.deepEqual(hr.body.data.nhanSu.map(x => x.ma), ['B1', 'B2']);
  assert.equal(hr.body.data.nhanSu.find(x => x.ma === 'B2').onbCL.soXong, 1);
  assert.ok(!JSON.stringify(hr.body.data).includes('ALLOWED_COURSE'));
  const td = await call(api('tuyen-dung', user('Team B')).handler);
  assert.deepEqual(td.body.data.uv.map(x => x.id), ['recB']);
  assert.equal(td.body.data.uv[0].khungLuong.tu, 900);
  assert.equal((await call(api('tuyen-dung', user('Team B')).handler, { query: { cv: 'cvA' } })).code, 403);
  assert.equal((await call(api('tuyen-dung', user('Team B')).handler, { query: { cv: 'cvB' } })).code, 200);
});
test('Incomplete pagination fails closed instead of using incomplete employee identities', async () => {
  for (const file of ['nhan-su', 'tuyen-dung']) {
    const mock = lark();
    const fetch = async (url, opts) => {
      const r = await mock.fetch(url, opts);
      if (String(url).includes('/records?')) return { ok: true, json: async () => ({ code: 0, data: { items: [], has_more: true } }) };
      return r;
    };
    const handler = load('api/' + file + '.js', { './_auth.js': guard(user()) }, { fetch });
    const res = await call(handler);
    assert.equal(res.body.ok, false); assert.equal(res.body.data, undefined);
  }
});
test('Recruitment filters applicants, summaries and JD from other teams with the same job title', async () => {
  const res = await call(api('tuyen-dung').handler);
  assert.equal(res.body.ok, true, JSON.stringify(res.body));
  const d = res.body.data;
  assert.deepEqual(d.uv.map(x => x.id), ['recA']); assert.equal(d.viTri.length, 1);
  assert.equal(d.uv[0].khungLuong.tu, 100); assert.ok(!JSON.stringify(d).includes('SECRET_'));
  assert.match(res.headers['Cache-Control'], /no-store/);
  const data = fixtures(); delete data.jd.rows[0].fields['Bộ phận'];
  const missing = await call(api('tuyen-dung', user(), data).handler);
  assert.equal(missing.body.data.uv[0].khungLuong, null);
});
for (const chiLuuBienBan of [true, false]) {
  for (const [id, expected] of [['recA', 200], ['recB', 403], ['../recA', 400]]) {
    test(`Recruitment ${chiLuuBienBan ? 'notes' : 'status'} ${id}: ${expected}`, async () => {
      const { handler, calls } = api('tuyen-dung', user('Team A', { ghi_tuyen_dung: true }));
      const res = await call(handler, { method: 'POST', body: { id, chiLuuBienBan, bienBan: 'FAKE_NEW', tu: 'Đạt vòng CV', den: 'Đã sơ vấn' } });
      assert.equal(res.code, expected, JSON.stringify(res.body));
      const writes = calls.filter(x => x.method === 'PUT');
      assert.equal(writes.length, expected === 200 ? 1 : 0);
      assert.ok(!JSON.stringify(res.body).includes('SECRET_APPLICANT'));
    });
  }
}
test('Recruitment read-only role cannot save notes or status', async () => {
  for (const chiLuuBienBan of [true, false]) {
    const { handler, calls } = api('tuyen-dung');
    assert.equal((await call(handler, { method: 'POST', body: { id: 'recA', chiLuuBienBan, den: 'Đã sơ vấn' } })).code, 403);
    assert.equal(calls.filter(x => x.method === 'PUT').length, 0);
  }
});
for (const [file, key, allowed, denied, grants] of [
  ['nhan-su', 'anh', 'photoA1', ['photoB1', 'cvA', 'salaryPhoto', 'randomToken'], {}],
  ['tuyen-dung', 'cv', 'cvA', ['cvB', 'photoA1', 'salaryPhoto', 'randomToken'], {}],
  ['quy-luong', 'anh', 'salaryPhoto', ['cvA', 'photoA1', 'randomToken'], { xem_luong: true }],
]) {
  test(file + ' allows only attached accessible media and never caches the response', async () => {
    for (const ft of [allowed, ...denied, '../invalid']) {
      const { handler, calls } = api(file, user('Team A', grants));
      const res = await call(handler, { query: { [key]: ft } });
      assert.equal(res.code, ft === allowed ? 200 : ft === '../invalid' ? 400 : 403);
      assert.equal(calls.filter(x => x.url.includes('/medias/')).length, ft === allowed ? 1 : 0);
      assert.match(res.headers['Cache-Control'], /no-store/);
    }
  });
  test(file + ' rejects missing login and page permission before fetching anything', async () => {
    for (const who of [null, user('', Object.fromEntries(AUTH.QUYEN.map(k => [k, false])))]) {
      const { handler, calls } = api(file, who);
      const res = await call(handler, { query: { [key]: allowed } });
      assert.equal(res.code, who ? 403 : 401); assert.equal(calls.length, 0);
    }
  });
}

function bootHome(grants, overrides = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const start = html.indexOf('(async function khoiDong(){');
  const source = html.slice(start, html.indexOf('</script>', start));
  const nodes = new Map(), events = [];
  const me = { dangNhap: true, ten: 'Fixture', email: 'fixture.user', quyen: { ...AUTH.quyenRong(), ...grants }, ...overrides };
  const context = { fetch: async () => ({ json: async () => clone(me) }),
    $: id => { if (!nodes.has(id)) nodes.set(id, { style: {} }); return nodes.get(id); }, esc: String,
    khoaLai: title => events.push('lock:' + title), batDoiMatKhau: () => events.push('password'),
    moKhoa: () => events.push('unlock'), apDungKyNho: () => {}, tai: () => events.push('load'),
    location: { replace: url => events.push('redirect:' + url) } };
  return vm.runInNewContext(source, context).then(() => ({ events, nodes, me }));
}
test('Home admits HR-only and routes recruitment/admin-only to their permitted pages', async () => {
  assert.deepEqual((await bootHome({ xem_nhan_su: true })).events, ['unlock', 'load']);
  assert.deepEqual((await bootHome({ xem_tuyen_dung: true })).events, ['redirect:/tuyen-dung.html']);
  assert.deepEqual((await bootHome({ quan_tri: true })).events, ['redirect:/admin.html']);
  for (const k of ['xem_doanh_so', 'xem_tai_chinh', 'xem_luong'])
    assert.deepEqual((await bootHome({ [k]: true })).events, ['unlock', 'load']);
  assert.ok((await bootHome({})).events[0].startsWith('lock:'));
  assert.deepEqual((await bootHome({ xem_tuyen_dung: true }, { phaiDoiMatKhau: true })).events, ['password']);
  const mixed = await bootHome({ xem_nhan_su: true, xem_tuyen_dung: true });
  assert.equal(mixed.nodes.get('selMoc').style.display, 'none');
  assert.equal(mixed.nodes.get('tabTaiChinh').style.display, 'none');
  assert.equal(mixed.me.quyen.xem_tai_chinh, false);
});
test('Admin UI sends only changed field, cancels scope widening and rolls back failed writes', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  const source = html.slice(html.indexOf('async function doiQuyen('), html.indexOf('async function xoa('));
  const u = { ...user(), revision: '0' }, sent = [];
  const c = vm.createContext({ USERS: [u], confirm: () => false, baoTin: () => {},
    goi: async (method, body) => { sent.push(clone(body)); return { ok: true, revision: 'next' }; } });
  vm.runInContext(source, c);
  const cb = { dataset: { i: '0', q: 'xem_ca_nhan' }, checked: true };
  await c.doiQuyen({ target: cb }); assert.deepEqual(sent.pop(), { email: u.email, revision: '0', quyen: { xem_ca_nhan: true } });
  const ip = { dataset: { i: '0' }, value: '' };
  await c.doiBoPhan({ target: ip }); assert.equal(ip.value, 'Team A'); assert.equal(sent.length, 0);
  ip.value = 'Team B'; await c.doiBoPhan({ target: ip });
  assert.deepEqual(sent.pop(), { email: u.email, revision: 'next', boPhan: 'Team B', xacNhanToanBo: false });
  c.goi = async () => ({ ok: false, error: 'Conflict' });
  ip.value = 'Team C'; await c.doiBoPhan({ target: ip }); assert.equal(ip.value, 'Team B');
  cb.checked = false; await c.doiQuyen({ target: cb }); assert.equal(cb.checked, true); assert.equal(cb.disabled, false);
  assert.ok(!html.includes('luu(u)'));
});
