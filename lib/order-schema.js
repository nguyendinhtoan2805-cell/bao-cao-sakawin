'use strict';
// Explicit field allowlist. Existing Lark fields are reused; none are renamed or deleted.
const common = {
  requestKey: ['Mã yêu cầu', 1], creator: ['Người tạo', 1],
  stage: ['Tiến độ chi tiết', 1], importantFinal: ['Cần duyệt thành phẩm', 7],
  finalReview: ['Duyệt thành phẩm', 1], completedAt: ['Hoàn thành lúc', 5],
  history: ['Nhật ký', 1], hours: ['Giờ dự kiến', 2],
};
const schemas = {
  design: {
    title: ['Nội dung ảnh', 1], code: ['MÃ DESIGN', 1], createdAt: ['Ngày Order', 5],
    deadline: ['Dealline', 5], priority: ['Mức ưu tiên', 3], legacyStage: ['Trạng thái', 3],
    requester: ['Người Order', 3], assignees: ['Designer', 11],
    style: ['Phong cách', 1], color: ['Màu sắc', 1], size: ['Kích thước', 1],
    format: ['Định dạng', 1], quantity: ['Số trang/ ảnh', 2], result: ['Trả ảnh', 15],
    ...common,
  },
  media: {
    month: ['THÁNG', 3],
    title: ['TIÊU ĐỀ', 1], code: ['MÃ VIDEO', 1], brief: ['NỘI DUNG', 1],
    scriptLink: ['KỊCH BẢN', 15], requester: ['NGƯỜI ORDER', 11], host: ['VJ', 3],
    channels: ['CHANNEL', 4], createdAt: ['ORDER DATE', 5], deadline: ['DEALLINE', 5],
    assignees: ['NGƯỜI DỰNG', 11], legacyStage: ['Progress', 3], result: ['Link video tiktok', 15],
    resultFacebook: ['LINK VIDEO fb', 1], notes: ['GHI CHÚ (kích thước, định dạng....)', 1],
    ...common,
    shoot: ['Buổi quay', 18], scriptApproval: ['Duyệt kịch bản', 3],
  },
  shoots: {
    title: ['Tên buổi quay', 1], start: ['Bắt đầu', 5], end: ['Kết thúc', 5],
    location: ['Địa điểm', 1], hosts: ['Host', 11], crew: ['Người quay', 11], notes: ['Ghi chú', 1],
    requestKey: common.requestKey, creator: common.creator, history: common.history,
  },
};
// Stable internal keys: schema readiness must not depend on a display-name prefix.
const workflowKeys = {
  design: Object.keys(common),
  media: [...Object.keys(common), 'shoot', 'scriptApproval'],
  shoots: Object.keys(schemas.shoots),
};
const stages = {
  design: ['Chờ kiểm tra brief', 'Cần bổ sung brief', 'Đã nhận order', 'Đang thiết kế', 'Chờ duyệt thành phẩm', 'Cần sửa', 'Hoàn thành'],
  media: ['Chưa viết kịch bản', 'Đang viết kịch bản', 'Chờ duyệt kịch bản', 'Cần sửa kịch bản', 'Sẵn sàng quay', 'Đã quay', 'Đang dựng', 'Chờ duyệt thành phẩm', 'Cần sửa', 'Hoàn thành'],
};
const scriptApprovalOptions = ['Không cần duyệt', 'Cần duyệt', 'Chờ duyệt', 'Cần sửa', 'Đã duyệt'];
function text(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(v => typeof v === 'object' ? v?.text || v?.name || '' : String(v)).join('');
  return value?.text || value?.name || '';
}
function url(value) { return typeof value === 'string' ? value : value?.link || value?.url || ''; }
function people(value) {
  return Array.isArray(value) ? value.filter(x => x && typeof x.id === 'string').map(x => ({id:x.id, name:x.name || x.en_name || x.id, ...(x.email ? {email:x.email} : {})})) : [];
}
function parse(value, fallback) { try { return JSON.parse(text(value)) || fallback; } catch { return fallback; } }
function legacyStage(team, value) {
  const s = text(value);
  if (s === 'Hoàn thành') return s;
  if (team === 'media') return s === 'Đang dựng' ? 'Đang dựng' : 'Chưa viết kịch bản';
  return /đang/i.test(s) ? 'Đang thiết kế' : 'Chờ kiểm tra brief';
}
function decode(team, record) {
  const out = {id:record.record_id, team};
  for (const [key, [name, type]] of Object.entries(schemas[team])) {
    const v = record.fields?.[name];
    out[key] = type === 11 ? people(v) : type === 7 ? v === true : type === 5 || type === 2 ? (typeof v === 'number' ? v : null)
      : type === 15 ? url(v) : type === 18 ? (Array.isArray(v) ? v.map(x => typeof x === 'string' ? x : x.record_id).filter(Boolean) : [])
      : type === 4 ? (Array.isArray(v) ? v : []) : text(v);
  }
  out.history = parse(record.fields?.[schemas[team].history[0]], []);
  if (!Array.isArray(out.history)) out.history = [];
  if (team !== 'shoots') {
    out.stage = out.stage || legacyStage(team, out.legacyStage);
    out.legacy = !text(record.fields?.[common.stage[0]]);
    out.finalReview = parse(record.fields?.[common.finalReview[0]], null);
    if (team === 'media') {
      out.scriptApproval = out.scriptApproval || 'Không cần duyệt';
      out.importantScript = out.scriptApproval !== 'Không cần duyệt';
      const event = out.history.slice().reverse().find(h => h?.detail && Object.hasOwn(h.detail, 'scriptReview'));
      out.scriptReview = event?.detail.scriptReview || null;
    }
  }
  return out;
}
function missing(team, fields, keys) {
  const byName = new Map(fields.map(f => [f.field_name, f]));
  return keys.flatMap(key => {
    const [name, type] = schemas[team][key], actual = byName.get(name);
    return !actual ? [{key,name,type,reason:'missing'}] : (actual.type !== type && !(type === 18 && actual.type === 21)) ? [{key,name,type,actualType:actual.type,reason:'type'}] : [];
  });
}
module.exports = {schemas, workflowKeys, stages, scriptApprovalOptions, text, people, decode, missing};
