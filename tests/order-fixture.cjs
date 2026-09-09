'use strict';
// Entirely synthetic. This fixture never loads credentials or calls Lark.
const {schemas,missing,scriptApprovalOptions,designStageOptions,designOutput,decode}=require('../lib/order-schema.js');
const {fail}=require('../lib/order-lark.js');
const people=[{id:'ou_demoA',name:'Content A',email:'demo.a@example.test'},{id:'ou_demoB',name:'Content B',email:'demo.b@example.test'},{id:'ou_demoC',name:'Editor A',email:'demo.c@example.test'},{id:'ou_demoD',name:'Editor B',email:'demo.d@example.test'},{id:'ou_demoH',name:'Host A',email:'demo.h@example.test'}];
const stamp=s=>new Date(s+'+07:00').getTime();
function fixture(){
  const tables={};let next=100;
  for(const team of Object.keys(schemas))tables[team]={fields:Object.entries(schemas[team]).map(([key,[field_name,type]],i)=>({field_name,type,field_id:'fldDemo'+i,property:{...(type===18?{table_id:'tblShoots'}:{}),options:(key==='scriptApproval'?scriptApprovalOptions:key==='stage'&&team==='design'?Object.keys(designStageOptions):key==='legacyStage'?(team==='media'?['Chưa thực hiện','Đang dựng','Hoàn thành']:['Chưa làm','Đang làm','Hoàn thành']):key==='requester'?['Content A','Content B']:key==='channels'?['Facebook','TikTok','YouTube']:key==='priority'?['Bình thường','Gấp']:key==='format'?['JPG','PNG','PDF']:key==='month'?['T8.2026','T9.2026','T10.2026']:[]).map(name=>({name}))}})),records:[]};
  const raw=(team,id,values)=>({record_id:id,fields:Object.fromEntries(Object.entries(values).map(([k,v])=>[schemas[team][k][0],v]))});
  for(const [i,day]of [4,11,18,25].entries())tables.shoots.records.push(raw('shoots','recShoot'+i,{title:'Buổi quay tháng 9 · '+day,start:stamp('2026-09-'+String(day).padStart(2,'0')+'T09:00:00'),end:stamp('2026-09-'+String(day).padStart(2,'0')+'T12:00:00'),location:'Studio Sakawin',hosts:[people[4]],crew:[people[2]],creator:people[0].email,history:'[]'}));
  const titles=['Giới thiệu sản phẩm','Câu chuyện thương hiệu','Hướng dẫn sử dụng','Giải đáp khách hàng','Mẹo bảo quản','Trải nghiệm thực tế','Khám phá sản phẩm','Bộ sưu tập mới'];
  const stages=['Đang viết kịch bản','Chờ duyệt kịch bản','Sẵn sàng quay','Sẵn sàng quay','Đang dựng','Cần sửa','Chờ duyệt thành phẩm','Hoàn thành'];
  for(let i=0;i<8;i++)tables.media.records.push(raw('media','recMedia'+i,{title:titles[i],code:'M-00'+(i+1),month:'T9.2026',brief:'Nội dung minh hoạ để kiểm tra bố cục và quy trình.',scriptLink:{text:'Kịch bản minh hoạ',link:'https://example.com/script/'+i},requester:[people[i%2]],assignees:[people[2+i%2]],channels:['Facebook','TikTok'],createdAt:stamp('2026-09-01T09:00:00'),deadline:stamp('2026-09-'+String(10+i).padStart(2,'0')+'T23:59:00'),stage:stages[i],legacyStage:i===7?'Hoàn thành':i>=4?'Đang dựng':'Chưa thực hiện',shoot:i===0?[]:['recShoot'+(i===1?2:i<4?1:0)],scriptApproval:i===1?'Chờ duyệt':'Không cần duyệt',importantFinal:i===6,hours:i%2?null:4,result:i>=4?{text:'Video minh hoạ',link:'https://example.com/video/'+i}:null,completedAt:i===7?stamp('2026-09-08T15:00:00'):null,history:'[]'}));
  for(let i=0;i<6;i++)tables.design.records.push(raw('design','recDesign'+i,{title:['Bộ ảnh giới thiệu sản phẩm','Banner chiến dịch tháng 9','Ảnh hướng dẫn lắp đặt','Ảnh bìa Fanpage','Bộ ảnh thông số','Hình sản phẩm mới'][i],code:'D-00'+(i+1),createdAt:stamp('2026-09-01T09:00:00'),deadline:stamp('2026-09-15T23:59:00'),requester:'Content A',assignees:[people[2+i%2]],stage:['Chờ kiểm tra brief','Đã nhận order','Đang thiết kế','Cần sửa','Đang thiết kế','Hoàn thành'][i],style:'Gọn, rõ thông tin, theo bộ nhận diện Sakawin.',size:'1080 × 1080',quantity:3,result:i>=4?{link:'https://example.com/design/'+i,text:'Ảnh minh hoạ'}:null,history:'[]'}));
  const completedDesign=tables.design.records[5];
  completedDesign.fields[schemas.design.history[0]]=JSON.stringify([{at:stamp('2026-09-08T15:00:00'),by:people[0].email,name:people[0].name,action:'stage',detail:{from:'Đang thiết kế',to:'Hoàn thành',designState:{stage:'Hoàn thành',completedAt:stamp('2026-09-08T15:00:00'),output:designOutput(decode('design',completedDesign))}}}]);
  const calls=[];
  const client={targets:{design:{base:'baseDesign',table:'tblDesign'},media:{base:'baseMedia',table:'tblMedia'},shoots:{base:'baseMedia',table:'tblShoots'}},
    async list(team,kind){calls.push({team,kind,method:'GET'});return structuredClone(tables[team][kind]);},
    async get(team,id){calls.push({team,id,method:'GET'});const row=tables[team].records.find(r=>r.record_id===id);if(!row)throw fail(404,'Không tìm thấy bản ghi minh hoạ.');return structuredClone(row);},
    async save(team,values,metadata,{id,key}={}){
      const absent=missing(team,metadata,Object.keys(values));if(absent.length)throw fail(409,'Thiếu cột: '+absent.map(x=>x.name).join(', '));
      calls.push({team,values:structuredClone(values),method:id?'PUT':'POST'});
      const record=id?tables[team].records.find(r=>r.record_id===id):{record_id:'recNew'+next++,fields:{}};
      if(!record)throw fail(404,'Không tìm thấy bản ghi.');
      for(const [k,v]of Object.entries(values)){const [name,type]=schemas[team][k];record.fields[name]=type===11?v.map(x=>people.find(p=>p.id===x.id)||x):v;}
      if(!id)tables[team].records.push(record);return structuredClone(record);
    }};
  const user={email:people[0].email,ten:'Content A',quyen:{xem_order:true,ghi_order:true,duyet_order:true}};
  return {tables,client,calls,user,people};
}
const env={SITE_URL:'http://127.0.0.1:4323',ORDER_WRITES_ENABLED:'true'};
function auth(user){return {async canhCong(req,res,right){if(!user){res.status(401).json({ok:false,error:'Chưa đăng nhập.'});return null;}if(user.quyen[right]!==true){res.status(403).json({ok:false,error:'Chưa được cấp quyền.'});return null;}return user;}};}
module.exports={fixture,auth,env};
