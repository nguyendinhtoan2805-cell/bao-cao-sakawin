'use strict';
/* Dữ liệu MINH HOẠ cho trang Giao hàng khi chưa cấu hình LARK_APP_TOKEN_GH.

   Mọi con số, tên khách và số điện thoại ở đây do máy sinh từ một hạt giống
   cố định — KHÔNG phải đơn thật. Repo công khai nên không đưa dữ liệu khách vào.
   Số điện thoại đánh số tuần tự 09120000xx để nhìn là biết ngay không phải thật.

   Hạt giống cố định để tải lại trang không ra số khác, đỡ rối khi đang duyệt. */

const KHUNG = ['08:00 – 10:00', '10:00 – 12:00', '13:00 – 15:00', '15:00 – 17:00',
               '17:00 – 19:00', '19:00 – 21:00', 'Khách linh động'];

/* Ba cờ đi kèm từng loại đơn — đúng ý "luật ở Lark, web chỉ thi hành".
   Bản thật sẽ đọc ba cờ này từ bảng SETTING/Phân loại đơn. */
/* xepNguoi = có phải sắp xếp vận chuyển hay không.
   Chỉ KHÁCH LẤY TẠI KHO là không: khách tự đến, không ai phải chở đi đâu.
   HÀNG TRƯNG BÀY vẫn cần người chở tới showroom — chỉ là không thu tiền.
   ĐƠN CHUYỂN PHÁT vẫn phải bàn giao cho hãng vận chuyển.
   canGio = có khung giờ hẹn với khách hay không: hàng trưng bày và chuyển
   phát thì không hẹn giờ với ai, nhưng vẫn phải xếp người chở. */
const PHAN_LOAI = [
  { ten: 'SAKAWIN SHIP + LẮP', xepNguoi: true,  canGio: true,  coCod: true,  ti: 0.55 },
  { ten: 'SAKAWIN SHIP',       xepNguoi: true,  canGio: true,  coCod: true,  ti: 0.18 },
  { ten: 'ĐƠN LẮP',            xepNguoi: true,  canGio: true,  coCod: true,  ti: 0.09 },
  { ten: 'ĐƠN CHUYỂN PHÁT',    xepNguoi: true,  canGio: false, coCod: true,  ti: 0.10 },
  { ten: 'HÀNG TRƯNG BÀY',     xepNguoi: true,  canGio: false, coCod: false, ti: 0.03 },
  { ten: 'KHÁCH LẤY TẠI KHO',  xepNguoi: false, canGio: false, coCod: true,  ti: 0.05 },
];

const NGUOI_GIAO = [
  { ten: 'Phạm Trung Hiếu', khuVuc: 'HN', loai: 'Nội bộ' },
  { ten: 'Lê Quang Vinh',   khuVuc: 'HN', loai: 'Nội bộ' },
  { ten: 'Đỗ Minh Tuấn',    khuVuc: 'HN', loai: 'Nội bộ' },
  { ten: 'Vận tải An Phát', khuVuc: 'HN', loai: 'Đối tác' },
  { ten: 'Giao nhanh 24h',  khuVuc: 'HCM', loai: 'Đối tác' },
  { ten: 'Vận tải Sài Gòn', khuVuc: 'HCM', loai: 'Đối tác' },
];

const QUAN = {
  HN: ['Gia Lâm', 'Long Biên', 'Cầu Giấy', 'Hà Đông', 'Thanh Xuân', 'Hoàng Mai', 'Đống Đa', 'Nam Từ Liêm'],
  HCM: ['Quận 1', 'Quận 7', 'Bình Thạnh', 'Thủ Đức', 'Tân Bình', 'Gò Vấp'],
};
const DUONG = ['Vinhome Oceanpark', 'Đặng Xá', 'Trâu Quỳ', 'KĐT Việt Hưng', 'Times City',
               'Royal City', 'Ecopark', 'Vinhome Smart City', 'Masteri Thảo Điền', 'Sunrise City'];
