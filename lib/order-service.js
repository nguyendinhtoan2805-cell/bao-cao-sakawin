'use strict';
const crypto = require('node:crypto');
const S = require('./order-schema.js');
const {fail,revision} = require('./order-lark.js');
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function string(v, label, max=5000, required=false) {
  if (typeof v!=='string' || v.length>max || (required && !v.trim())) throw fail(400,label+' không hợp lệ.');
  return v.trim();
}
function link(v) {
  if (!v) return '';
  const s=string(v,'Liên kết',2000); let u; try { u=new URL(s); } catch { throw fail(400,'Liên kết không hợp lệ.'); }
  if (!['https:','http:'].includes(u.protocol) || u.username || u.password) throw fail(400,'Chỉ chấp nhận liên kết http/https.');
  return u.href;
}
function date(v,label,required=false) {
  if ((v===null || v==='') && !required) return null;
  if (typeof v!=='number' || !Number.isFinite(v) || v<946684800000 || v>4102444800000) throw fail(400,label+' không hợp lệ.');
  return v;
}
function ids(v, roster) {
  if (!Array.isArray(v) || v.length>30 || v.some(id=>typeof id!=='string' || !roster.some(p=>p.id===id))) throw fail(400,'Nhân sự chưa có trong danh sách đã đối chiếu Lark.');
  return [...new Set(v)].map(id=>({id}));
}
const fingerprint=(task,kind)=>kind==='script'?digest([task.scriptLink,task.brief]):digest([task.result,task.resultFacebook,task.quantity,task.style,task.color,task.size,task.format]);
function approved(task,kind) { const r=kind==='script'?task.scriptReview:task.finalReview; return (kind!=='script'||task.scriptApproval==='Đã duyệt') && r?.decision==='approved' && r.fingerprint===fingerprint(task,kind); }
function expose(team,record) {
  const task=S.decode(team,record); task.revision=revision(record);
  for(const [key, value] of Object.entries(task)) if(Array.isArray(value) && value[0]?.id)task[key]=value.map(({email,...p})=>p);
  if(team!=='shoots'){task.scriptApproved=team==='media' && approved(task,'script');task.finalApproved=approved(task,'final');}
  return task;
}
async function context(client,env={}) {
  const tables={};
  for(const team of ['design','media',...(client.targets.shoots.table?['shoots']:[])]) {
    const [fields,records]=await Promise.all([client.list(team,'fields'),client.list(team,'records')]);
    tables[team]={fields,records};
  }
  const roster=new Map();
  for(const [team,t]of Object.entries(tables))for(const r of t.records)for(const [name,type]of Object.values(S.schemas[team]))if(type===11)for(const p of S.people(r.fields[name]))roster.set(p.id,{...roster.get(p.id),...p});
  if(env.LARK_ORDER_USER_MAP) {
    let map;try{map=JSON.parse(env.LARK_ORDER_USER_MAP);}catch{throw fail(503,'Cấu hình đối chiếu nhân sự Order không hợp lệ.');}
    if(!Array.isArray(map) || map.some(p=>!/^ou_[A-Za-z0-9]+$/.test(p.id) || typeof p.email!=='string' || typeof p.name!=='string'))throw fail(503,'Cấu hình đối chiếu nhân sự Order không hợp lệ.');
    for(const p of map)roster.set(p.id,p);
  }
  return {tables,roster:[...roster.values()],shootTable:client.targets.shoots.table};
}
function requirements(ctx) {
  const result={};
  for(const team of ['design','media','shoots']) {
    const keys=S.workflowKeys[team];
    result[team]=ctx.tables[team]?S.missing(team,ctx.tables[team].fields,keys):[{name:'Bảng Buổi quay',reason:'table'}];
    if(team==='media') {
      const relation=ctx.tables.media?.fields.find(f=>f.field_name===S.schemas.media.shoot[0]);
      if(relation&&relation.property?.table_id!==ctx.shootTable)result.media.push({name:S.schemas.media.shoot[0],reason:'relation'});
    }
  }
  const approval=ctx.tables.media?.fields.find(f=>f.field_name===S.schemas.media.scriptApproval[0]);
  if(approval && S.scriptApprovalOptions.some(name=>!approval.property?.options?.some(o=>o.name===name)))result.media.push({name:S.schemas.media.scriptApproval[0],reason:'options'});
  const status=ctx.tables.design?.fields.find(f=>f.field_name===S.schemas.design.stage[0]);
  if(status)for(const [stage,names] of Object.entries(S.designStageOptions))if(!names.some(name=>status.property?.options?.some(o=>o.name===name)))result.design.push({name:'Trạng thái — thêm lựa chọn '+stage,reason:'options'});
  return result;
}
function designStageValue(stage,metadata) {
  const options=metadata.find(f=>f.field_name===S.schemas.design.stage[0])?.property?.options || [];
  const value=S.designStageOptions[stage]?.find(name=>options.some(o=>o.name===name));
  if(!value)throw fail(409,'Cột Trạng thái chưa có lựa chọn cho bước '+stage+'. Giữ nguyên lựa chọn cũ, bổ sung bước còn thiếu trước khi lưu.');
  return value;
}
function validateScriptApproval(values,metadata) {
  if(own(values,'scriptApproval')&&!metadata.find(f=>f.field_name===S.schemas.media.scriptApproval[0])?.property?.options?.some(o=>o.name===values.scriptApproval))throw fail(409,'Cột Duyệt kịch bản chưa đủ các lựa chọn đã chốt.');
}
function editable(team,input,roster,metadata) {
  const allow=team==='shoots'?['title','start','end','location','hosts','crew','notes']
    :['title','deadline','assignees',...(team==='media'?['hours','importantFinal','month','brief','scriptLink','channels','notes','result','resultFacebook','importantScript']:['code','style','color','size','format','quantity','result','priority'])];
  const out={};
  for(const [k,v]of Object.entries(input)) {
    if(!allow.includes(k))throw fail(400,'Trường không được phép sửa: '+k);
    if(['importantFinal','importantScript'].includes(k)){if(typeof v!=='boolean')throw fail(400,'Cờ duyệt không hợp lệ.');out[k==='importantScript'?'scriptApproval':k]=k==='importantScript'?(v?'Cần duyệt':'Không cần duyệt'):v;}
    else if(['assignees','hosts','crew'].includes(k))out[k]=ids(v,roster);
    else if(['start','end','deadline'].includes(k))out[k]=date(v,k,k!=='deadline');
    else if(['hours','quantity'].includes(k)){if(v!==null && (typeof v!=='number'||!Number.isFinite(v)||v<0||v>10000||k==='quantity'&&!Number.isInteger(v)))throw fail(400,'Khối lượng không hợp lệ.');out[k]=v;}
    else if(['scriptLink','result'].includes(k)){const value=link(v);out[k]=value?{link:value,text:'Mở liên kết'}:null;}
    else if(k==='resultFacebook')out[k]=link(v);
    else if(k==='channels') {
      const options=metadata.find(f=>f.field_name===S.schemas[team][k][0])?.property?.options?.map(o=>o.name)||[];
      if(!Array.isArray(v)||v.length>15||v.some(x=>!options.includes(x)))throw fail(400,'Kênh phải thuộc các lựa chọn hiện có trong Lark.');out[k]=v;
    } else if(k==='priority'||k==='month'||k==='format') {
      const options=metadata.find(f=>f.field_name===S.schemas[team][k][0])?.property?.options?.map(o=>o.name)||[];
      if(v!==null && !options.includes(v))throw fail(400,'Lựa chọn '+S.schemas[team][k][0]+' chưa có trong Lark.');out[k]=v;
    } else out[k]=string(v,k,k==='title'?250:5000,k==='title');
  }
  return out;
}
function merged(team,record,patch) {
  return S.decode(team,{...record,fields:{...record.fields,...Object.fromEntries(Object.entries(patch).filter(([k])=>S.schemas[team][k]).map(([k,v])=>[S.schemas[team][k][0],v]))}});
}
function assertStage(team,task,to) {
  if(!S.stages[team].includes(to))throw fail(400,'Tiến độ không hợp lệ.');
  if(to==='Chờ duyệt kịch bản'&&!task.importantScript||to==='Chờ duyệt thành phẩm'&&!task.importantFinal)throw fail(400,'Chỉ nội dung được đánh dấu quan trọng mới cần gửi Lead duyệt.');
  if(team==='media' && ['Sẵn sàng quay','Đã quay','Đang dựng','Chờ duyệt thành phẩm','Cần sửa','Hoàn thành'].includes(to)) {
    if(!task.scriptLink)throw fail(400,'Cần gắn link kịch bản vào order.');
    if(task.importantScript && !approved(task,'script'))throw fail(409,'Kịch bản quan trọng cần Lead duyệt trước khi thực hiện.');
  }
  if(team==='design' && ['Đang thiết kế','Cần sửa','Hoàn thành'].includes(to) && !['Đã nhận order','Đang thiết kế','Cần sửa','Hoàn thành'].includes(task.stage))throw fail(409,'Design cần nhận order sau khi kiểm tra brief.');
  if(to==='Chờ duyệt kịch bản' && !task.scriptLink)throw fail(400,'Chưa có kịch bản để gửi duyệt.');
  if(['Chờ duyệt thành phẩm','Hoàn thành'].includes(to) && !task.result && !task.resultFacebook)throw fail(400,'Cần có liên kết thành phẩm.');
  if(to==='Hoàn thành') {
    if(!task.assignees.length)throw fail(400,'Cần ghi nhận nhân sự thực hiện trước khi hoàn thành.');
    if(task.importantFinal && !approved(task,'final'))throw fail(409,'Thành phẩm quan trọng cần Lead duyệt trước khi hoàn thành.');
    if(team==='design' && !(task.quantity>0))throw fail(400,'Cần nhập số trang / ảnh thực tế trước khi hoàn thành.');
  }
}
function journal(task,user,action,detail) {
  const history=[...task.history,{at:Date.now(),by:user.email,name:user.ten,action,detail}];
  const raw=JSON.stringify(history);
  if(raw.length>85000)throw fail(409,'Nhật ký đã dài; cần lưu trữ lịch sử trước khi tiếp tục. Không tự cắt lịch sử.');
  return raw;
}
function creationKey(user,team,key) {
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key||''))throw fail(400,'Thiếu mã yêu cầu tạo mới.');
  const s=digest([user.email,team,key]); return s.slice(0,8)+'-'+s.slice(8,12)+'-4'+s.slice(13,16)+'-a'+s.slice(17,20)+'-'+s.slice(20,32);
}
async function create(client,ctx,user,body) {
  const team=body.team, metadata=ctx.tables[team]?.fields;
  if(!metadata)throw fail(503,'Chưa cấu hình bảng Buổi quay.');
  const key=creationKey(user,team,body.key), values=editable(team,body.values||{},ctx.roster,metadata);
  if(!values.title)throw fail(400,'Cần nhập tên order hoặc buổi quay.');
  const inputHash=digest(values),old=(await client.list(team,'records')).find(r=>team==='design'?S.decode(team,r).requestKey===key:S.text(r.fields[S.schemas[team].requestKey[0]])===key);
  if(old) {
    const task=S.decode(team,old);
    if(task.history[0]?.detail?.inputHash!==inputHash)throw fail(409,'Mã gửi này đã dùng với nội dung khác. Tải lại trước khi tạo order mới.');
    return expose(team,old);
  }
  if(team==='shoots') {
    date(values.start,'Bắt đầu',true);date(values.end,'Kết thúc',true);
    if(values.end<=values.start)throw fail(400,'Giờ kết thúc phải sau giờ bắt đầu.');
  } else {
    date(values.deadline,'Deadline',true);
    values.stage=S.stages[team][0];values.createdAt=Date.now();
    if(team==='media') {
      if(!values.month)throw fail(400,'Cần chọn tháng kế hoạch trong Base Media.');
      const who=ctx.roster.find(p=>p.email?.toLowerCase()===user.email.toLowerCase());
      if(!who)throw fail(409,'Chưa đối chiếu tài khoản của bạn với trường Người Order trong Lark. Quản trị cần bổ sung ánh xạ nhân sự trước khi tạo.');
      values.requester=[{id:who.id}];
      values.scriptApproval ||= 'Không cần duyệt';
      validateScriptApproval(values,metadata);
    } else {
      const options=metadata.find(f=>f.field_name===S.schemas.design.requester[0])?.property?.options||[];
      const configured=ctx.roster.find(p=>p.email?.toLowerCase()===user.email.toLowerCase())?.designName;
      const who=options.find(o=>o.name===(configured||user.ten));
      if(!who)throw fail(409,'Tên người order chưa khớp lựa chọn Người Order trong Base Design. Cần đối chiếu trước khi tạo.');
      values.requester=who.name;
    }
  }
  if(team==='design') {
    values.stage=designStageValue(values.stage,metadata);
    const next=merged(team,{fields:{}},values);
    values.history=journal({history:[]},user,'create',{inputHash,requestKey:key,designState:{stage:next.stage,completedAt:null,output:S.designOutput(next)}});
  } else Object.assign(values,{requestKey:key,creator:user.email,history:journal({history:[]},user,'create',{inputHash})});
  return expose(team,await client.save(team,values,metadata,{key}));
}
async function update(client,ctx,user,body) {
  const {team,id,action}=body, metadata=ctx.tables[team]?.fields;
  if(!metadata)throw fail(503,'Bảng chưa sẵn sàng.');
  const record=await client.get(team,id),task=S.decode(team,record);
  if(body.revision!==revision(record))throw fail(409,'Order hoặc buổi quay đã thay đổi. Tải lại để xem bản mới trước khi lưu.');
  if(team==='design' && task.historyInvalid)throw fail(409,'Cột Lịch sử không đúng định dạng. Đã dừng để tránh ghi đè lịch sử hiện có.');
  let values={},detail={},scriptReviewChange;
  if(action==='edit') {
    values=editable(team,body.values||{},ctx.roster,metadata);
    for(const flag of ['importantFinal','importantScript'])if(task[flag] && body.values?.[flag]===false && !user.quyen.duyet_order)throw fail(403,'Chỉ Lead được bỏ yêu cầu duyệt đã đánh dấu.');
    if(team==='media' && own(body.values||{},'importantScript')) {
      if(body.values.importantScript===task.importantScript)delete values.scriptApproval;
      else scriptReviewChange=null;
    }
    const next=merged(team,record,values);
    if(team==='shoots') {if(next.end<=next.start)throw fail(400,'Giờ kết thúc phải sau giờ bắt đầu.');}
    else {
      const scriptChanged=team==='media' && fingerprint(next,'script')!==fingerprint(task,'script');
      const resultChanged=(fingerprint(next,'final')!==fingerprint(task,'final') || team==='design' && S.designOutput(next)!==S.designOutput(task)) && !!(task.result||task.resultFacebook||next.result||next.resultFacebook||task.finalReview);
      if(scriptChanged) {values.scriptApproval=next.importantScript?'Cần duyệt':'Không cần duyệt';scriptReviewChange=null;values.finalReview='';values.completedAt=null;values.stage='Đang viết kịch bản';}
      else if(resultChanged) {values.finalReview='';values.completedAt=null;values.stage=team==='media'?'Đang dựng':'Đang thiết kế';}
      if(next.importantScript&&!task.importantScript){values.stage=next.scriptLink?'Đang viết kịch bản':'Chưa viết kịch bản';values.completedAt=null;}
      if(values.importantFinal===true&&!task.importantFinal&&task.stage==='Hoàn thành'&&!approved(next,'final')){values.stage='Chờ duyệt thành phẩm';values.completedAt=null;}
    }
    detail={fields:Object.keys(values),changes:Object.fromEntries(Object.keys(values).filter(k=>!['history','scriptReview','finalReview'].includes(k)).map(k=>{
      const before=S.schemas[team][k] ? record.fields[S.schemas[team][k][0]]??null : task[k]??null,after=values[k];
      return [k,{before,after}];
    }))};
    if(team!=='shoots'&&values.stage&&values.stage!==task.stage)assertStage(team,{...merged(team,record,values),stage:task.stage},values.stage);
  } else if(action==='refreshScript') {
    if(team!=='media' || !task.scriptLink)throw fail(400,'Order chưa có link kịch bản Drive.');
    values={scriptApproval:task.importantScript?'Cần duyệt':'Không cần duyệt',finalReview:'',completedAt:null,stage:'Đang viết kịch bản'};scriptReviewChange=null;
    detail={note:'Nhân sự xác nhận đã sửa nội dung tài liệu Drive; cần kiểm tra / duyệt lại.'};
  } else if(action==='assignShoot') {
    if(team!=='media')throw fail(400,'Chỉ Media có buổi quay.');
    if(body.shootId)await client.get('shoots',body.shootId);
    values.shoot=body.shootId?[body.shootId]:[];
    detail={from:task.shoot,to:values.shoot};
  } else if(action==='stage') {
    if(team==='shoots')throw fail(400,'Buổi quay không có bước duyệt lịch.');
    assertStage(team,task,body.stage);values.stage=body.stage;
    if(team==='media'&&body.stage==='Chờ duyệt kịch bản'){values.scriptApproval='Chờ duyệt';scriptReviewChange=null;}
    values.completedAt=body.stage==='Hoàn thành'?(task.completedAt || (team==='design' && task.stage==='Hoàn thành'?null:Date.now())):null;
    // Preserve existing coarse reporting choices while tracking detailed workflow separately.
    const legacy=body.stage==='Hoàn thành'?'Hoàn thành':team==='media'&&['Đã quay','Đang dựng','Chờ duyệt thành phẩm','Cần sửa'].includes(body.stage)?'Đang dựng':team==='media'?'Chưa thực hiện':'Chưa làm';
    const options=team==='media'?(metadata.find(f=>f.field_name===S.schemas.media.legacyStage[0])?.property?.options||[]):[];
    if(options.some(o=>o.name===legacy))values.legacyStage=legacy;
    detail={from:task.stage,to:body.stage};
  } else if(action==='review') {
    if(!user.quyen.duyet_order)throw fail(403,'Bạn chưa có quyền duyệt Order.');
    if(!['script','final'].includes(body.kind)||!['approved','rejected'].includes(body.decision)||team!=='media')throw fail(400,'Thao tác duyệt không hợp lệ.');
    const isScript=body.kind==='script';
    if(!(isScript?task.importantScript:task.importantFinal))throw fail(409,'Công việc này không được đánh dấu cần Lead duyệt.');
    if(task.stage!==(isScript?'Chờ duyệt kịch bản':'Chờ duyệt thành phẩm'))throw fail(409,'Công việc chưa ở bước chờ duyệt tương ứng.');
    if(isScript&&!task.scriptLink || !isScript&&!task.result&&!task.resultFacebook)throw fail(400,'Chưa có nội dung để duyệt.');
    const note=string(body.note||'','Góp ý',5000,body.decision==='rejected');
    const approval={decision:body.decision,by:user.email,name:user.ten,at:Date.now(),note,fingerprint:fingerprint(task,body.kind)};
    if(isScript){values.scriptApproval=body.decision==='approved'?'Đã duyệt':'Cần sửa';scriptReviewChange=approval;}
    else values.finalReview=JSON.stringify(approval);
    values.stage=body.decision==='rejected'?(isScript?'Cần sửa kịch bản':'Cần sửa'):(isScript?'Sẵn sàng quay':'Chờ duyệt thành phẩm');
    values.completedAt=null;detail={kind:body.kind,decision:body.decision,note};
  } else throw fail(400,'Thao tác không được hỗ trợ.');
  if(team==='media' && values.stage && action!=='stage') {
    const legacy=values.stage==='Hoàn thành'?'Hoàn thành':team==='media'&&['Đã quay','Đang dựng','Chờ duyệt thành phẩm','Cần sửa'].includes(values.stage)?'Đang dựng':team==='media'?'Chưa thực hiện':'Chưa làm';
    const options=metadata.find(f=>f.field_name===S.schemas[team].legacyStage[0])?.property?.options||[];
    if(options.some(o=>o.name===legacy))values.legacyStage=legacy;
  }
  if(scriptReviewChange!==undefined)detail.scriptReview=scriptReviewChange;
  if(team==='media')validateScriptApproval(values,metadata);
  if(team==='design') {
    const next=merged(team,record,values);
    detail.designState={stage:next.stage,completedAt:next.stage==='Hoàn thành'?(own(values,'completedAt')?values.completedAt:task.completedAt):null,output:S.designOutput(next)};
    // Completion, actor and retry identity live in the same history column, never in MÃ DESIGN.
    delete values.completedAt; delete values.finalReview;
    if(own(values,'stage'))values.stage=designStageValue(values.stage,metadata);
  }
  values.history=journal(task,user,action,detail);
  return expose(team,await client.save(team,values,metadata,{id}));
}
module.exports={context,requirements,expose,create,update,creationKey,approved,editable,assertStage};
