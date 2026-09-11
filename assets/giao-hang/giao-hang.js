'use strict';
/* Trang Giao hàng — bản mẫu. Bấm gì cũng chỉ đổi trên màn hình, chưa ghi Lark. */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const khongDau = s => String(s ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[Đđ]/g, 'd').toLowerCase();
const tien = n => !n ? '0' : n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 2 : 0).replace(/\.?0+$/, '') + ' tr'
  : Math.round(n).toLocaleString('vi-VN');
const dem = n => Math.round(n || 0).toLocaleString('vi-VN');
const NGAY = 864e5;
const CONG_GIAO = 50000;   /* bản thật đọc từ SETTING/Đối tác vận chuyển */

/* Bảy khâu — đúng luồng đã chốt. Khâu cuối suy ra từ việc đơn đã có phiên bàn
   giao hay chưa, vì "giao xong" mà tiền còn ở người giao thì chưa xong hẳn. */
/* Sáu khâu. Bỏ "Chờ xuất kho" theo ý Toàn: xếp người xong là bàn giao hàng
   cho người giao rồi đi luôn, không cần một khâu trung gian chỉ để chờ. */
const KHAU = [
  ['Chờ xác nhận', 'kho gọi khách, chốt giờ'],
  ['Đã xác nhận', 'đã chốt giờ, chờ xếp người'],
  ['Đã xếp người', 'có người giao, chờ bàn giao hàng'],
  ['Đang giao', 'đã bàn giao, đang trên đường'],
  ['Giao xong', 'tiền còn ở người giao'],
  ['Đã đóng công nợ', 'xong hẳn'],
];
const khauCua = d => d.trangThai === 'Giao xong' && d.phienBanGiao ? 'Đã đóng công nợ' : d.trangThai;
const homNayVN = () => new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);

let du = null, me = null, tab = 'hanhTrinh', khuVuc = 'HN', ngay = '', chon = null;

function bao(t, loi = false) { $('status').textContent = t; $('status').classList.toggle('error', loi); }

async function api(p) {
  let r; try { r = await fetch(p, { cache: 'no-store' }); } catch { throw Error('Mất kết nối.'); }
  let j; try { j = await r.json(); } catch { throw Error('Máy chủ chưa trả kết quả hợp lệ.'); }
  if (!r.ok || j.ok === false) throw Error(j.error || 'Chưa đọc được dữ liệu.');
  return j;
}

const luatLoai = ten => du.phanLoai.find(p => p.ten === ten) || { xepNguoi: true, canGio: true, coCod: true };
const nguoiCuaKhu = () => du.nguoiGiao.filter(n => n.khuVuc === khuVuc);
const donNgay = () => du.don.filter(d => d.ngayGiao === ngay && d.khuVuc === khuVuc);

/* ── Dải số: bốn con số trả lời "có đơn nào đang bị bỏ quên không" ─────── */
function veDaiSo() {
  const ds = du.don.filter(d => d.khuVuc === khuVuc);
  const mo = ds.filter(d => khauCua(d) !== 'Đã đóng công nợ');
  const hn = homNayVN();
  const treHan = mo.filter(d => d.ngayGiao < hn && !['Giao xong'].includes(d.trangThai));
  const chuaXacNhan = ds.filter(d => d.trangThai === 'Chờ xác nhận' && d.ngayGiao <= hn);
  const tienNgoai = ds.filter(d => d.trangThai === 'Giao xong' && !d.phienBanGiao)
    .reduce((t, d) => t + (d.thucThu || 0), 0);
  const the = (nhan, so, phu, mau) =>
    '<div class="the-so-nho ' + (mau || '') + '"><span class="con-so">' + so + '</span>'
    + '<span class="nhan-so">' + nhan + '</span><small>' + phu + '</small></div>';
  $('daiSo').innerHTML =
    the('Đơn đang mở', mo.length, 'chưa đóng công nợ', '')
    + the('Quá ngày giao', treHan.length, 'ngày giao đã qua mà chưa giao xong', treHan.length ? 'do' : '')
    + the('Chưa xác nhận', chuaXacNhan.length, 'tới hạn hôm nay hoặc đã qua', chuaXacNhan.length ? 'cam' : '')
    + the('Tiền đang ở ngoài', tien(tienNgoai), 'người giao thu rồi nhưng chưa nộp', tienNgoai ? 'cam' : '');
}

/* ── Hành trình đơn hàng — màn chính ────────────────────────────────────── */
function veHanhTrinh() {
  const ds = du.don.filter(d => d.khuVuc === khuVuc);
  const hn = homNayVN();
  $('hanhTrinh').style.gridTemplateColumns = 'repeat(' + KHAU.length + ', minmax(178px, 1fr))';
  $('hanhTrinh').innerHTML = KHAU.map(([ten, phu], iKhau) => {
    const trong = ds.filter(d => khauCua(d) === ten)
      .sort((a, b) => a.ngayGiao < b.ngayGiao ? -1 : 1);
    const coNutPhien = ten === 'Giao xong' && trong.length;
    return '<section class="cot-khau" data-i="' + iKhau + '" data-khau="' + esc(ten) + '">'
      + '<div class="dau-khau"><h4>' + esc(ten) + '</h4><span class="dem-tron">' + trong.length + '</span>'
      + '<small>' + esc(phu) + '</small>'
      + (coNutPhien ? '<button class="nut-phien" data-phien-moi="1">+ Phiên đối soát</button>' : '')
      + '</div>'
      + '<div class="than-khau">' + (trong.length ? trong.map(d => {
        const tre = d.ngayGiao < hn && d.trangThai !== 'Giao xong';
        return '<button class="the-hanh-trinh' + (tre ? ' tre' : '') + '" data-mo="' + esc(d.ma) + '">'
          + '<b>' + esc(d.ma) + '</b>'
          + '<span class="ten-khach">' + esc(d.tenKhach) + '</span>'
          + '<span class="nhan-vi-tri' + (d.quan ? '' : ' tai-kho') + '">'
          + esc(d.quan || 'khách lấy tại kho') + '</span>'
          + '<span class="dong-phu">' + esc(d.ngayGiao) + (d.khungGio ? ' · ' + esc(d.khungGio) : '') + '</span>'
          + '<span class="dong-phu">' + (d.coCod ? 'COD ' + tien(d.codPhaiThu) : 'không COD')
          + (d.nguoiGiao ? ' · ' + esc(d.nguoiGiao) : '') + '</span>'
          + (d.soHenLai ? '<span class="nhan-canh">hẹn lại ' + d.soHenLai + ' lần</span>' : '')
          + (tre ? '<span class="nhan-canh do">quá ngày giao</span>' : '')
          + '</button>';
      }).join('') : '<p class="trong">—</p>') + '</div></section>';
  }).join('');
}

