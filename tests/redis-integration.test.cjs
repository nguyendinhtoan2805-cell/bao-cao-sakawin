'use strict';
// Optional integration check. Runs a new Redis on a private Unix socket, no TCP,
// no persistence, no production credentials. Binaries must be supplied explicitly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { load, user } = require('./fixtures.cjs');

test('Real Redis Lua atomically preserves revocation against stale writes', {
  skip: !process.env.REDIS_SERVER_BIN || !process.env.REDIS_CLI_BIN,
  timeout: 20000,
}, async t => {
  const dir = fs.mkdtempSync('/private/tmp/sakawin-redis-test-');
  const socket = path.join(dir, 'redis.sock');
  const server = spawn(process.env.REDIS_SERVER_BIN, ['--port', '0', '--unixsocket', socket,
    '--unixsocketperm', '700', '--save', '', '--appendonly', 'no', '--dir', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const stopped = new Promise(resolve => server.once('exit', resolve));
      server.kill('SIGTERM'); await stopped;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(Error('Local Redis did not start')), 5000);
    server.once('error', e => { clearTimeout(timer); reject(e); });
    server.once('exit', code => { clearTimeout(timer); reject(Error('Local Redis exited: ' + code + ': ' + log.slice(-1000))); });
    server.stderr.on('data', chunk => { log += String(chunk); });
    server.stdout.on('data', chunk => {
      log += String(chunk);
      if (String(chunk).includes('Ready to accept connections')) { clearTimeout(timer); resolve(); }
    });
  });
  const fetch = async (url, opts) => {
    assert.equal(String(url), 'https://fake.invalid');
    const args = JSON.parse(opts.body).map(String);
    const result = spawnSync(process.env.REDIS_CLI_BIN, ['-s', socket, '--json', ...args], { encoding: 'utf8', timeout: 3000 });
    assert.equal(result.status, 0, result.stderr);
    return { ok: true, json: async () => ({ result: JSON.parse(result.stdout) }) };
  };
  const store = load('api/_store.js', {}, { fetch });
  const empty = await store.docDanhSach(), staleEmpty = await store.docDanhSach();
  empty.push(user()); await store.ghiDanhSach(empty);
  await assert.rejects(store.ghiDanhSach(staleEmpty), e => e.statusCode === 409);
  const [revocation, login, deletion] = await Promise.all([store.docDanhSach(), store.docDanhSach(), store.docDanhSach()]);
  revocation[0].quyen.xem_nhan_su = false;
  revocation[0].boPhan = 'Team B';
  await store.ghiDanhSach(revocation);
  login[0].sai = 0;
  await assert.rejects(store.ghiDanhSach(login), e => e.statusCode === 409);
  await assert.rejects(store.ghiDanhSach([], deletion), e => e.statusCode === 409);
  const saved = await store.docDanhSach();
  assert.equal(saved[0].quyen.xem_nhan_su, false);
  assert.equal(saved[0].boPhan, 'Team B');
  await store.ghiDanhSach([], saved);
  assert.equal((await store.docDanhSach()).length, 0);
});
