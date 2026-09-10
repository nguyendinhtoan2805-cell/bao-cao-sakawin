'use strict';
/* Trang Sản phẩm — phân tích thuần sản phẩm, không phải báo cáo tài chính.
   Ba khối theo đúng ba việc: cơ cấu dải hàng · xếp hạng mã · xu hướng năm sau. */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const khongDau = s => String(s ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[Đđ]/g, 'd').toLowerCase();
const tien = n => n >= 1e9 ? (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' tỷ'
  : n >= 1e6 ? Math.round(n / 1e6) + ' tr' : Math.round(n).toLocaleString('vi-VN');
const dem = n => Math.round(n).toLocaleString('vi-VN');

let du = null, me = null, doTheo = 'doanhThu', locKenh = '', locTim = '', tu = '', den = '';

const DON_VI = { doanhThu: { nhan: 'Doanh thu', ve: tien }, sanLuong: { nhan: 'Sản lượng', ve: dem } };
const TRUC = [['dongSP', 'Dòng sản phẩm'], ['phanKhuc', 'Phân khúc giá'],
              ['loai', 'Loại'], ['mau', 'Màu'], ['kenh', 'Kênh']];

function bao(text, loi = false) { $('status').textContent = text; $('status').classList.toggle('error', loi); }

async function api(p) {
  let r; try { r = await fetch(p, { cache: 'no-store' }); } catch { throw Error('Mất kết nối.'); }
  let j; try { j = await r.json(); } catch { throw Error('Máy chủ chưa trả kết quả hợp lệ.'); }
  if (!r.ok || j.ok === false) throw Error(j.error || 'Chưa đọc được dữ liệu.');
  return j;
}

function loc() {
  return du.dong.filter(d =>
    (!locKenh || d.kenh === locKenh) &&
    (!tu || d.thang >= tu) && (!den || d.thang <= den) &&
    (!locTim || khongDau([d.sanPham, d.dongSP, d.mau].join(' ')).includes(locTim)));
}

function gop(rows, khoa) {
  const m = new Map();
  for (const d of rows) {
    const k = d[khoa] || '(chưa phân loại)';
    const o = m.get(k) || { sanLuong: 0, doanhThu: 0 };
    o.sanLuong += d.sanLuong; o.doanhThu += d.doanhThu; m.set(k, o);
  }
  return [...m.entries()].sort((a, b) => b[1][doTheo] - a[1][doTheo]);
}

/* ── Khối 1: cơ cấu ─────────────────────────────────────────────────────── */
function veCoCau(rows) {
  const ve = DON_VI[doTheo].ve;
  $('coCau').innerHTML = TRUC.map(([khoa, nhan]) => {
    const hang = gop(rows, khoa);
    const tong = hang.reduce((s, [, v]) => s + v[doTheo], 0) || 1;
    return `<section class="the">
      <h3>${esc(nhan)}</h3>
      ${hang.length ? hang.slice(0, 8).map(([k, v]) => {
        const pt = v[doTheo] / tong * 100;
        return `<div class="thanh-hang">
          <div class="thanh-ten" title="${esc(k)}">${esc(k)}</div>
          <div class="thanh-nen"><span style="width:${pt.toFixed(1)}%"></span></div>
          <div class="thanh-so">${ve(v[doTheo])}<small>${pt.toFixed(0)}%</small></div>
        </div>`;
      }).join('') : '<p class="trong">Chưa có dữ liệu</p>'}
      ${hang.length > 8 ? `<p class="nho mo">… và ${hang.length - 8} mục khác</p>` : ''}
    </section>`;
  }).join('');
}

/* ── Khối 2: xếp hạng ───────────────────────────────────────────────────── */
function xuHuong3T(rows, sanPham) {
  const thang = [...new Set(rows.map(d => d.thang))].sort();
  if (thang.length < 2) return null;
  const nua = Math.min(3, Math.floor(thang.length / 2));
  const sau = new Set(thang.slice(-nua)), truoc = new Set(thang.slice(-nua * 2, -nua));
  let a = 0, b = 0;
  for (const d of rows) {
    if (d.sanPham !== sanPham) continue;
    if (sau.has(d.thang)) a += d[doTheo];
    else if (truoc.has(d.thang)) b += d[doTheo];
  }
  if (!b) return a ? 1 : null;
  return (a - b) / b;
}

function veXepHang(rows) {
  const ve = DON_VI[doTheo].ve;
  const hang = gop(rows, 'sanPham');
  const tong = hang.reduce((s, [, v]) => s + v[doTheo], 0) || 1;
  const theoSP = new Map();
  for (const d of rows) {
    const o = theoSP.get(d.sanPham) || { kenh: new Map(), thang: new Set(), meta: d };
    o.kenh.set(d.kenh, (o.kenh.get(d.kenh) || 0) + d[doTheo]);
    o.thang.add(d.thang); theoSP.set(d.sanPham, o);
  }
  let luy = 0;
  $('bangHang').innerHTML = hang.map(([ten, v], i) => {
    luy += v[doTheo];
    const pt = luy / tong * 100;
    const o = theoSP.get(ten);
    const manh = [...o.kenh.entries()].sort((x, y) => y[1] - x[1])[0];
    const xh = xuHuong3T(rows, ten);
    const mui = xh == null ? '<span class="mo">—</span>'
      : xh > 0.15 ? `<span class="len">▲ ${(xh * 100).toFixed(0)}%</span>`
      : xh < -0.15 ? `<span class="xuong">▼ ${(Math.abs(xh) * 100).toFixed(0)}%</span>`
      : '<span class="mo">≈</span>';
    return `<tr class="${pt <= 80 ? '' : 'duoi-dai'}">
      <td class="hang-so">${i + 1}</td>
      <td><b>${esc(ten)}</b><span class="phu">${esc([o.meta.dongSP, o.meta.mau].filter(Boolean).join(' · '))}</span></td>
      <td>${esc(o.meta.phanKhuc || '—')}</td>
      <td class="phai">${dem(v.sanLuong)}</td>
      <td class="phai">${tien(v.doanhThu)}</td>
      <td class="phai ${pt <= 80 ? 'trong-80' : 'mo'}">${pt.toFixed(1)}%</td>
      <td>${esc(manh ? manh[0] : '—')}</td>
      <td class="giua">${mui}</td>
      <td class="mo">${esc([...o.thang].sort()[0] || '')}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="trong">Không có mã nào khớp bộ lọc.</td></tr>';

  const trong80 = hang.filter((_, i) => hang.slice(0, i + 1).reduce((s, [, v]) => s + v[doTheo], 0) / tong <= 0.8).length;
  $('tomTat').textContent = hang.length
    ? `${trong80}/${hang.length} mã tạo ra 80% ${DON_VI[doTheo].nhan.toLowerCase()}. Phần tô nhạt bên dưới là đuôi dài.`
    : '';
}

/* ── Khối 3: xu hướng ───────────────────────────────────────────────────── */
const MAU_LINE = ['#c8102e', '#2865df', '#09803c', '#b56908', '#7545dd', '#0f766e'];
function veXuHuong(rows) {
  const thang = [...new Set(rows.map(d => d.thang))].sort();
  if (thang.length < 2) {
    $('xuHuong').innerHTML = '<p class="trong">Cần ít nhất 2 tháng dữ liệu mới vẽ được xu hướng.</p>';
    return;
  }
  const dong = gop(rows, 'dongSP').slice(0, 6).map(([k]) => k);
  const chuoi = dong.map(k => thang.map(t =>
    rows.filter(d => (d.dongSP || '(chưa phân loại)') === k && d.thang === t)
        .reduce((s, d) => s + d[doTheo], 0)));
  const dinh = Math.max(1, ...chuoi.flat());
  const W = 900, H = 260, L = 52, B = 28;
  const x = i => L + i * (W - L - 10) / Math.max(1, thang.length - 1);
  const y = v => H - B - v / dinh * (H - B - 14);
  $('xuHuong').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="bieu-do" role="img" aria-label="Xu hướng theo tháng">
      ${[0, 0.5, 1].map(f => `<line x1="${L}" x2="${W - 10}" y1="${y(dinh * f)}" y2="${y(dinh * f)}" class="luoi"/>
        <text x="4" y="${y(dinh * f) + 4}" class="nhan-truc">${DON_VI[doTheo].ve(dinh * f)}</text>`).join('')}
      ${chuoi.map((c, i) => `<polyline class="duong" stroke="${MAU_LINE[i % 6]}"
         points="${c.map((v, j) => x(j) + ',' + y(v)).join(' ')}"/>`).join('')}
      ${thang.map((t, i) => `<text x="${x(i)}" y="${H - 8}" class="nhan-truc giua-text">${esc(t.slice(5))}</text>`).join('')}
    </svg>
    <div class="chu-thich">${dong.map((k, i) =>
      `<span><i style="background:${MAU_LINE[i % 6]}"></i>${esc(k)}</span>`).join('')}</div>`;
}

function ve() {
  if (!du) return;
  const rows = loc();
  $('demDong').textContent = `${rows.length} dòng dữ liệu · ${new Set(rows.map(d => d.sanPham)).size} mã sản phẩm`;
  veCoCau(rows); veXepHang(rows); veXuHuong(rows);
}

function dungBoLoc() {
  $('kenh').innerHTML = '<option value="">Tất cả kênh</option>'
    + du.kenh.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  const ts = du.thang;
  const o = t => ts.map(x => `<option value="${esc(x)}" ${x === t ? 'selected' : ''}>${esc(x)}</option>`).join('');
  tu = ts[0] || ''; den = ts[ts.length - 1] || '';
  $('tu').innerHTML = o(tu); $('den').innerHTML = o(den);
}

document.addEventListener('DOMContentLoaded', () => {
  for (const b of document.querySelectorAll('[data-do]'))
    b.onclick = () => { doTheo = b.dataset.do; for (const x of document.querySelectorAll('[data-do]')) x.setAttribute('aria-pressed', x === b); ve(); };
  $('kenh').onchange = e => { locKenh = e.target.value; ve(); };
  $('tu').onchange = e => { tu = e.target.value; ve(); };
  $('den').onchange = e => { den = e.target.value; ve(); };
  $('tim').oninput = e => { locTim = khongDau(e.target.value.trim()); ve(); };
  $('taiLai').onclick = () => nap();
  nap();
});

async function nap() {
  try {
    me = await api('/api/auth/me');
    if (!me.dangNhap) { $('status').innerHTML = 'Bạn cần <a href="/">đăng nhập Sakawin</a> để xem trang này.'; return; }
    $('who').textContent = me.ten || 'Thành viên';
    for (const a of document.querySelectorAll('[data-right]')) a.hidden = me.quyen?.[a.dataset.right] !== true;
    if (me.quyen?.xem_san_pham !== true) return bao('Tài khoản chưa được cấp quyền xem trang Sản phẩm.', true);
    du = await api('/api/san-pham');
    if (!du.dong.length) return bao('Bảng DOANH SỐ SẢN PHẨM trong Lark chưa có dòng nào. Chạy công cụ chuẩn hoá rồi dán dữ liệu vào.', true);
    $('noiDung').hidden = false;
    dungBoLoc();
    bao(`Đã đọc ${du.tong.dong} dòng từ Lark lúc ${new Date(du.capNhat).toLocaleTimeString('vi-VN')}`
      + (du.thieuCot.length ? ` · Base thiếu cột: ${du.thieuCot.join(', ')}` : ''));
    ve();
  } catch (e) { bao(e.message, true); }
}