/* ── Bàn điều phối ──────────────────────────────────────────────────────── */
function veHangDoi() {
  /* Chỉ xếp được đơn ĐÃ xác nhận. Trước đó hàng đợi nhận cả đơn "Chờ xác nhận"
     nên xếp một cái là nhảy thẳng qua khâu gọi khách chốt giờ — mất đúng bước
     mà cả quy trình dựa vào. */
  const ngayNay = donNgay().filter(d => d.xepNguoi && !d.nguoiGiao);
  const chuaXacNhan = ngayNay.filter(d => d.trangThai === 'Chờ xác nhận');
  const chuaXep = ngayNay.filter(d => d.trangThai !== 'Chờ xác nhận');
  $('demChuaXep').textContent = chuaXep.length;
  $('nhacXacNhan').innerHTML = chuaXacNhan.length
    ? '⚠ Còn <b>' + chuaXacNhan.length + ' đơn chưa xác nhận</b> trong ngày này. '
      + 'Gọi khách chốt giờ ở hành trình phía trên trước, rồi mới xếp được người giao.'
    : '';
  const theoQuan = new Map();
  for (const d of chuaXep) (theoQuan.get(d.quan) || theoQuan.set(d.quan, []).get(d.quan)).push(d);
  $('dsChuaXep').innerHTML = theoQuan.size
    ? [...theoQuan.entries()].sort((a, b) => b[1].length - a[1].length).map(([q, ds]) =>
      `<section class="nhom-quan"><h4>${esc(q)}<span>${ds.length} đơn</span></h4>${ds.map(d =>
        `<button class="the-don ${chon === d.ma ? 'dang-chon' : ''}" data-ma="${esc(d.ma)}">
           <b>${esc(d.ma)} · ${esc(d.tenKhach)}</b>
           <small>${esc(d.diaChi)}</small>
           <small>${esc(d.gioSaleHen || 'chưa có khung giờ')} · COD ${tien(d.codPhaiThu)}</small>
           <span class="nhan-loai ${/LẮP/.test(d.phanLoai) ? 'lap' : ''}">${esc(d.phanLoai)}</span>
         </button>`).join('')}</section>`).join('')
    : '<p class="trong">Hết đơn chờ xếp cho ngày này.</p>';
}

function veLuoi() {
  const nguoi = nguoiCuaKhu(), khung = du.khungGio;
  const trong = donNgay().filter(d => d.xepNguoi && d.nguoiGiao);
  const oCua = (n, k) => trong.filter(d => d.nguoiGiao === n && d.khungGio === k);
  const el = $('luoiXep');
  el.style.display = 'grid';
  el.style.gap = '8px';
  el.style.gridTemplateColumns = `96px repeat(${nguoi.length}, minmax(168px, 1fr))`;
  let h = '<div></div>' + nguoi.map(n => {
    const tongNgay = trong.filter(d => d.nguoiGiao === n.ten).length;
    return `<div class="o-dau">${esc(n.ten)}<small>${esc(n.loai)} · ${tongNgay} đơn hôm nay</small></div>`;
  }).join('');
  for (const k of khung) {
    h += `<div class="o-khung">${esc(k)}</div>`;
    for (const n of nguoi) {
      const ds = oCua(n.ten, k);
      const quan = [...new Set(ds.map(d => d.quan))];
      const lech = quan.length > 1;
      h += `<div class="o-xep ${lech ? 'lech-quan' : ''} ${chon ? 'nhan-duoc' : ''}"
              data-nguoi="${esc(n.ten)}" data-khung="${esc(k)}">
        ${ds.map(d => `<div class="xep-don"><b>${d.thuTu ? d.thuTu + '. ' : ''}${esc(d.ma)}</b><small>${esc(d.quan)} · ${tien(d.codPhaiThu)}</small></div>`).join('')}
        ${lech ? `<span class="canh-lech">⚠ ${quan.join(' → ')} trong cùng khung</span>` : ''}
      </div>`;
    }
  }
  el.innerHTML = h;
}

function veDieuPhoi() {
  const ds = donNgay();
  $('demNgay').textContent = `${ds.length} đơn · ${ds.filter(d => d.xepNguoi).length} cần xếp người · `
    + `${ds.filter(d => !d.xepNguoi).length} đơn thường (chuyển phát, lấy tại kho, trưng bày)`;
  veHangDoi(); veLuoi();
}