const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Ngô', 'Dương'];
const TEN = ['Lan Anh', 'Minh Châu', 'Thu Hà', 'Quốc Khánh', 'Bảo Ngọc', 'Hải Yến',
             'Đức Thắng', 'Phương Linh', 'Tuấn Kiệt', 'Mai Chi'];

const SAN_PHAM = [
  { ma: 'S80-H',  ten: 'Bàn học sinh thông minh S80 - Hồng', gia: 2650000 },
  { ma: 'S80-X',  ten: 'Bàn học sinh thông minh S80 - Xanh', gia: 2650000 },
  { ma: 'G06-H',  ten: 'Ghế chống gù tựa lưng kép G06 - Hồng', gia: 1550000 },
  { ma: 'A16-G',  ten: 'Bộ bàn học thông minh A16 cải tiến - Ghi', gia: 3950000 },
  { ma: 'K30-X',  ten: 'Bộ bàn học thông minh K30 - Xanh', gia: 2890000 },
  { ma: 'PRO100-G', ten: 'Bàn học thông minh cao cấp PRO100 - Ghi', gia: 5200000 },
  { ma: 'G81-H',  ten: 'Ghế ngồi cho bé G81 - Hồng cam', gia: 1290000 },
  { ma: 'G18-X',  ten: 'Ghế xoay chống gù lưng G18 - Xanh', gia: 1690000 },
];

const KENH = [['Shopee', 'Shopee Hà Nội'], ['Shopee', 'Shopee HCM'], ['TikTok', 'Tiktok Sakawin Việt Nam'],
              ['Facebook', 'Sakawin Việt Nam'], ['Showroom', 'Đơn Showroom'], ['Zalo', 'Zalo Hotline'],
              ['Website', 'Website'], ['Sỉ', 'Sỉ']];
const SALE = ['Chu Trần Hưng', 'Nguyễn Thuỳ Dương', 'Trần Bảo Nam', 'Lê Thu Trang'];
/* Giao hàng nội thành thì tiền mặt là chủ yếu — chia đều ba hình thức làm con
   số "người giao đang cầm" ra 0, che đúng thứ phiên đối soát sinh ra để lo. */
const HINH_THUC = [['Tiền mặt', 0.66], ['Chuyển khoản về công ty', 0.20], ['Quét QR', 0.14]];
function chonHinhThuc(r) { let x = r; for (const [t, ti] of HINH_THUC) if ((x -= ti) <= 0) return t; return 'Tiền mặt'; }
const LY_DO_HEN_LAI = ['Khách đổi giờ', 'Kho thiếu hàng', 'Shipper không kịp'];

function tao(hat) { let s = hat >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
const NGAY = 864e5;
const ngayVN = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 10);

