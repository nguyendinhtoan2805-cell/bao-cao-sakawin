'use strict';
/* Chốt chặn cho một lỗi đã tái phát nhiều lần: dấu tổ hợp tiếng Việt (U+0300–U+036F)
   dán thẳng vào mã nguồn khi soạn file qua heredoc. Nhìn bằng mắt thì y hệt chữ
   thường, nhưng lớp ký tự trong regex bỏ dấu sẽ sai và hàm im lặng trả kết quả hỏng.
   Mọi chữ Việt trong mã phải ở dạng dựng sẵn (NFC); lớp ký tự bỏ dấu trong regex
   phải viết bằng escape (U+0300 tới U+036F), tuyệt đối không dán ký tự thật. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const goc = path.join(__dirname, '..');
const THU_MUC = ['api', 'lib', 'assets', 'tests', 'tools'];
const DUOI = /\.(js|cjs|mjs|css|html)$/;

function quet(d, ra = []) {
  if (!fs.existsSync(d)) return ra;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) quet(f, ra);
    else if (DUOI.test(e.name)) ra.push(f);
  }
  return ra;
}

test('Mã nguồn không chứa dấu tổ hợp viết thẳng', () => {
  const files = THU_MUC.flatMap(d => quet(path.join(goc, d)))
    .concat(fs.readdirSync(goc).filter(f => f.endsWith('.html')).map(f => path.join(goc, f)));
  assert.ok(files.length > 20, 'phải quét được kha khá file, thấy ' + files.length);

  const dinh = [];
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    s.split('\n').forEach((dong, i) => {
      if ([...dong].some(c => c.charCodeAt(0) >= 0x300 && c.charCodeAt(0) <= 0x36f))
        dinh.push(path.relative(goc, f) + ':' + (i + 1));
    });
  }
  assert.deepEqual(dinh, [],
    'Có dấu tổ hợp dán thẳng. Trong regex bỏ dấu hãy viết \\u0300-\\u036f; ' +
    'chữ Việt khác thì chuyển về dạng dựng sẵn (NFC). Vị trí: ' + dinh.join(', '));
});
