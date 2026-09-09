'use strict';
const crypto = require('node:crypto');
const {schemas, missing, decode} = require('./order-schema.js');
const fail = (status, message) => Object.assign(new Error(message), {statusCode:status});
const ID = /^[A-Za-z0-9_-]{3,120}$/;
function config(env) {
  env={...env,LARK_ORDER_DESIGN_BASE:env.LARK_ORDER_DESIGN_BASE||env.LARK_ORDER_DESIGN_WIKI,LARK_ORDER_MEDIA_BASE:env.LARK_ORDER_MEDIA_BASE||env.LARK_ORDER_MEDIA_WIKI};
  const required = ['LARK_ORDER_DESIGN_BASE','LARK_ORDER_DESIGN_TABLE','LARK_ORDER_MEDIA_BASE','LARK_ORDER_MEDIA_TABLE'];
  const absent = required.filter(k => !env[k]);
  if (absent.length) throw fail(503, 'Chưa cấu hình kết nối Order: ' + absent.join(', ') + '.');
  const targets = {
    design: {base:env.LARK_ORDER_DESIGN_BASE, table:env.LARK_ORDER_DESIGN_TABLE},
    media: {base:env.LARK_ORDER_MEDIA_BASE, table:env.LARK_ORDER_MEDIA_TABLE},
    shoots: {base:env.LARK_ORDER_MEDIA_BASE, table:env.LARK_ORDER_SHOOTS_TABLE},
  };
  for (const t of Object.values(targets)) if (!ID.test(t.base) || (t.table && !/^tbl[A-Za-z0-9]+$/.test(t.table))) throw fail(503,'Mã Base hoặc bảng Order chưa hợp lệ.');
  if (targets.design.base === targets.media.base) throw fail(503,'Design và Media phải trỏ đến đúng hai Base đã chốt.');
  if (targets.shoots.table === targets.media.table) throw fail(503,'Bảng Buổi quay phải khác bảng order Media.');
  return targets;
}
function credentials(env) {
  // Reuse is opt-in; never silently switch applications after a missing/partial config.
  if (env.LARK_ORDER_APP_ID || env.LARK_ORDER_APP_SECRET) {
    if (!env.LARK_ORDER_APP_ID || !env.LARK_ORDER_APP_SECRET)throw fail(503,'Cần đủ LARK_ORDER_APP_ID và LARK_ORDER_APP_SECRET cho cấu hình ứng dụng riêng.');
    return {app_id:env.LARK_ORDER_APP_ID, app_secret:env.LARK_ORDER_APP_SECRET};
  }
  if (env.ORDER_USE_EXISTING_LARK_APP === 'true' && env.LARK_APP_ID && env.LARK_APP_SECRET)
    return {app_id:env.LARK_APP_ID, app_secret:env.LARK_APP_SECRET};
  throw fail(503,'Chưa cấu hình ứng dụng Order. Chọn dùng lại ứng dụng Lark hiện có hoặc cấu hình ứng dụng riêng.');
}
function makeClient({env=process.env, fetcher=globalThis.fetch}={}) {
  const targets = config(env), auth = credentials(env), host = 'https://open.larksuite.com';
  let tokenPromise;
  async function token() {
    tokenPromise ||= (async () => {
      const r = await fetcher(host + '/open-apis/auth/v3/tenant_access_token/internal', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(auth), signal:AbortSignal.timeout(15000)});
      const j = await r.json();
      if (!r.ok || j.code !== 0 || !j.tenant_access_token) throw fail(502,'Không xác thực được ứng dụng Lark Order. Kiểm tra cấu hình ứng dụng.');
      return j.tenant_access_token;
    })();
    return tokenPromise;
  }
  const resolvedBases=new Map();
  async function baseToken(team) {
    const t=targets[team],prefix=team==='design'?'LARK_ORDER_DESIGN':'LARK_ORDER_MEDIA';
    if(env[prefix+'_BASE'] || !env[prefix+'_WIKI'])return t.base;
    if(!resolvedBases.has(t.base))resolvedBases.set(t.base,(async()=>{
      const u=new URL(host+'/open-apis/wiki/v2/spaces/get_node');u.searchParams.set('token',t.base);u.searchParams.set('obj_type','wiki');
      const r=await fetcher(u,{headers:{Authorization:'Bearer '+await token()},signal:AbortSignal.timeout(15000)}),j=await r.json();
      if(!r.ok||j.code!==0)throw fail(502,'Chưa đọc được thông tin Wiki của Base '+(team==='design'?'Design':'Media')+' (mã '+(Number(j.code)||r.status)+'). Kiểm tra quyền wiki:node:read của ứng dụng.');
      const node=j.data?.node;
      if(node?.obj_type!=='bitable'||!ID.test(node.obj_token||''))throw fail(503,'Đường dẫn Wiki cấu hình không trỏ đến một Base hợp lệ.');
      return node.obj_token;
    })());
    return resolvedBases.get(t.base);
  }
  async function request(team, suffix, {method='GET', fields, query={}}={}) {
    const t = targets[team];
    if (!t?.table) throw fail(503,'Chưa cấu hình bảng Buổi quay (LARK_ORDER_SHOOTS_TABLE).');
    const u = new URL(`${host}/open-apis/bitable/v1/apps/${await baseToken(team)}/tables/${t.table}/${suffix}`);
    for (const [k,v] of Object.entries(query)) u.searchParams.set(k,v);
    const r = await fetcher(u, {method, headers:{Authorization:'Bearer '+await token(), 'Content-Type':'application/json'}, ...(fields ? {body:JSON.stringify({fields})} : {}), signal:AbortSignal.timeout(15000)});
    const j = await r.json();
    if (!r.ok || j.code !== 0) throw fail(502,`Lark từ chối ${method === 'GET' ? 'đọc' : 'ghi'} bảng ${team} (mã ${Number(j.code) || r.status}). Kiểm tra quyền ứng dụng và cấu trúc bảng.`);
    return j.data;
  }
  async function list(team, kind) {
    const rows=[], seen=new Set(); let next;
    do {
      const data=await request(team,kind,{query:{page_size:kind==='fields'?'200':'500',...(kind==='records'?{user_id_type:'open_id'}:{}),...(next?{page_token:next}:{})}});
      if (!Array.isArray(data?.items)) throw fail(502,'Lark trả dữ liệu thiếu; đã dừng để tránh dùng báo cáo không đầy đủ.');
      rows.push(...data.items);
      if (rows.length>25000) throw fail(503,'Bảng Order quá lớn cho lượt tải này. Cần bổ sung phân trang trước khi dùng.');
      if (!data.has_more) break;
      if (!data.page_token || seen.has(data.page_token)) throw fail(502,'Phân trang Lark không đầy đủ; chưa thể dùng dữ liệu.');
      next=data.page_token; seen.add(next);
    } while (next);
    return rows;
  }
  return {
    targets, list,
    get:async (team,id) => {
      if (!/^rec[A-Za-z0-9]+$/.test(id)) throw fail(400,'Mã bản ghi không hợp lệ.');
      const data=await request(team,'records/'+id,{query:{user_id_type:'open_id'}});
      if (!data?.record?.record_id) throw fail(502,'Lark không trả bản ghi đầy đủ.');
      return data.record;
    },
    save:async (team, values, metadata, {id, key}={}) => {
      const absent=missing(team,metadata,Object.keys(values));
      if (absent.length) throw fail(409,'Cần bổ sung/kiểm tra kiểu cột: '+absent.map(x=>x.name).join(', '));
      if (Object.hasOwn(values,'shoot') && metadata.find(f=>f.field_name===schemas.media.shoot[0])?.property?.table_id!==targets.shoots.table)
        throw fail(409,'Cột Buổi quay phải liên kết đúng bảng Buổi quay đã cấu hình.');
      const fields={};
      for (const [k,v] of Object.entries(values)) fields[schemas[team][k][0]]=v;
      if (id && !/^rec[A-Za-z0-9]+$/.test(id)) throw fail(400,'Mã bản ghi không hợp lệ.');
      const data=await request(team,'records'+(id?'/'+id:''),{method:id?'PUT':'POST',fields,query:{user_id_type:'open_id',...(!id?{client_token:key}:{})}});
      if (!data?.record?.record_id) throw fail(502,'Chưa xác nhận được bản ghi đã lưu. Tải lại trước khi thử lại.');
      const verified=await request(team,'records/'+data.record.record_id,{query:{user_id_type:'open_id'}});
      if (!verified?.record?.record_id)throw fail(502,'Lark đã nhận lệnh nhưng chưa đọc lại được bản ghi. Tải lại trước khi gửi lại.');
      const actual=decode(team,verified.record),expected=decode(team,{fields});
      for(const k of Object.keys(values)) {
        const type=schemas[team][k][1];
        const normalize=v=>type===11?(v||[]).map(p=>p.id).sort():type===18||type===4?[...(v||[])].sort():v;
        if(JSON.stringify(normalize(actual[k]))!==JSON.stringify(normalize(expected[k])))throw fail(409,'Bản ghi đọc lại khác nội dung vừa gửi. Có thể đã có thay đổi đồng thời; tải lại để kiểm tra.');
      }
      return verified.record;
    },
  };
}
function stable(value) { return Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value; }
const revision = record => crypto.createHash('sha256').update(JSON.stringify(stable(record.fields || {}))).digest('hex');
// A distributed lease serializes writes made through this module across Vercel instances.
// Lark has no conditional record update in this adapter; direct edits in Lark can still race.
async function withLease(key, work, {env=process.env, fetcher=globalThis.fetch}={}) {
  const endpoint=env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const secret=env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!endpoint || !secret) throw fail(503,'Chưa cấu hình kho khóa ghi Order; chưa cho phép lưu.');
  const lease=crypto.randomUUID(), redisKey='sakawin:order:lock:'+key;
  async function cmd(...args) {
    const r=await fetcher(endpoint,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
    const j=await r.json(); if(!r.ok || j.error) throw fail(503,'Không lấy được khóa ghi Order.'); return j.result;
  }
  if (await cmd('SET',redisKey,lease,'NX','PX',120000) !== 'OK') throw fail(409,'Công việc đang được cập nhật. Vui lòng tải lại sau vài giây.');
  const assertOwned=async()=>{
    const held=await cmd('EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] and redis.call('PTTL',KEYS[1]) > 45000 then return 1 else return 0 end",1,redisKey,lease);
    if(held!==1)throw fail(409,'Khóa ghi đã hết hạn. Tải lại trước khi lưu để tránh ghi đè.');
  };
  try { return await work(assertOwned); }
  finally { await cmd('EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,redisKey,lease).catch(()=>{}); }
}
module.exports={makeClient,revision,fail,withLease};
