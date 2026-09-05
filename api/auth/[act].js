/* =====================================================================
   /api/auth/* — MỘT function lo cả sáu đường đăng nhập.

   Trước đây mỗi đường một file 2 dòng (login, callback, logout, me,
   mat-khau, doi-mat-khau). Vercel Hobby chỉ cho 12 file trong /api, mà
   sáu file đó ăn mất một nửa hạn mức dù chẳng chứa xử lý gì — toàn bộ
   phần thật nằm ở _auth-handler.js. Gộp lại còn 1, giải phóng 5 slot cho
   các trang báo cáo sau này.

   ĐƯỜNG DẪN KHÔNG ĐỔI: /api/auth/callback vẫn y nguyên, nên KHÔNG phải
   sửa Redirect URL trong Lark App.

   Tên đường dẫn có dấu gạch nối, còn action bên trong _auth-handler.js
   viết liền — nên cần bảng ánh xạ, không suy ra tự động được.
===================================================================== */
const handler = require('../_auth-handler.js');

const DUONG = {
  'login':        'login',
  'callback':     'callback',
  'logout':       'logout',
  'me':           'me',
  'mat-khau':     'matkhau',
  'doi-mat-khau': 'doimatkhau',
};

module.exports = (req, res) => {
  const act = DUONG[String((req.query && req.query.act) || '').toLowerCase()];
  /* Đường lạ thì trả 404 gọn, đừng để lọt xuống handler rồi báo lỗi khó hiểu */
  if (!act) return res.status(404).json({ ok: false, error: 'Không có đường dẫn này.' });
  return handler(act)(req, res);
};
