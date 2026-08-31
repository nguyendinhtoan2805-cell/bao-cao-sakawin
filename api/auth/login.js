/* /api/auth/login — Đẩy người dùng sang Lark để xác thực. Xử lý thật nằm ở api/_auth-handler.js */
module.exports = require('../_auth-handler.js')('login');