function duLieuMinhHoa() {
  const rnd = tao(20260911);
  const chon = a => a[Math.floor(rnd() * a.length)];
  const homNay = Date.now();
  const don = [];
  let stt = 0;

  /* 5 ngày: 2 ngày trước (đã xong, có công nợ), hôm nay, 2 ngày sau (đang xếp) */
  for (let lech = -2; lech <= 2; lech++) {
    const ngayGiao = ngayVN(homNay + lech * NGAY);
    const soDon = lech === 0 ? 16 : lech > 0 ? 11 : 12;
    /* Đơn thật không rải đều khắp thành phố: mỗi ngày dồn vào vài quận. Gom sẵn
       để bàn điều phối cho thấy đúng cái nó sinh ra để giải — nhìn ra tuyến. */
    const quanNong = {
      HN: [0, 1, 2, 3, 4, 5, 6, 7].sort(() => rnd() - 0.5).slice(0, 3).map(i => QUAN.HN[i]),
      HCM: [0, 1, 2, 3, 4, 5].sort(() => rnd() - 0.5).slice(0, 2).map(i => QUAN.HCM[i]),
    };
    for (let i = 0; i < soDon; i++) {
      const khuVuc = rnd() < 0.62 ? 'HN' : 'HCM';
      let r = rnd(), pl = PHAN_LOAI[0];
      for (const p of PHAN_LOAI) { if ((r -= p.ti) <= 0) { pl = p; break; } }
      const sp = [];
      const soDong = rnd() < 0.55 ? 2 : 1;
      for (let k = 0; k < soDong; k++) {
        const s = chon(SAN_PHAM);
        if (!sp.some(x => x.ma === s.ma)) sp.push({ ma: s.ma, ten: s.ten, soLuong: 1, gia: s.gia });
      }
      const tong = sp.reduce((a, x) => a + x.gia * x.soLuong, 0);
      const coc = rnd() < 0.3 ? Math.round(tong * 0.3 / 1e5) * 1e5 : 0;
      const [kenh, shop] = chon(KENH);
      stt++;

      /* Trạng thái theo ngày: quá khứ đã giao xong, tương lai còn chờ xếp */
      const nguoi = NGUOI_GIAO.filter(n => n.khuVuc === khuVuc);
      let trangThai, nguoiGiao = '', khung = '', thuTu = 0, thucThu = null, hinhThuc = '', phien = '';
      if (!pl.xepNguoi) {
        trangThai = lech < 0 ? 'Giao xong' : 'Đã xác nhận';
        /* Khách đến kho lấy hàng thì kho thu tiền ngay — trước đó để trống nên
           5 đơn "giao xong" mà không có tiền, nhìn vào tưởng lỗi tính toán. */
        if (trangThai === 'Giao xong' && pl.coCod) {
          thucThu = tong - coc;
          hinhThuc = chonHinhThuc(rnd());
        }
      } else if (lech < 0) {
        /* Cố ý để lại vài đơn ngày cũ chưa giao xong — đó chính là loại đơn bị
           bỏ quên trong Zalo mà trang này sinh ra để lôi ra ánh sáng. */
        if (rnd() < 0.32) {
          trangThai = rnd() < 0.5 ? 'Đang giao' : 'Đã xếp người';
          nguoiGiao = chon(nguoi).ten; khung = chon(KHUNG.slice(0, 6));
        } else {
          trangThai = 'Giao xong';
          nguoiGiao = chon(nguoi).ten; khung = chon(KHUNG.slice(0, 6));
          thucThu = pl.coCod ? tong - coc : 0;
          hinhThuc = chonHinhThuc(rnd());
        }
      } else if (lech === 0) {
        const b = rnd();
        trangThai = b < 0.28 ? 'Đang giao' : b < 0.82 ? 'Đã xếp người' : 'Chờ xác nhận';
        if (trangThai !== 'Chờ xác nhận') {
          /* Dồn vào ít người và ít khung giờ hơn, để có ô 2-3 đơn như thực tế */
          nguoiGiao = nguoi[Math.floor(rnd() * Math.min(2, nguoi.length))].ten;
          khung = KHUNG[3 + Math.floor(rnd() * 3)];
        }
      } else {
        trangThai = rnd() < 0.5 ? 'Đã xếp người' : 'Chờ xác nhận';
        if (trangThai === 'Đã xếp người') {
          nguoiGiao = nguoi[Math.floor(rnd() * Math.min(2, nguoi.length))].ten;
          khung = KHUNG[3 + Math.floor(rnd() * 3)];
        }
      }
      if (!pl.canGio) khung = '';   /* không hẹn giờ với ai thì không có khung */
      if (khung) thuTu = 1;

      const gioSale = chon(KHUNG.slice(0, 6));
      const soHenLai = rnd() < 0.14 ? (rnd() < 0.7 ? 1 : 2) : 0;
      don.push({
        ma: 'DA26' + String(9).padStart(2, '0') + String(stt).padStart(3, '0'),
        khuVuc, khoXuat: khuVuc === 'HN' ? 'Kho Hà Nội' : 'Kho HCM',
        phanLoai: pl.ten, xepNguoi: pl.xepNguoi, canGio: pl.canGio, coCod: pl.coCod,
        kenh, shop, sale: chon(SALE),
        tenKhach: chon(HO) + ' ' + chon(TEN),
        sdt: '09120000' + String(10 + (stt % 89)),
        /* Khách tự đến kho lấy thì không có địa chỉ giao — để trống cho đúng,
           thay vì sinh một địa chỉ chẳng ai dùng tới. */
        quan: pl.ten === 'KHÁCH LẤY TẠI KHO' ? '' : (rnd() < 0.78 ? chon(quanNong[khuVuc]) : chon(QUAN[khuVuc])),
        diaChi: pl.ten === 'KHÁCH LẤY TẠI KHO' ? '' : 'Căn hộ ' + (100 + Math.floor(rnd() * 800)) + ', ' + chon(DUONG),
        ngayGiao, gioSaleHen: pl.canGio ? gioSale : '',
        khungGio: khung, thuTu,
        soHenLai, lyDoHenLai: soHenLai ? chon(LY_DO_HEN_LAI) : '',
        nguoiGiao, loaiNguoiGiao: nguoiGiao ? (NGUOI_GIAO.find(n => n.ten === nguoiGiao) || {}).loai || '' : '',
        tongDon: tong, coc, codPhaiThu: pl.coCod ? tong - coc : 0,
        thucThu, hinhThuc, daKiemSaoKe: hinhThuc === 'Chuyển khoản về công ty' ? rnd() < 0.7 : null,
        trangThai, phienBanGiao: phien,
        ghiChu: rnd() < 0.22 ? 'Tặng kèm 1 hộp màu 24 màu theo campaign tháng 9' : '',
        sanPham: sp,
      });
    }
  }
  /* Một phiên bàn giao thuộc đúng MỘT người giao ở MỘT khu vực. Trước đó gán
     chung một mã cho mọi đơn ngày cũ nhất, nên phiên bị trộn hai miền và
     nhiều người — nhìn vào tưởng lọc khu vực bị lỗi. */
  const ngayCuNhat = ngayVN(homNay - 2 * NGAY);
  const nhomPhien = new Map();
  for (const d of don) {
    if (d.ngayGiao !== ngayCuNhat || d.trangThai !== 'Giao xong' || !d.nguoiGiao || !d.coCod) continue;
    const k = d.khuVuc + '|' + d.nguoiGiao;
    if (!nhomPhien.has(k)) nhomPhien.set(k, []);
    nhomPhien.get(k).push(d);
  }
  let soPhien = 0;
  for (const ds of nhomPhien.values()) {
    soPhien++;
    const ma = 'PH-2609-' + String(soPhien).padStart(2, '0');
    for (const d of ds) d.phienBanGiao = ma;
  }

  /* Phiên đối soát là bản ghi riêng, không suy ra từ đơn — vì còn cần biết ai
     nhận tiền, nộp bằng gì, vào tài khoản nào. Suy từ đơn thì mất hết. */
  const phien = [];
  const daCo = [...new Set(don.map(d => d.phienBanGiao).filter(Boolean))];
  for (const ma of daCo) {
    const ds = don.filter(d => d.phienBanGiao === ma);
    const tienMat = ds.filter(d => d.hinhThuc === 'Tiền mặt').reduce((t, d) => t + (d.thucThu || 0), 0);
    const veCty = ds.filter(d => d.hinhThuc && d.hinhThuc !== 'Tiền mặt').reduce((t, d) => t + (d.thucThu || 0), 0);
    const nguoi = ds[0].nguoiGiao;
    const laDoiTac = (NGUOI_GIAO.find(n => n.ten === nguoi) || {}).loai === 'Đối tác';
    const cong = laDoiTac ? ds.length * 50000 : 0;
    phien.push({
      ma, ngay: ds.map(d => d.ngayGiao).sort().pop(), nguoi,
      loai: laDoiTac ? 'Đối tác' : 'Nội bộ', khuVuc: ds[0].khuVuc,
      soDon: ds.length, tienMat, veCty, congGiao: cong, thucNhan: tienMat - cong,
      hinhThucNop: 'Chuyển khoản', taiKhoan: 'ACB · 1234567890 · SAKAWIN GLOBAL',
      nguoiNhan: 'Kế toán Sakawin',
    });
  }
  return { don, phien, nguoiGiao: NGUOI_GIAO, khungGio: KHUNG, phanLoai: PHAN_LOAI };
}

module.exports = { duLieuMinhHoa, KHUNG, PHAN_LOAI, NGUOI_GIAO };