/* ── Nhập đơn ───────────────────────────────────────────────────────────── */
let loaiDangChon = '';
function veForm() {
  const L = luatLoai(loaiDangChon);
  const canDiaChi = loaiDangChon !== 'KHÁCH LẤY TẠI KHO';
  const QUAN_HN = ['Gia Lâm', 'Long Biên', 'Cầu Giấy', 'Hà Đông', 'Thanh Xuân', 'Hoàng Mai', 'Đống Đa', 'Nam Từ Liêm'];
  const QUAN_HCM = ['Quận 1', 'Quận 7', 'Bình Thạnh', 'Thủ Đức', 'Tân Bình', 'Gò Vấp'];

  const o = (nhan, ten, kieu, phu) =>
    '<label class="o-form"><span>' + nhan + '</span><input name="' + ten + '" type="' + (kieu || 'text') + '" ' + (phu || '') + '></label>';
  const oTinh = (nhan, gt) =>
    '<label class="o-form"><span>' + nhan + '</span><input class="tu-tinh" value="' + esc(gt) + '" readonly></label>';
  /* Phải đánh dấu giá trị đang chọn: form vẽ lại mỗi lần đổi phân loại, không
     giữ lại thì ô vừa chọn hiện về "— chọn —" và người nhập tưởng mình chưa chọn. */
  const oChon = (nhan, ten, ds, rong, dangChon) =>
    '<label class="o-form' + (rong ? ' rong' : '') + '"><span>' + nhan + '</span><select name="' + ten + '">'
    + '<option value="">— chọn —</option>'
    + ds.map(v => '<option' + (v === dangChon ? ' selected' : '') + '>' + esc(v) + '</option>').join('')
    + '</select></label>';

  /* Ô đầu tiên là PHÂN LOẠI vì nó quyết định các ô sau có hiện hay không. */
  const p = ['<div class="luoi-o">', oChon('PHÂN LOẠI ĐƠN *', 'phanLoai', du.phanLoai.map(x => x.ten), true, loaiDangChon), '</div>'];

  if (!loaiDangChon) {
    p.push('<p class="trong">Chọn phân loại đơn để hiện các ô còn lại.</p>');
    $('formDon').innerHTML = p.join('');
    return;
  }

  p.push('<div class="luoi-o">');
  p.push(oChon('Kho xuất *', 'kho', khuVuc === 'HN' ? ['Kho Hà Nội'] : ['Kho HCM']));
  p.push(oTinh('Mã đơn', 'hệ thống tự sinh khi lưu'));
  p.push(oTinh('Ngày chốt đơn', new Date().toLocaleDateString('vi-VN')));
  p.push(oTinh('Người lên đơn', me.ten || ''));
  p.push(oChon('Kênh *', 'kenh', ['Shopee', 'TikTok', 'Facebook', 'Showroom', 'Website', 'Zalo', 'Sỉ', 'KOL', 'AEON', 'Đơn ngoài']));
  p.push(oChon('Shop / Tài khoản', 'shop', ['Shopee Hà Nội', 'Shopee HCM', 'Shopee FlagShip', 'Tiktok Sakawin Việt Nam', 'Zalo Hotline', 'Đơn Showroom', 'Website']));
  p.push(o('Tên khách *', 'tenKhach'));
  p.push(o('SĐT *', 'sdt', 'tel'));
  if (canDiaChi) {
    p.push(oChon('Quận / Huyện *', 'quan', khuVuc === 'HN' ? QUAN_HN : QUAN_HCM));
    p.push(o('Địa chỉ *', 'diaChi'));
  }
  if (L.xepNguoi) p.push(o('Ngày giao *', 'ngayGiao', 'date'));
  if (L.canGio) {
    p.push(oChon('Khung giờ *', 'khungGio', du.khungGio));
    p.push(o('Giờ cụ thể (chỉ khi khách ép giờ)', 'gioCuThe', 'time'));
  }
  p.push(o('Tổng đơn (VNĐ) *', 'tongDon', 'number', 'min="0" step="1000"'));
  p.push(o('Cọc (VNĐ)', 'coc', 'number', 'min="0" step="1000" value="0"'));
  if (L.coCod) p.push(oTinh('COD phải thu', 'tự tính = Tổng đơn − Cọc'));
  p.push('<label class="o-form rong"><span>Ghi chú đơn (quà tặng campaign, lưu ý khách…)</span><textarea name="ghiChu"></textarea></label>');
  p.push('</div>');

  p.push('<div class="khoi-sp"><h3 style="font-size:14px">Sản phẩm của đơn</h3><div id="dsSanPham"></div>'
    + '<button type="button" class="button nho-nut" id="themSP">+ Thêm dòng sản phẩm</button></div>');
  p.push('<div class="viec-form"><button type="button" class="button primary" id="luuDon">Lưu đơn hàng</button><small class="mo">'
    + (L.xepNguoi ? 'Lưu xong, đơn vào hàng đợi "Chưa xếp" ở Bàn điều phối.'
                  : 'Đơn thường — không qua bàn điều phối, không đối soát COD với người giao.')
    + '</small></div>');

  $('formDon').innerHTML = p.join('');
  dongSanPham(1);
  noiForm();
}

function dongSanPham(n) {
  const el = $('dsSanPham');
  const so = el.querySelectorAll('.dong-sp').length;
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'dong-sp';
    d.innerHTML = `
      <label class="o-form"><span>Sản phẩm</span><input name="sp" list="dsSP" placeholder="gõ tên hoặc mã, không có thì gõ tự do"></label>
      <label class="o-form"><span>Mã</span><input class="tu-tinh" name="maSP" readonly></label>
      <label class="o-form"><span>Số lượng</span><input name="slSP" type="number" value="1" min="1"></label>
      <button type="button" class="icon-button" data-xoa-dong="1">Xoá</button>`;
    el.appendChild(d);
  }
  if (!so) el.insertAdjacentHTML('afterbegin',
    '<datalist id="dsSP">' + [...new Set(du.don.flatMap(d => d.sanPham.map(s => s.ten + ' — ' + s.ma)))].map(x => `<option>${esc(x)}</option>`).join('') + '</datalist>');
}

function noiForm() {
  $('themSP').onclick = () => dongSanPham(1);
  $('luuDon').onclick = () => bao('Bản mẫu — chưa nối Lark nên đơn không được lưu. Chốt tính năng xong, tạo base rồi nút này ghi thật.', true);
  $('dsSanPham').onclick = e => { const b = e.target.closest('[data-xoa-dong]'); if (b) b.closest('.dong-sp').remove(); };
}

