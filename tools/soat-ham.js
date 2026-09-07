/* Quét định danh được GỌI như hàm mà không khai trong chính file đó.
   require() không bắt được vì lỗi chỉ nổ lúc chạy — đã vấp hai lần:
   'lich is not defined' và 'dsCot is not defined'.

   Phải bỏ comment và nội dung chuỗi trước khi quét, nếu không chú thích tiếng
   Việt và CSS sẽ tạo hàng chục báo giả. Với template literal thì GIỮ phần ${...}
   vì đó là code thật. */
const fs = require('fs');

function locCode(src) {
  let r = '', i = 0, n = src.length;
  const sâu = [];                       // ngăn xếp cho ${ } lồng trong template
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; r += ' '; continue; }
    if (c === '/' && c2 === '/') { const j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }
    if (c === "'" || c === '"') {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; r += '""'; continue;
    }
    if (c === '`') {
      i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') { i++; break; }
        if (src[i] === '$' && src[i + 1] === '{') {   // giữ code bên trong
          i += 2; let d = 1, bd = i;
          while (i < n && d > 0) { if (src[i] === '{') d++; else if (src[i] === '}') d--; i++; }
          r += ' ' + locCode(src.slice(bd, i - 1)) + ' ';
          continue;
        }
        i++;
      }
      r += '``'; continue;
    }
    r += c; i++;
  }
  return r;
}

const SAN_CO = new Set(['require','fetch','Number','String','Boolean','Array','Object','Math','Date','JSON',
  'Map','Set','Promise','Error','Buffer','URL','isNaN','parseInt','parseFloat','encodeURIComponent',
  'decodeURIComponent','setTimeout','clearTimeout','console','if','for','while','switch','catch','return',
  'typeof','function','await','new','document','window','navigator','CSS','IntersectionObserver','Chart',
  'alert','Intl','RegExp','structuredClone','URLSearchParams',
  'of','in','async','var','do','else','try','finally','yield','delete','void','instanceof',
  'rgba','rgb','var','calc','minmax','repeat','translateX','translateY','scale','url']);

function soat(duong, nhan) {
  const src = fs.readFileSync(duong, 'utf8');
  const raw = duong.endsWith('.html')
    ? src.slice(src.lastIndexOf('<script>') + 8, src.lastIndexOf('</' + 'script>'))
    : src;
  const js = locCode(raw);

  const khai = new Set();
  for (const m of js.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) khai.add(m[1]);
  for (const m of js.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) khai.add(m[1]);
  for (const m of js.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g))
    m[1].split(',').forEach(x => { const t = x.split(':').pop().trim().split('=')[0].trim(); if (/^[A-Za-z_$][\w$]*$/.test(t)) khai.add(t); });
  for (const m of js.matchAll(/\(([^()]*)\)\s*=>/g))
    m[1].split(',').forEach(x => { const t = x.trim().split('=')[0].trim().replace(/^\.\.\./, ''); if (/^[A-Za-z_$][\w$]*$/.test(t)) khai.add(t); });
  for (const m of js.matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*=>/gm)) khai.add(m[1]);
  for (const m of js.matchAll(/function\s*[\w$]*\s*\(([^)]*)\)/g))
    m[1].split(',').forEach(x => { const t = x.trim().split('=')[0].trim().replace(/^\.\.\./, ''); if (/^[A-Za-z_$][\w$]*$/.test(t)) khai.add(t); });
  for (const m of js.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) khai.add(m[1]);
  for (const m of js.matchAll(/for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) khai.add(m[1]);

  const goi = new Map();
  js.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const t = m[2];
      if (t.length < 2) continue;                 // tên 1 chữ cái: nhiễu
      if (SAN_CO.has(t) || khai.has(t) || goi.has(t)) continue;
      goi.set(t, i + 1);
    }
  });

  const thieu = [...goi.entries()];
  console.log(`\n═══ ${nhan}`);
  if (!thieu.length) console.log('   ✅ mọi hàm được gọi đều có khai trong file');
  else thieu.forEach(([t, d]) => console.log(`   ❌ dòng ~${d}: gọi ${t}() nhưng không khai ở đâu`));
  return thieu.length;
}

const D = '/Users/dinhtoan/Documents/bao-cao-sakawin/';
let loi = 0;
for (const [f, n] of [['api/tuyen-dung.js','api/tuyen-dung.js'],['api/nhan-su.js','api/nhan-su.js'],
                      ['tuyen-dung.html','tuyen-dung.html'],['nhan-su.html','nhan-su.html'],
                      ['index.html','index.html']])
  loi += soat(D + f, n);
console.log(loi ? `\n❌ ${loi} chỗ cần xem` : '\n🟢 Không có hàm nào bị gọi mà chưa khai');
process.exit(loi ? 1 : 0);
