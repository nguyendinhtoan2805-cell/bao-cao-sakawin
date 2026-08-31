/* /api/auth/me — Trả về người đang đăng nhập và quyền của họ. Xử lý thật nằm ở api/_auth-handler.js */
module.exports = require('../_auth-handler.js')('me');
