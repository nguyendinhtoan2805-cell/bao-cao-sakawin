'use strict';
/* Số liệu MINH HOẠ cho trang Sản phẩm khi chưa cấu hình LARK_APP_TOKEN_SP.
   Dùng để duyệt giao diện trước khi có Base thật.

   Toàn bộ con số ở đây do máy sinh ra từ một hạt giống cố định — KHÔNG phải
   doanh số thật của Sakawin. Repo này đang công khai nên không đưa số thật vào.
   Hạt giống cố định để tải lại trang không ra số khác, đỡ rối khi đang duyệt. */

const DONG = [
  { ma: 'A16', ten: 'Bộ bàn ghế A16', loai: 'Combo', pk: 'Trung (2-4.5tr)', manh: 1.00 },
  { ma: 'K30', ten: 'Bộ bàn ghế K30', loai: 'Combo', pk: 'Trung (2-4.5tr)', manh: 0.72 },
  { ma: 'A66', ten: 'Bộ bàn ghế A66', loai: 'Combo', pk: 'Cao (>4.5tr)', manh: 0.55 },
  { ma: 'S80', ten: 'Bàn học S80', loai: 'Bàn', pk: 'Trung (2-4.5tr)', manh: 0.83 },
  { ma: 'P100', ten: 'Bàn học Pro100', loai: 'Bàn', pk: 'Cao (>4.5tr)', manh: 0.48 },
  { ma: 'G81', ten: 'Ghế chống gù G81', loai: 'Ghế', pk: 'Thấp (0-2tr)', manh: 0.90 },
  { ma: 'G05', ten: 'Ghế chống gù G05', loai: 'Ghế', pk: 'Thấp (0-2tr)', manh: 0.34 },
  { ma: 'S45', ten: 'Bàn học S4500', loai: 'Bàn', pk: 'Thấp (0-2tr)', manh: 0.09 },
];
const MAU = [['Ghi', 1.0], ['Hồng', 0.96], ['Xanh', 0.81]];
const KENH = [['SP-HÀ NỘI', 1.0], ['TIKTOKSHOP', 0.86], ['SP-HCM', 0.44], ['FACEBOOK', 0.21], ['SP-FLAGSHIP', 0.12]];
const THANG = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
/* Nhịp mùa vụ: T5-T8 là cao điểm mùa tựu trường, khớp mô tả trong vault. */
const MUA = [0.78, 0.71, 0.92, 1.05, 1.18, 1.34];
const GIA = { 'Thấp (0-2tr)': 1450000, 'Trung (2-4.5tr)': 2850000, 'Cao (>4.5tr)': 5200000 };

/* Bộ sinh số tuyến tính — cùng hạt giống thì luôn ra cùng dãy. */
function tao(hat) {
  let s = hat >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function duLieuMinhHoa() {
  const rnd = tao(20260910);
  const dong = [];
  for (let ti = 0; ti < THANG.length; ti++) {
    for (const d of DONG) {
      for (const [mau, hsMau] of MAU) {
        for (const [kenh, hsKenh] of KENH) {
          /* Mỗi dòng sản phẩm lệch kênh một chút cho giống thật: ghế bán mạnh
             trên TikTok, bộ combo bán mạnh ở shop Hà Nội. */
          const lech = d.loai === 'Ghế' && kenh === 'TIKTOKSHOP' ? 1.6
            : d.loai === 'Combo' && kenh === 'SP-HÀ NỘI' ? 1.4 : 1;
          const nen = 46 * d.manh * hsMau * hsKenh * MUA[ti] * lech;
          const sl = Math.round(nen * (0.75 + rnd() * 0.5));
          if (sl <= 0) continue;
          const gia = GIA[d.pk] * (0.9 + rnd() * 0.16);
          dong.push({
            thang: THANG[ti], sanPham: `${d.ten} ${mau}`, dongSP: d.ma,
            phanKhuc: d.pk, loai: d.loai, mau, kenh,
            sanLuong: sl, doanhThu: Math.round(sl * gia),
          });
        }
      }
    }
  }
  return dong;
}

/* Tỉnh cho phần minh hoạ — tỉ trọng đặt theo quy mô dân số để hình dạng biểu
   đồ giống thật, nhưng con số vẫn do máy sinh. */
const TINH = [
  ['Hồ Chí Minh', 'Đông Nam Bộ', 1.00], ['Hà Nội', 'Đồng bằng sông Hồng', 0.94],
  ['Đồng Nai', 'Đông Nam Bộ', 0.31], ['Bình Dương', 'Đông Nam Bộ', 0.28],
  ['Đà Nẵng', 'Bắc Trung Bộ và Duyên hải miền Trung', 0.22],
  ['Hải Phòng', 'Đồng bằng sông Hồng', 0.20], ['Bắc Ninh', 'Đồng bằng sông Hồng', 0.17],
  ['Lâm Đồng', 'Tây Nguyên', 0.15], ['Nghệ An', 'Bắc Trung Bộ và Duyên hải miền Trung', 0.14],
  ['Cần Thơ', 'Đồng bằng sông Cửu Long', 0.13], ['Thái Nguyên', 'Trung du và miền núi phía Bắc', 0.11],
  ['Khánh Hòa', 'Bắc Trung Bộ và Duyên hải miền Trung', 0.10],
  ['Long An', 'Đồng bằng sông Cửu Long', 0.09], ['Phú Thọ', 'Trung du và miền núi phía Bắc', 0.08],
  ['Đắk Lắk', 'Tây Nguyên', 0.07],
];
const TRA = [
  ['Thanh toán khi nhận hàng', 'COD', 1.00],
  ['Thẻ tín dụng / ghi nợ', 'Trả trước', 0.26],
  ['Ngân hàng liên kết ShopeePay', 'Trả trước', 0.19],
  ['Trả sau (PayLater)', 'Trả sau', 0.17],
  ['Ví MoMo', 'Trả trước', 0.10],
  ['VNPAY', 'Trả trước', 0.04],
  ['Ví ShopeePay', 'Trả trước', 0.03],
  ['ZaloPay', 'Trả trước', 0.02],
];

function phuMinhHoa() {
  const rnd = tao(20260911);
  const tinh = [], thanhToan = [];
  for (let ti = 0; ti < THANG.length; ti++) {
    for (const [kenh, hsKenh] of KENH) {
      for (const [ten, vung, hs] of TINH) {
        const n = Math.round(230 * hs * hsKenh * MUA[ti] * (0.8 + rnd() * 0.4));
        if (n <= 0) continue;
        tinh.push({ thang: THANG[ti], tinh: ten, vung, kenh,
          soDon: n, doanhThu: Math.round(n * (2.2e6 + rnd() * 1.4e6)) });
      }
      for (const [pt, nhom, hs] of TRA) {
        /* COD áp đảo ở kênh ngoài sàn; ví điện tử chỉ có trên sàn. */
        const lech = nhom === 'COD' && /FACEBOOK/.test(kenh) ? 2.2
          : nhom !== 'COD' && /FACEBOOK/.test(kenh) ? 0.05 : 1;
        const n = Math.round(520 * hs * hsKenh * MUA[ti] * lech * (0.85 + rnd() * 0.3));
        if (n <= 0) continue;
        thanhToan.push({ thang: THANG[ti], phuongThuc: pt, nhom, kenh,
          soDon: n, doanhThu: Math.round(n * (2.3e6 + rnd() * 1.2e6)) });
      }
    }
  }
  return { tinh, thanhToan };
}

module.exports = { duLieuMinhHoa, phuMinhHoa };
