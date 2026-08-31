/* /api/auth/callback — Lark gọi về đây sau khi người dùng đồng ý. Xử lý thật nằm ở api/_auth-handler.js */
module.exports = require('../_auth-handler.js')('callback');
