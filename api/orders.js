'use strict';
const A=require('./_auth.js');
const {makeClient,withLease,fail}=require('../lib/order-lark.js');
const S=require('../lib/order-service.js');
const schema=require('../lib/order-schema.js');
const {queryText}=require('../lib/order-directory.js');
function valueShape(v,depth=0){if(v===null)return 'null';if(depth>3)return typeof v;if(Array.isArray(v))return {array:v.length,item:v.length?valueShape(v[0],depth+1):null};if(typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,valueShape(x,depth+1)]));return typeof v;}
function makeHandler({auth=A,env=process.env,clientFactory=()=>makeClient({env}),lease=(key,work)=>withLease(key,work,{env})}={}) {
  return async (req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    try {
      const user=await auth.canhCong(req,res,'xem_order'); if(!user)return;
      if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Phương thức không hỗ trợ.'});
      let body;
      if(req.method==='POST') {
        if(typeof req.body==='string'&&Buffer.byteLength(req.body)>90000)throw fail(413,'Nội dung quá lớn.');
        try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{throw fail(400,'Nội dung gửi không hợp lệ.');}
        if(!body||typeof body!=='object'||Array.isArray(body)||!['design','media','shoots'].includes(body.team))throw fail(400,'Bảng Order không hợp lệ.');
        if(Buffer.byteLength(JSON.stringify(body))>90000)throw fail(413,'Nội dung quá lớn.');
        const right=body.action==='review'?'duyet_order':'ghi_order';
        if(user.quyen[right]!==true)throw fail(403,'Bạn chưa có quyền thực hiện thao tác Order này.');
        if(env.ORDER_WRITES_ENABLED!=='true')throw fail(503,'Chưa bật ghi Lark cho Order. Đang trong giai đoạn kiểm tra kết nối.');
        const origin=req.headers.origin;
        if(!origin)throw fail(403,'Yêu cầu ghi cần xuất phát từ trang web.');
        let expected;try{expected=new URL(env.SITE_URL||'https://'+req.headers.host).origin;}catch{throw fail(503,'Chưa cấu hình địa chỉ web.');}
        if(origin!==expected)throw fail(403,'Nguồn yêu cầu ghi không hợp lệ.');
      }
      if(req.method==='GET'&&req.query?.people==='1') {
        if(user.quyen.ghi_order!==true)throw fail(403,'Bạn chưa có quyền tìm nhân sự để phân công Order.');
        queryText(req.query.q);
        if(env.ORDER_DIRECTORY_ENABLED!=='true')throw fail(503,'Chưa bật tìm nhân sự trong danh bạ Lark. Bạn vẫn có thể chọn người đã có trong danh sách.');
        const client=clientFactory();
        if(!client.directory)throw fail(503,'Chưa cấu hình tìm nhân sự trong danh bạ Lark.');
        const result=await client.directory.search(req.query.q);
        return res.json({ok:true,people:result.people.map(({id,name})=>({id,name})),hasMore:result.hasMore===true});
      }
      const client=clientFactory(),ctx=await S.context(client,env);
      if(req.method==='GET') {
        const missing=S.requirements(ctx);
        const data=Object.fromEntries(Object.entries(ctx.tables).map(([team,t])=>[team,t.records.map(r=>S.expose(team,r))]));
        data.shoots ||= [];
        return res.json({ok:true,data,people:ctx.roster.map(({id,name})=>({id,name})),stages:schema.stages,
          ...(req.query?.kiemtra==='1'&&user.quyen.quan_tri===true?{schema:Object.fromEntries(Object.entries(ctx.tables).map(([team,t])=>[team,{count:t.records.length,fields:t.fields.map(f=>({name:f.field_name,type:f.type,...([2,5].includes(f.type)?{shapes:[...new Set(t.records.map(r=>JSON.stringify(valueShape(r.fields[f.field_name]))))].slice(0,8).map(v=>JSON.parse(v))}:{}),...(f.property?.options?{options:f.property.options.map(o=>o.name)}:{}),...(f.property?.table_id?{table:f.property.table_id,shapes:[...new Set(t.records.map(r=>JSON.stringify(valueShape(r.fields[f.field_name]))))].slice(0,8).map(v=>JSON.parse(v))}:{})}))}]))}:{}),
          options:Object.fromEntries(['design','media'].map(team=>[team,Object.fromEntries(ctx.tables[team].fields.filter(f=>[3,4].includes(f.type)).map(f=>[f.field_name,(f.property?.options||[]).map(o=>o.name)]))])),
          connection:{read:true,writeEnabled:env.ORDER_WRITES_ENABLED==='true',directoryEnabled:env.ORDER_DIRECTORY_ENABLED==='true',missing,checkedAt:Date.now()},permissions:{write:user.quyen.ghi_order===true,review:user.quyen.duyet_order===true}});
      }
      const key=body.action==='create'?S.creationKey(user,body.team,body.key):body.id;
      if(typeof key!=='string'||!/^[A-Za-z0-9-]+$/.test(key))throw fail(400,'Mã thao tác không hợp lệ.');
      const record=await lease(body.team+':'+key,async assertOwned=>{
        const guarded={...client,save:async(...args)=>{if(assertOwned)await assertOwned();return client.save(...args);}};
        return body.action==='create'?S.create(guarded,ctx,user,body):S.update(guarded,ctx,user,body);
      });
      return res.json({ok:true,record});
    }catch(e){return res.status(e.statusCode||502).json({ok:false,error:e.statusCode?e.message:'Chưa hoàn tất yêu cầu Order. Vui lòng tải lại trước khi thử lại.'});}
  };
}
module.exports=makeHandler();
module.exports.makeHandler=makeHandler;