/* ── Sổ công nợ ─────────────────────────────────────────────────────────── */
function veCongNo() {
  const xong = du.don.filter(d => d.trangThai === 'Giao xong' && d.coCod && d.nguoiGiao && d.khuVuc === khuVuc);
  const chuaDong = xong.filter(d => !d.phienBanGiao);
  /* Tiền khách CHUYỂN THẲNG về công ty thì người giao không cầm — trước đó sổ
     cộng hết vào "đang cầm" nên ai cũng nợ oan. Chỉ tiền mặt mới là nợ thật;
     phần chuyển khoản chỉ cần đối chiếu sao kê. */
  const theoNguoi = new Map();
  for (const d of chuaDong) {
    const o = theoNguoi.get(d.nguoiGiao)
      || { don: 0, tienMat: 0, daVeCty: 0, chuaKiem: 0, cuNhat: d.ngayGiao, loai: d.loaiNguoiGiao };
    o.don++;
    if (d.hinhThuc === 'Tiền mặt') o.tienMat += d.thucThu || 0;
    else { o.daVeCty += d.thucThu || 0; if (!d.daKiemSaoKe) o.chuaKiem += d.thucThu || 0; }
    if (d.ngayGiao < o.cuNhat) o.cuNhat = d.ngayGiao;
    theoNguoi.set(d.nguoiGiao, o);
  }
  const homNay = new Date().toISOString().slice(0, 10);
  const soNgay = t => Math.max(0, Math.round((Date.parse(homNay) - Date.parse(t)) / NGAY));
  $('dauThu').innerHTML = '<tr><th>Người giao</th><th>Loại</th><th class="phai">Số đơn</th>'
    + '<th class="phai">Tiền mặt đang cầm</th><th class="phai">Đã về công ty</th>'
    + '<th class="phai">Cầm lâu nhất</th><th></th></tr>';
  $('bangThu').innerHTML = theoNguoi.size ? [...theoNguoi.entries()].sort((a, b) => b[1].tienMat - a[1].tienMat).map(([n, o]) => {
    const nd = soNgay(o.cuNhat);
    return `<tr><td><b>${esc(n)}</b></td><td class="mo">${esc(o.loai)}</td>
      <td class="phai">${o.don}</td>
      <td class="phai tien ${o.tienMat ? 'gio-lau' : ''}">${tien(o.tienMat)}</td>
      <td class="phai tien">${tien(o.daVeCty)}${o.chuaKiem ? '<small class="chua-kiem">' + tien(o.chuaKiem) + ' chưa kiểm sao kê</small>' : ''}</td>
      <td class="phai ${nd >= 3 ? 'gio-lau' : ''}">${nd} ngày</td>
      <td class="phai"><button class="button nho-nut" data-phien="${esc(n)}">Mở phiên đối soát</button></td></tr>`;
  }).join('') : '<tr><td colspan="7" class="trong">Không còn ai cầm tiền chưa nộp.</td></tr>';

  const doiTac = new Map();
  for (const d of xong.filter(d => d.loaiNguoiGiao === 'Đối tác')) {
    const o = doiTac.get(d.nguoiGiao) || { don: 0, cod: 0 };
    o.don++; o.cod += d.phienBanGiao ? 0 : (d.thucThu || 0);
    doiTac.set(d.nguoiGiao, o);
  }
  $('dauTra').innerHTML = '<tr><th>Đối tác</th><th class="phai">Đơn đã giao</th><th class="phai">Công giao</th><th class="phai">COD đang cầm</th><th class="phai">Thực nhận nếu chốt</th></tr>';
  $('bangTra').innerHTML = doiTac.size ? [...doiTac.entries()].map(([n, o]) => {
    const cong = o.don * CONG_GIAO;
    return `<tr><td><b>${esc(n)}</b></td><td class="phai">${o.don}</td>
      <td class="phai tien">${tien(cong)}</td><td class="phai tien">${tien(o.cod)}</td>
      <td class="phai tien ${o.cod - cong < 0 ? 'gio-lau' : 'tot'}">${tien(o.cod - cong)}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="trong">Khu vực này chưa có đối tác nào giao đơn.</td></tr>';

  vePhien();
  $('ghiChuCanTru').innerHTML = `<b>Cấn trừ với đối tác:</b> họ cầm COD của khách, công ty lại nợ họ công giao — `
    + `nên phiên bàn giao ghi cả ba con số <b>COD nộp về · công giao được trừ · thực nhận</b>. `
    + `Công giao ${dem(CONG_GIAO)} đ/đơn ở đây là số giả; bản thật đọc từ bảng SETTING theo từng đối tác.`;
}

function vePhien() {
  const ds = (du.phien || []).filter(p => p.khuVuc === khuVuc).sort((a, b) => a.ma < b.ma ? 1 : -1);
  $('dauPhien').innerHTML = '<tr><th>Mã phiên</th><th>Ngày</th><th>Người nộp</th><th>Loại</th>'
    + '<th class="phai">Số đơn</th><th class="phai">Tiền mặt nộp</th><th class="phai">Công giao trừ</th>'
    + '<th class="phai">Thực nhận</th><th>Nộp bằng</th><th></th></tr>';
  $('bangPhien').innerHTML = ds.length ? ds.map(p =>
    `<tr><td><b>${esc(p.ma)}</b></td><td>${esc(p.ngay)}</td><td>${esc(p.nguoi)}</td>
      <td class="mo">${esc(p.loai)}</td><td class="phai">${p.soDon}</td>
      <td class="phai tien">${tien(p.tienMat)}</td>
      <td class="phai tien">${p.congGiao ? '− ' + tien(p.congGiao) : '—'}</td>
      <td class="phai tien ${p.thucNhan >= 0 ? 'tot' : 'gio-lau'}">${p.thucNhan >= 0 ? tien(p.thucNhan) : 'phải trả ' + tien(-p.thucNhan)}</td>
      <td class="nho mo">${esc(p.hinhThucNop)}<br>${esc(p.taiKhoan)}</td>
      <td class="phai"><button class="button nho-nut" data-xem-phien="${esc(p.ma)}">Xem đơn</button></td></tr>`
  ).join('') : '<tr><td colspan="10" class="trong">Chưa có phiên nào được đóng ở khu vực này.</td></tr>';
}

function moXemPhien(ma) {
  const p = (du.phien || []).find(x => x.ma === ma);
  const ds = du.don.filter(d => d.phienBanGiao === ma);
  if (!p) return;
  const h = (nhan, gt) => '<div class="hang-xem"><span>' + nhan + '</span><b>' + esc(gt) + '</b></div>';
  $('tieuDeHop').innerHTML = 'Phiên ' + esc(ma) + '<span class="nhan-khau">đã đóng</span>';
  $('thanHop').innerHTML = '<div class="hai-cot-xem">'
    + '<section class="cot-tin"><h4>Phiên</h4>'
    + h('Ngày', p.ngay) + h('Người nộp', p.nguoi + ' · ' + p.loai)
    + h('Người nhận tiền', p.nguoiNhan || '—')
    + h('Nộp bằng', p.hinhThucNop) + h('Tài khoản nhận', p.taiKhoan) + '</section>'
    + '<section class="cot-tin"><h4>Tiền</h4>'
    + h('Số đơn', p.soDon + ' đơn') + h('Tiền mặt nộp', dem(p.tienMat) + ' đ')
    + h('Khách đã chuyển về công ty', dem(p.veCty || 0) + ' đ')
    + (p.congGiao ? h('Công giao được trừ', '− ' + dem(p.congGiao) + ' đ') : '')
    + (p.thucNhan >= 0 ? h('Thực nhận', dem(p.thucNhan) + ' đ')
        : h('Công ty phải trả thêm', dem(-p.thucNhan) + ' đ')) + '</section></div>'
    + '<div class="cuon-bang" style="margin-top:16px"><table class="bang"><thead><tr>'
    + '<th>Mã đơn</th><th>Ngày giao</th><th>Khách</th><th>Vị trí</th><th>Hình thức</th><th class="phai">Thực thu</th>'
    + '</tr></thead><tbody>'
    + ds.map(d => '<tr><td><b>' + esc(d.ma) + '</b></td><td>' + esc(d.ngayGiao) + '</td>'
      + '<td>' + esc(d.tenKhach) + '</td><td>' + esc(d.quan || 'lấy tại kho') + '</td>'
      + '<td>' + esc(d.hinhThuc || '—') + '</td><td class="phai tien">' + dem(d.thucThu) + '</td></tr>').join('')
    + '</tbody></table></div>'
    + '<p class="canh-bao">Phiên đã đóng — không sửa lùi được. Muốn điều chỉnh phải mở phiên mới.</p>';
  $('hop').showModal();
}

/* ── Năng suất ──────────────────────────────────────────────────────────── */
function veNangSuat() {
  const soNgay = Number($('kyNangSuat').value);
  const tu = new Date(Date.now() - soNgay * NGAY).toISOString().slice(0, 10);
  const ds = du.don.filter(d => d.khuVuc === khuVuc && d.nguoiGiao && d.ngayGiao >= tu);
  const m = new Map();
  for (const d of ds) {
    const o = m.get(d.nguoiGiao) || { loai: d.loaiNguoiGiao, don: 0, xong: 0, henLai: 0, thu: 0, dangCam: 0 };
    o.don++;
    if (d.trangThai === 'Giao xong') { o.xong++; o.thu += d.thucThu || 0; if (!d.phienBanGiao) o.dangCam += d.thucThu || 0; }
    if (d.soHenLai) o.henLai++;
    m.set(d.nguoiGiao, o);
  }
  $('dauNS').innerHTML = '<tr><th>Người giao</th><th>Loại</th><th class="phai">Đơn nhận</th><th class="phai">Đã giao xong</th>'
    + '<th class="phai">Phải hẹn lại</th><th class="phai">Đúng hẹn lần đầu</th><th class="phai">COD đã thu</th><th class="phai">Đang cầm</th></tr>';
  $('bangNS').innerHTML = m.size ? [...m.entries()].sort((a, b) => b[1].don - a[1].don).map(([n, o]) => {
    const pt = o.don ? (o.don - o.henLai) / o.don * 100 : 0;
    return `<tr><td><b>${esc(n)}</b></td><td class="mo">${esc(o.loai)}</td>
      <td class="phai">${o.don}</td><td class="phai">${o.xong}</td>
      <td class="phai ${o.henLai ? 'gio-lau' : ''}">${o.henLai}</td>
      <td class="phai ${pt >= 90 ? 'tot' : ''}">${pt.toFixed(0)}%</td>
      <td class="phai tien">${tien(o.thu)}</td>
      <td class="phai tien ${o.dangCam ? 'gio-lau' : ''}">${tien(o.dangCam)}</td></tr>`;
  }).join('') : '<tr><td colspan="8" class="trong">Chưa có đơn nào trong kỳ này.</td></tr>';
}

/* ── Khung chung ────────────────────────────────────────────────────────── */
function ve() {
  if (!du) return;
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', b.dataset.tab === tab);
  for (const p of document.querySelectorAll('.pan')) p.hidden = true;
  $('pan' + tab[0].toUpperCase() + tab.slice(1)).hidden = false;
  for (const b of document.querySelectorAll('[data-kv]')) b.setAttribute('aria-selected', b.dataset.kv === khuVuc);
  if (tab === 'hanhTrinh') { veDaiSo(); veHanhTrinh(); veDieuPhoi(); }
  else if (tab === 'nhapDon') veForm();
  else if (tab === 'congNo') veCongNo();
  else veNangSuat();
}

function doiNgay(buoc) {
  const ds = [...new Set(du.don.map(d => d.ngayGiao))].sort();
  const i = ds.indexOf(ngay);
  ngay = ds[Math.min(ds.length - 1, Math.max(0, i + buoc))];
  $('ngay').value = ngay; ve();
}

document.addEventListener('DOMContentLoaded', () => {
  for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => { tab = b.dataset.tab; chon = null; ve(); };
  for (const b of document.querySelectorAll('[data-kv]')) b.onclick = () => { khuVuc = b.dataset.kv; chon = null; loaiDangChon = ''; ve(); };
  $('taiLai').onclick = () => nap();
  $('ngayTruoc').onclick = () => doiNgay(-1);
  $('ngaySau').onclick = () => doiNgay(1);
  $('ngay').onchange = e => { ngay = e.target.value; ve(); };
  $('kyNangSuat').onchange = () => veNangSuat();
  $('dongHop').onclick = () => $('hop').close();

  document.addEventListener('click', e => {
    const t = e.target.closest('.the-don');
    if (t) { chon = chon === t.dataset.ma ? null : t.dataset.ma; veDieuPhoi(); return; }
    const o = e.target.closest('.o-xep');
    if (o && chon) {
      const d = du.don.find(x => x.ma === chon);
      d.nguoiGiao = o.dataset.nguoi; d.khungGio = o.dataset.khung;
      d.loaiNguoiGiao = (du.nguoiGiao.find(n => n.ten === d.nguoiGiao) || {}).loai || '';
      d.trangThai = 'Đã xếp người';
      d.thuTu = du.don.filter(x => x.ngayGiao === d.ngayGiao && x.nguoiGiao === d.nguoiGiao && x.khungGio === d.khungGio).length;
      chon = null;
      ve();   /* vẽ lại cả dải số và hành trình, không chỉ bàn điều phối */
      bao('Đã xếp trên màn hình. Bản mẫu chưa nối Lark nên tải lại trang là mất.');
      return;
    }
    const m = e.target.closest('[data-mo]');
    if (m) { moDon(m.dataset.mo); return; }
    const xp = e.target.closest('[data-xem-phien]');
    if (xp) { moXemPhien(xp.dataset.xemPhien); return; }
    const pm = e.target.closest('[data-phien-moi]');
    if (pm) { moPhienDoiSoat(); return; }
    const p = e.target.closest('[data-phien]');
    if (p) { $('hop').close(); moPhienDoiSoat(p.dataset.phien); }
  });
  $('formDon').addEventListener('change', e => {
    if (e.target.name === 'phanLoai') { loaiDangChon = e.target.value; veForm(); }
  });
  nap();
});

/* Mở một đơn: chỉ hiện đúng việc của khâu nó đang ở, không bày hết mọi nút
   rồi để người dùng đoán cái nào bấm được. "Hẹn lại" có ở mọi khâu từ lúc đã
   xác nhận tới lúc đang giao, vì khách đổi giờ lúc nào cũng có thể xảy ra. */
function moDon(ma) {
  const d = du.don.find(x => x.ma === ma);
  if (!d) return;
  const khau = khauCua(d);
  const nguoiKhu = du.nguoiGiao.filter(n => n.khuVuc === khuVuc);

  const hang = (nhan, gt, dam) =>
    '<div class="hang-xem"><span>' + nhan + '</span><b' + (dam ? ' class="to"' : '') + '>' + esc(gt) + '</b></div>';
  const oChonNguoi = () => '<label class="o-form"><span>Người giao</span><select id="chonNguoi">'
    + '<option value="">— chọn người giao —</option>'
    + nguoiKhu.map(n => '<option' + (n.ten === d.nguoiGiao ? ' selected' : '') + '>' + esc(n.ten) + ' (' + esc(n.loai) + ')</option>').join('')
    + '</select></label>';
  const oChonKhung = () => '<label class="o-form"><span>Khung giờ</span><select id="chonKhung">'
    + du.khungGio.map(k => '<option' + (k === (d.khungGio || d.gioSaleHen) ? ' selected' : '') + '>' + esc(k) + '</option>').join('')
    + '</select></label>';

  const p = [];
  p.push('<div class="hai-cot-xem">');

  /* Cột trái — thông tin đơn, đủ hết, không phải rê chuột đoán */
  p.push('<section class="cot-tin"><h4>Thông tin đơn</h4>');
  p.push(hang('Khâu hiện tại', khau, true));
  p.push(hang('Phân loại', d.phanLoai, true));
  p.push(hang('Kho xuất', d.khoXuat));
  p.push(hang('Kênh · Shop', d.kenh + ' · ' + d.shop));
  p.push(hang('Sale chốt đơn', d.sale));
  p.push(hang('Khách', d.tenKhach));
  p.push(hang('Số điện thoại', d.sdt, true));
  if (d.diaChi) p.push(hang('Địa chỉ', d.diaChi + ', ' + d.quan));
  else p.push(hang('Địa chỉ', 'khách tự đến kho lấy'));
  p.push(hang('Ngày giao', d.ngayGiao, true));
  if (d.canGio) {
    p.push(hang('Giờ sale hẹn', d.gioSaleHen || '—'));
    p.push(hang('Giờ kho chốt', d.khungGio || 'chưa chốt', !!d.khungGio));
  }
  if (d.nguoiGiao) p.push(hang('Người giao', d.nguoiGiao + ' · ' + d.loaiNguoiGiao, true));
  if (d.soHenLai) p.push(hang('Đã hẹn lại', d.soHenLai + ' lần · ' + d.lyDoHenLai));
  if (d.phienBanGiao) p.push(hang('Phiên bàn giao', d.phienBanGiao));
  p.push('</section>');

  /* Cột phải — tiền và sản phẩm */
  p.push('<section class="cot-tin"><h4>Tiền</h4>');
  p.push(hang('Tổng đơn', dem(d.tongDon) + ' đ', true));
  p.push(hang('Cọc đã nhận', dem(d.coc) + ' đ'));
  if (d.coCod) p.push(hang('COD phải thu', dem(d.codPhaiThu) + ' đ', true));
  else p.push(hang('COD', 'đơn này không thu tiền'));
  if (d.thucThu != null) {
    p.push(hang('Thực thu', dem(d.thucThu) + ' đ', true));
    p.push(hang('Hình thức', d.hinhThuc || '—'));
    if (d.hinhThuc === 'Chuyển khoản về công ty')
      p.push(hang('Đã kiểm sao kê', d.daKiemSaoKe ? 'đã kiểm' : 'CHƯA KIỂM', true));
  }
  p.push('<h4 style="margin-top:16px">Sản phẩm</h4>');
  p.push(d.sanPham.map(x => '<div class="dong-xem"><b>' + esc(x.ten) + '</b>'
    + '<span class="mo"> ' + esc(x.ma) + '</span> × ' + x.soLuong + '</div>').join(''));
  if (d.ghiChu) p.push('<div class="ghi-chu-don"><b>Ghi chú:</b> ' + esc(d.ghiChu) + '</div>');
  p.push('</section></div>');

  /* Việc của từng khâu — mỗi khâu đúng một việc chính */
  const nut = [];
  if (khau === 'Chờ xác nhận') {
    p.push('<div class="khoi-viec"><h4>Xác nhận đơn với khách</h4>'
      + '<label class="tick"><input type="checkbox" id="tickGoi"> Đã gọi khách xác nhận</label>'
      + '<label class="tick"><input type="checkbox" id="tickHang"> Đủ hàng trong kho</label>'
      + (d.canGio ? '<div class="luoi-o" style="margin-top:12px">' + oChonKhung() + '</div>' : '')
      + '</div>');
    nut.push(['xacNhan', 'Xác nhận đơn', true]);
  } else if (khau === 'Đã xác nhận') {
    if (d.xepNguoi) {
      p.push('<div class="khoi-viec"><h4>Xếp người giao</h4>'
        + '<div class="luoi-o">' + oChonNguoi() + (d.canGio ? oChonKhung() : '') + '</div>'
        + '<p class="nho mo" style="margin-top:9px">Hoặc xếp ở bàn điều phối bên dưới để nhìn được cả tuyến theo quận.</p></div>');
      nut.push(['xepNguoi', 'Xếp người giao', true]);
    } else {
      p.push('<div class="khoi-viec"><h4>Khách đến kho lấy hàng</h4>'
        + '<p class="nho mo">Đơn này không cần người giao. Khách nhận hàng xong thì bấm bên dưới.</p></div>');
      nut.push(['khachNhan', 'Khách đã nhận hàng', true]);
    }
    if (d.canGio) nut.push(['henLai', 'Hẹn lại giờ', false]);
  } else if (khau === 'Đã xếp người') {
    p.push('<div class="khoi-viec"><h4>Bàn giao hàng cho người giao</h4>'
      + '<p class="nho mo">Bấm khi hàng đã ra khỏi kho và người giao đã cầm hàng — đơn nhảy sang <b>Đang giao</b>.</p>'
      + '<details style="margin-top:11px"><summary class="nho">Đổi người giao / đổi khung giờ</summary>'
      + '<div class="luoi-o" style="margin-top:10px">' + oChonNguoi() + (d.canGio ? oChonKhung() : '') + '</div>'
      + '<button class="button nho-nut" data-lam="xepNguoi" style="margin-top:9px">Lưu người giao mới</button>'
      + '</details></div>');
    nut.push(['banGiao', 'BÀN GIAO HÀNG', true]);
    if (d.canGio) nut.push(['henLai', 'Hẹn lại giờ', false]);
  } else if (khau === 'Đang giao') {
    p.push('<div class="khoi-viec"><h4>Giao xong</h4><div class="luoi-o">'
      + (d.coCod ? '<label class="o-form"><span>Thực thu (VNĐ)</span><input id="thucThu" type="number" value="' + d.codPhaiThu + '"></label>'
        + '<label class="o-form"><span>Hình thức khách trả</span><select id="hinhThuc">'
        + '<option>Tiền mặt</option><option>Chuyển khoản về công ty</option><option>Quét QR</option></select></label>' : '')
      + '<label class="o-form rong"><span>Ảnh xác nhận đã giao / đã lắp</span><input type="file" accept="image/*"></label>'
      + '</div></div>');
    nut.push(['giaoXong', 'Giao xong', true]);
    if (d.canGio) nut.push(['henLai', 'Hẹn lại giờ', false]);
  } else if (khau === 'Giao xong') {
    p.push('<div class="khoi-viec"><p class="nho mo">Đã giao, tiền còn ở <b>' + esc(d.nguoiGiao || 'kho') + '</b>. '
      + 'Đóng công nợ theo phiên để chốt nhiều đơn một lúc.</p>'
      + (d.nguoiGiao ? '<div class="viec-form"><button class="button" data-phien="' + esc(d.nguoiGiao) + '">Mở phiên bàn giao</button></div>' : '')
      + '</div>');
  } else {
    p.push('<div class="khoi-viec"><p class="nho mo">Đơn đã đóng công nợ ở phiên <b>' + esc(d.phienBanGiao) + '</b> — không sửa lùi được.</p></div>');
  }

  if (nut.length) p.push('<div class="viec-form">'
    + nut.map(([v, t, chinh]) => '<button class="button' + (chinh ? ' primary' : '') + '" data-lam="' + v + '">' + t + '</button>').join('')
    + '<small class="mo">Bản mẫu — chưa nối Lark, tải lại trang là mất.</small></div>');

  $('tieuDeHop').innerHTML = esc(d.ma) + ' · ' + esc(d.tenKhach)
    + '<span class="nhan-khau">' + esc(khau) + '</span>';
  $('thanHop').innerHTML = p.join('');
  $('hop').showModal();

  $('thanHop').onclick = e => {
    const b = e.target.closest('[data-lam]');
    if (!b) return;
    const viec = b.dataset.lam;
    if (viec === 'xacNhan') {
      if (!$('tickGoi').checked || !$('tickHang').checked)
        return bao('Chưa tích đủ: cần gọi khách xác nhận và kiểm đủ hàng.', true);
      if ($('chonKhung')) d.khungGio = $('chonKhung').value;
      d.trangThai = 'Đã xác nhận';
    } else if (viec === 'xepNguoi') {
      const n = $('chonNguoi').value.replace(/ \(.*\)$/, '');
      if (!n) return bao('Chưa chọn người giao.', true);
      d.nguoiGiao = n;
      d.loaiNguoiGiao = (du.nguoiGiao.find(x => x.ten === n) || {}).loai || '';
      if ($('chonKhung')) d.khungGio = $('chonKhung').value;
      d.thuTu = du.don.filter(x => x.ngayGiao === d.ngayGiao && x.nguoiGiao === n && x.khungGio === d.khungGio).length;
      d.trangThai = 'Đã xếp người';
    } else if (viec === 'banGiao') {
      d.trangThai = 'Đang giao';
    } else if (viec === 'khachNhan') {
      d.thucThu = d.coCod ? d.codPhaiThu : 0;
      d.hinhThuc = d.coCod ? 'Tiền mặt' : '';
      d.trangThai = 'Giao xong';
    } else if (viec === 'giaoXong') {
      d.thucThu = d.coCod ? Number($('thucThu').value || 0) : 0;
      d.hinhThuc = d.coCod ? $('hinhThuc').value : '';
      d.trangThai = 'Giao xong';
    } else if (viec === 'henLai') {
      const ly = prompt('Nguyên nhân hẹn lại?\n1 = Khách đổi giờ\n2 = Kho thiếu hàng\n3 = Shipper không kịp', '1');
      if (!ly) return;
      d.lyDoHenLai = ({ '1': 'Khách đổi giờ', '2': 'Kho thiếu hàng', '3': 'Shipper không kịp' })[ly.trim()] || 'Khách đổi giờ';
      d.soHenLai = (d.soHenLai || 0) + 1;
      d.trangThai = d.nguoiGiao ? 'Đã xếp người' : 'Đã xác nhận';
    }
    $('hop').close();
    ve();
    bao('Đã đổi trên màn hình. Bản mẫu chưa nối Lark nên tải lại trang là mất.');
  };
}

/* Số tài khoản nhận — bản thật đọc từ SETTING, ở đây là số giả. */
const TAI_KHOAN = ['ACB · 1234567890 · SAKAWIN GLOBAL', 'Vietcombank · 0987654321 · SAKAWIN GLOBAL'];

/* Phiên đối soát: chốt nhiều đơn đã giao xong của MỘT người giao thành một lần
   bàn giao tiền. Điểm quan trọng là tách rõ tiền mặt người giao đang cầm với
   tiền khách đã chuyển thẳng về công ty — chỉ phần tiền mặt mới là nợ phải nộp,
   phần chuyển khoản chỉ cần đối chiếu sao kê. */
function moPhienDoiSoat(nguoiMacDinh) {
  const chuaDong = () => du.don.filter(d => d.khuVuc === khuVuc && d.trangThai === 'Giao xong'
    && d.coCod && d.nguoiGiao && !d.phienBanGiao);
  const dsNguoi = [...new Set(chuaDong().map(d => d.nguoiGiao))];
  if (!dsNguoi.length) { bao('Không còn đơn nào đã giao xong mà chưa đóng phiên.', true); return; }
  let nguoi = dsNguoi.includes(nguoiMacDinh) ? nguoiMacDinh : dsNguoi[0];

  const veHop = () => {
    const ds = chuaDong().filter(d => d.nguoiGiao === nguoi);
    const laDoiTac = (du.nguoiGiao.find(n => n.ten === nguoi) || {}).loai === 'Đối tác';
    const p = [];
    p.push('<div class="luoi-o"><label class="o-form"><span>Người giao / đối tác</span><select id="phienNguoi">'
      + dsNguoi.map(n => '<option' + (n === nguoi ? ' selected' : '') + '>' + esc(n) + '</option>').join('')
      + '</select></label></div>');

    p.push('<div class="cuon-bang" style="margin-top:14px;max-height:34vh"><table class="bang"><thead><tr>'
      + '<th style="width:34px"></th><th>Mã đơn</th><th>Ngày giao</th><th>Khách</th>'
      + '<th>Hình thức</th><th class="phai">Thực thu</th></tr></thead><tbody>'
      + ds.map(d => '<tr><td><input type="checkbox" class="tick-don" data-ma="' + esc(d.ma) + '" checked></td>'
        + '<td><b>' + esc(d.ma) + '</b></td><td>' + esc(d.ngayGiao) + '</td>'
        + '<td>' + esc(d.tenKhach) + '</td>'
        + '<td>' + esc(d.hinhThuc || '—')
        + (d.hinhThuc !== 'Tiền mặt' && !d.daKiemSaoKe ? ' <span class="nhan-canh">chưa kiểm sao kê</span>' : '')
        + '</td><td class="phai tien">' + dem(d.thucThu) + '</td></tr>').join('')
      + '</tbody></table></div>');

    p.push('<div id="tongPhien" class="tong-phien"></div>');

    p.push('<div class="luoi-o" style="margin-top:14px">'
      + '<label class="o-form"><span>Nộp bằng</span><select id="phienHinhThuc">'
      + '<option>Chuyển khoản</option><option>Tiền mặt</option></select></label>'
      + '<label class="o-form"><span>Số tài khoản nhận</span><select id="phienTaiKhoan">'
      + TAI_KHOAN.map(t => '<option>' + esc(t) + '</option>').join('') + '</select></label>'
      + '<label class="o-form rong"><span>Ảnh sao kê / biên nhận</span><input type="file" accept="image/*"></label>'
      + '</div>');

    p.push('<p class="canh-bao">Đóng phiên rồi thì <b>không sửa lùi được</b> — muốn điều chỉnh phải mở phiên mới, '
      + 'có dấu vết. Người nộp tiền không tự xác nhận được phiên của chính mình.</p>');
    p.push('<div class="viec-form"><button class="button primary" id="taoPhien">Tạo phiên đối soát</button>'
      + '<small class="mo">Bản mẫu — chưa ghi Lark.</small></div>');

    $('tieuDeHop').innerHTML = 'Phiên đối soát công nợ<span class="nhan-khau">' + esc(nguoi) + '</span>';
    $('thanHop').innerHTML = p.join('');

    const tinhTong = () => {
      const chonMa = new Set([...document.querySelectorAll('.tick-don:checked')].map(x => x.dataset.ma));
      const co = ds.filter(d => chonMa.has(d.ma));
      const tienMat = co.filter(d => d.hinhThuc === 'Tiền mặt').reduce((t, d) => t + (d.thucThu || 0), 0);
      const veCty = co.filter(d => d.hinhThuc !== 'Tiền mặt').reduce((t, d) => t + (d.thucThu || 0), 0);
      const chuaKiem = co.filter(d => d.hinhThuc !== 'Tiền mặt' && !d.daKiemSaoKe).length;
      const cong = laDoiTac ? co.length * CONG_GIAO : 0;
      const d = (nhan, gt, kieu) => '<div class="dong-tong ' + (kieu || '') + '"><span>' + nhan + '</span><b>' + gt + '</b></div>';
      $('tongPhien').innerHTML =
        d('Số đơn trong phiên', co.length + ' / ' + ds.length + ' đơn')
        + d('Tổng COD đã thu', dem(tienMat + veCty) + ' đ')
        + d('· Tiền mặt — người giao đang cầm', dem(tienMat) + ' đ', 'nhan-manh')
        + d('· Khách đã chuyển về công ty', dem(veCty) + ' đ'
            + (chuaKiem ? ' <span class="nhan-canh">' + chuaKiem + ' đơn chưa kiểm sao kê</span>' : ''))
        + (laDoiTac ? d('Công giao được trừ (' + dem(CONG_GIAO) + ' đ × ' + co.length + ')', '− ' + dem(cong) + ' đ') : '')
        + (tienMat - cong >= 0
            ? d('THỰC NHẬN TRONG PHIÊN', dem(tienMat - cong) + ' đ', 'tong-cuoi')
            /* Âm nghĩa là khách đã chuyển khoản hết nên đối tác không cầm tiền mặt,
               mà công ty vẫn nợ họ công giao — ghi "thực nhận −100.000" thì dễ đọc
               sai thành thu được tiền. Đảo nhãn cho khỏi nhầm. */
            : d('CÔNG TY PHẢI TRẢ THÊM', dem(cong - tienMat) + ' đ', 'tong-cuoi phai-tra'));
      $('taoPhien').disabled = !co.length;
    };
    $('thanHop').addEventListener('change', e => {
      if (e.target.id === 'phienNguoi') { nguoi = e.target.value; veHop(); return; }
      if (e.target.classList.contains('tick-don')) tinhTong();
    });
    $('taoPhien').onclick = () => {
      const chonMa = new Set([...document.querySelectorAll('.tick-don:checked')].map(x => x.dataset.ma));
      if (!chonMa.size) return bao('Chưa chọn đơn nào.', true);
      const ma = 'PH-' + new Date().toISOString().slice(2, 7).replace('-', '') + '-'
        + String(new Set(du.don.map(x => x.phienBanGiao).filter(Boolean)).size + 1).padStart(2, '0');
      const co = ds.filter(d => chonMa.has(d.ma));
      const tienMat = co.filter(d => d.hinhThuc === 'Tiền mặt').reduce((t, d) => t + (d.thucThu || 0), 0);
      const veCty = co.filter(d => d.hinhThuc !== 'Tiền mặt').reduce((t, d) => t + (d.thucThu || 0), 0);
      const cong = laDoiTac ? co.length * CONG_GIAO : 0;
      du.phien = du.phien || [];
      du.phien.push({
        ma, ngay: new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10),
        nguoi, loai: laDoiTac ? 'Đối tác' : 'Nội bộ', khuVuc,
        soDon: co.length, tienMat, veCty, congGiao: cong, thucNhan: tienMat - cong,
        hinhThucNop: $('phienHinhThuc').value, taiKhoan: $('phienTaiKhoan').value,
        nguoiNhan: me.ten || '',
      });
      for (const d of du.don) if (chonMa.has(d.ma) && d.nguoiGiao === nguoi) d.phienBanGiao = ma;
      $('hop').close(); ve();
      tab = 'congNo'; ve();
      bao('Đã tạo phiên ' + ma + ' cho ' + chonMa.size + ' đơn — xem ở bảng "Phiên đối soát đã đóng" bên dưới. Bản mẫu chưa ghi Lark nên tải lại trang là mất.');
    };
    tinhTong();
  };

  veHop();
  $('hop').showModal();
}

async function nap() {
  try {
    me = await api('/api/auth/me');
    if (!me.dangNhap) { $('status').innerHTML = 'Bạn cần <a href="/">đăng nhập Sakawin</a> để xem trang này.'; return; }
    $('who').textContent = me.ten || 'Thành viên';
    for (const a of document.querySelectorAll('[data-right]')) a.hidden = me.quyen?.[a.dataset.right] !== true;
    if (me.quyen?.xem_giao_hang !== true) return bao('Tài khoản chưa được cấp quyền xem trang Giao hàng.', true);
    du = await api('/api/giao-hang');
    $('bangDemo').hidden = du.demo !== true;
    $('noiDung').hidden = false;
    const ds = [...new Set(du.don.map(d => d.ngayGiao))].sort();
    ngay = ds.find(x => x >= new Date().toISOString().slice(0, 10)) || ds[0];
    $('ngay').innerHTML = ds.map(x => `<option ${x === ngay ? 'selected' : ''}>${x}</option>`).join('');
    bao(`Đã tải ${du.tong.don} đơn (dữ liệu ảo) · ${du.nguoiGiao.length} người giao`);
    ve();
  } catch (e) { bao(e.message, true); }
}
