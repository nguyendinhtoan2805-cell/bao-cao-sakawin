'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeHandler}=require('../api/orders.js');
const {fixture,auth,env}=require('./order-fixture.cjs');
const {makeClient,revision,withLease}=require('../lib/order-lark.js');
const {schemas,decode}=require('../lib/order-schema.js');
async function call(handler,{method='GET',body={},query={},headers={origin:env.SITE_URL,host:'127.0.0.1:4323'}}={}){const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(j){this.body=j;return this;}};await handler({method,body,headers,query},res);return res;}
function setup(patch={}){const f=fixture();return {...f,handler:makeHandler({env,auth:auth(f.user),clientFactory:()=>f.client,lease:async(k,work)=>work(),...patch})};}
const post=(h,body)=>call(h,{method:'POST',body});
function vals(){return {title:'Order mới minh hoạ',month:'T9.2026',deadline:Date.parse('2026-09-20T23:59:00+07:00'),assignees:['ou_demoC'],importantScript:true,importantFinal:true,scriptLink:'https://example.com/script/new'};}
test('No read or write happens before the separate Order permission gate',async()=>{
  for(const user of [null,{quyen:{xem_nhan_su:true,xem_tuyen_dung:true,duoc_sua:true}},{quyen:{xem_order:false,ghi_order:true}}]){const x=setup({auth:auth(user)});assert.equal((await call(x.handler)).code,user?403:401);assert.equal(x.calls.length,0);}
});
test('Order read is shared across teams, explicitly projected, no unknown fields or person emails',async()=>{
  const x=setup();x.tables.media.records[0].fields['PRIVATE_UNRELATED']='DO_NOT_RETURN';const r=await call(x.handler);assert.equal(r.body.data.media.length,8);assert.equal(r.body.data.design.length,6);assert.equal(r.body.data.shoots.length,4);assert.equal(r.headers['Cache-Control'],'no-store');assert.ok(!JSON.stringify(r.body).includes('DO_NOT_RETURN'));assert.ok(!JSON.stringify(r.body.people).includes('@'));assert.deepEqual(r.body.connection.missing.media,[]);
});
test('Viewer, foreign origin, missing origin and disabled integration cannot write',async()=>{
  const b={team:'media',action:'create',key:crypto.randomUUID(),values:vals()};
  for(const config of [{auth:auth({email:'viewer',quyen:{xem_order:true}})},{env:{...env,ORDER_WRITES_ENABLED:'false'}}]){const x=setup(config);assert.ok([403,503].includes((await post(x.handler,b)).code));assert.equal(x.calls.length,0);}
  for(const headers of [{origin:'https://evil.example',host:'127.0.0.1:4323'},{host:'127.0.0.1:4323'}]){const x=setup();assert.equal((await call(x.handler,{method:'POST',body:b,headers})).code,403);assert.equal(x.calls.length,0);}
});
test('Create order writes matching identity and retries the same request without duplicates',async()=>{
  const x=setup(),body={team:'media',action:'create',key:crypto.randomUUID(),values:vals()};const a=await post(x.handler,body),b=await post(x.handler,body);assert.equal(a.code,200,JSON.stringify(a.body));assert.equal(a.body.record.id,b.body.record.id);assert.equal(x.tables.media.records.length,9);const saved=decode('media',x.tables.media.records.at(-1));assert.equal(saved.creator,x.user.email);assert.equal(saved.requester[0].id,'ou_demoA');assert.equal(saved.month,'T9.2026');assert.equal((await post(x.handler,{...body,values:{...body.values,title:'Different'}})).code,409);
});
test('Unknown assignee, wrong field, malformed script, unsafe URL and identity spoofing fail without writes',async()=>{
  for(const change of [{assignees:['ou_unknown']},{creator:'another.person'},{script:{parts:[]}},{scriptLink:'javascript:alert(1)'},{month:'T1.1900'},{requester:['ou_demoB']}]){const x=setup(),r=await post(x.handler,{team:'media',action:'create',key:crypto.randomUUID(),values:{...vals(),...change}});assert.equal(r.code,400,JSON.stringify(r.body));assert.ok(!x.calls.some(c=>c.method==='POST'));}
});
test('Missing or wrong schema fails closed and leaves existing records untouched',async()=>{
  for(const mode of ['missing','type']){const x=setup();if(mode==='missing')x.tables.media.fields=x.tables.media.fields.filter(f=>f.field_name!==schemas.media.history[0]);else x.tables.media.fields.find(f=>f.field_name===schemas.media.history[0]).type=2;const r=await post(x.handler,{team:'media',action:'create',key:crypto.randomUUID(),values:vals()});assert.equal(r.code,409);assert.equal(x.tables.media.records.length,8);}
});
test('Staff can create a shoot and assign scripts without Lead rights; reassigning retains history',async()=>{
  const x=setup();x.user.quyen.duyet_order=false;
  const r=await post(x.handler,{team:'shoots',action:'create',key:crypto.randomUUID(),values:{title:'Buổi tự xếp',start:Date.parse('2026-09-20T09:00:00+07:00'),end:Date.parse('2026-09-20T12:00:00+07:00'),hosts:['ou_demoH'],crew:['ou_demoC'],location:'Studio',notes:''}});assert.equal(r.code,200,JSON.stringify(r.body));
  let row=x.tables.media.records[0];const a=await post(x.handler,{team:'media',action:'assignShoot',id:row.record_id,revision:revision(row),shootId:r.body.record.id});assert.equal(a.code,200);const b=await post(x.handler,{team:'media',action:'assignShoot',id:row.record_id,revision:a.body.record.revision,shootId:'recShoot1'});assert.equal(b.code,200);assert.equal(b.body.record.history.length,3);assert.deepEqual(b.body.record.history.at(-1).detail.from,[r.body.record.id]);
});
test('Stale browser cannot overwrite a revised order, including moved shoot assignment',async()=>{
  const x=setup(),r=x.tables.media.records[0],rev=revision(r);r.fields['NỘI DUNG']='Externally updated';const a=await post(x.handler,{team:'media',action:'edit',id:r.record_id,revision:rev,values:{title:'Stale'}});assert.equal(a.code,409);assert.ok(!x.calls.some(c=>c.method==='PUT'));
});
test('Important script and final require separate Lead approval; ordinary staff cannot bypass or unflag',async()=>{
  const x=setup();let t=(await post(x.handler,{team:'media',action:'create',key:crypto.randomUUID(),values:vals()})).body.record;
  const action=async data=>{const r=await post(x.handler,{team:'media',id:t.id,revision:t.revision,...data});if(r.body.record)t=r.body.record;return r;};
  assert.equal((await action({action:'stage',stage:'Sẵn sàng quay'})).code,409);
  assert.equal((await action({action:'stage',stage:'Chờ duyệt kịch bản'})).code,200);
  x.user.quyen.duyet_order=false;
  assert.equal((await action({action:'review',kind:'script',decision:'approved'})).code,403);
  assert.equal((await action({action:'edit',values:{importantScript:false}})).code,403);
  x.user.quyen.duyet_order=true;
  assert.equal((await action({action:'review',kind:'script',decision:'approved'})).code,200);assert.equal(t.scriptApproved,true);
  assert.equal((await action({action:'edit',values:{result:'https://example.com/final'}})).code,200);
  assert.equal((await action({action:'stage',stage:'Hoàn thành'})).code,409);
  assert.equal((await action({action:'stage',stage:'Chờ duyệt thành phẩm'})).code,200);
  assert.equal((await action({action:'review',kind:'final',decision:'approved'})).code,200);
  assert.equal((await action({action:'stage',stage:'Hoàn thành'})).code,200);assert.ok(t.completedAt);assert.equal(t.finalApproved,true);
  assert.equal((await action({action:'edit',values:{result:'https://example.com/revised'}})).code,200);assert.equal(t.finalApproved,false);assert.equal(t.completedAt,null);assert.equal(t.legacyStage,'Đang dựng');
});
test('Drive change report invalidates prior reviews even when URL is unchanged',async()=>{
  const x=setup(),r=x.tables.media.records[7];const result=await post(x.handler,{team:'media',action:'refreshScript',id:r.record_id,revision:revision(r)});assert.equal(result.code,200);assert.equal(result.body.record.stage,'Đang viết kịch bản');assert.equal(result.body.record.completedAt,null);assert.equal(result.body.record.finalReview,null);assert.equal(result.body.record.legacyStage,'Chưa thực hiện');
});
test('An ordinary completed video needs no Lead review and keeps its first completion timestamp',async()=>{
  const x=setup(),r=x.tables.media.records[4];x.user.quyen.duyet_order=false;let a=await post(x.handler,{team:'media',action:'stage',id:r.record_id,revision:revision(r),stage:'Hoàn thành'});assert.equal(a.code,200);const at=a.body.record.completedAt;a=await post(x.handler,{team:'media',action:'stage',id:r.record_id,revision:a.body.record.revision,stage:'Hoàn thành'});assert.equal(a.body.record.completedAt,at);
});
test('Design cannot skip initial brief acceptance',async()=>{
  const x=setup(),r=x.tables.design.records[0];const a=await post(x.handler,{team:'design',action:'stage',id:r.record_id,revision:revision(r),stage:'Đang thiết kế'});assert.equal(a.code,409);const b=await post(x.handler,{team:'design',action:'stage',id:r.record_id,revision:revision(r),stage:'Đã nhận order'});assert.equal(b.code,200);
  r.fields['Trạng thái']='Legacy status not mapped';assert.equal((await post(x.handler,{team:'design',action:'stage',id:r.record_id,revision:revision(r),stage:'Đang thiết kế'})).code,409);
});
test('Lark client uses configured targets and fails incomplete pagination without returning partial data',async()=>{
  const env={LARK_ORDER_APP_ID:'fake',LARK_ORDER_APP_SECRET:'fake',LARK_ORDER_DESIGN_BASE:'baseDesign',LARK_ORDER_DESIGN_TABLE:'tblDesign',LARK_ORDER_MEDIA_BASE:'baseMedia',LARK_ORDER_MEDIA_TABLE:'tblMedia',LARK_ORDER_SHOOTS_TABLE:'tblShoots'};
  const urls=[],fetcher=async(u,o)=>{urls.push(String(u));return{ok:true,json:async()=>String(u).includes('/auth/')?{code:0,tenant_access_token:'FAKE'}:{code:0,data:{items:[],has_more:true}}};};
  const c=makeClient({env,fetcher});await assert.rejects(c.list('media','records'),/Phân trang/);assert.ok(urls.at(-1).includes('/apps/baseMedia/tables/tblMedia/records'));assert.throws(()=>makeClient({env:{...env,LARK_ORDER_MEDIA_BASE:'../../salaries'},fetcher}));
});
test('Lark transport serializes relation, person, URL and client_token correctly and sanitizes upstream errors',async()=>{
  const fx=fixture(),env={LARK_ORDER_APP_ID:'fake',LARK_ORDER_APP_SECRET:'fake',LARK_ORDER_DESIGN_BASE:'baseDesign',LARK_ORDER_DESIGN_TABLE:'tblDesign',LARK_ORDER_MEDIA_BASE:'baseMedia',LARK_ORDER_MEDIA_TABLE:'tblMedia',LARK_ORDER_SHOOTS_TABLE:'tblShoots'},calls=[];
  let saved={}; const c=makeClient({env,fetcher:async(u,o)=>{calls.push({u:String(u),o});if(o.body&&!String(u).includes('/auth/'))saved=JSON.parse(o.body).fields;return{ok:true,json:async()=>String(u).includes('/auth/')?{code:0,tenant_access_token:'FAKE'}:{code:0,data:{record:{record_id:'recTest',fields:saved}}}};}});
  await c.save('media',{shoot:['recShoot1'],assignees:[{id:'ou_demoA'}],result:{link:'https://example.com',text:'Mở'}},fx.tables.media.fields,{key:'test-key'});
  assert.match(calls.at(-2).u,/client_token=test-key/);assert.deepEqual(JSON.parse(calls.at(-2).o.body).fields[schemas.media.shoot[0]],['recShoot1']);assert.equal(calls.at(-2).o.method,'POST');assert.equal(calls.at(-1).o.method,'GET');
});
test('Lease rejects a concurrent writer, checks remaining ownership and never needs the user store contents',async()=>{
  const held=new Map(),env={KV_REST_API_URL:'https://fake.invalid',KV_REST_API_TOKEN:'fake'};let proceed,entered;
  const gate=new Promise(r=>proceed=r),ready=new Promise(r=>entered=r);
  const fetcher=async(u,o)=>{const a=JSON.parse(o.body);let result;
    if(a[0]==='SET'){result=held.has(a[1])?null:'OK';if(result)held.set(a[1],a[2]);}
    else if(a[0]==='EVAL'){const match=held.get(a[3])===a[4];if(a[1].includes('PTTL'))result=match?1:0;else{result=match?1:0;if(match)held.delete(a[3]);}}
    else throw Error('Unexpected Redis command');return{ok:true,json:async()=>({result})};};
  const first=withLease('media:recTest',async check=>{await check();entered();await gate;return 'saved';},{env,fetcher});await ready;
  await assert.rejects(withLease('media:recTest',async()=>{throw Error('must not run');},{env,fetcher}),e=>e.statusCode===409);proceed();assert.equal(await first,'saved');assert.equal(held.size,0);
  await assert.rejects(withLease('media:recTest',async()=>{}, {env:{},fetcher}),e=>e.statusCode===503);
});
test('Editing pending Design brief stays in brief stage, and zero output cannot be completed',async()=>{
  const x=setup();let r=x.tables.design.records[0];const a=await post(x.handler,{team:'design',action:'edit',id:r.record_id,revision:revision(r),values:{style:'Yêu cầu mới'}});assert.equal(a.code,200);assert.equal(a.body.record.stage,'Chờ kiểm tra brief');
  r=x.tables.design.records[5];r.fields[schemas.design.quantity[0]]=0;assert.equal((await post(x.handler,{team:'design',action:'stage',id:r.record_id,revision:revision(r),stage:'Hoàn thành'})).code,400);
});
test('Revision hash ignores field object ordering but detects content changes',()=>{
  assert.equal(revision({fields:{a:1,b:{y:2,x:3}}}),revision({fields:{b:{x:3,y:2},a:1}}));assert.notEqual(revision({fields:{a:1}}),revision({fields:{a:2}}));
});
test('Lark diagnostic refuses unknown relation target and never claims a failed readback was saved',async()=>{
  const x=fixture(),env={LARK_ORDER_APP_ID:'fake',LARK_ORDER_APP_SECRET:'fake',LARK_ORDER_DESIGN_BASE:'baseDesign',LARK_ORDER_DESIGN_TABLE:'tblDesign',LARK_ORDER_MEDIA_BASE:'baseMedia',LARK_ORDER_MEDIA_TABLE:'tblMedia',LARK_ORDER_SHOOTS_TABLE:'tblShoots'};
  const c=makeClient({env,fetcher:async(u,o)=>({ok:true,json:async()=>String(u).includes('/auth/')?{code:0,tenant_access_token:'FAKE'}:{code:0,data:{record:{record_id:'recTest',fields:{}}}}})});
  const metadata=structuredClone(x.tables.media.fields);metadata.find(f=>f.field_name===schemas.media.shoot[0]).property.table_id='tblUnrelated';
  await assert.rejects(c.save('media',{shoot:['recShoot1']},metadata,{key:'test'}),e=>e.statusCode===409);
  await assert.rejects(c.save('media',{title:'Must read back this title'},x.tables.media.fields,{key:'test'}),e=>e.statusCode===409);
});

test('Ordinary work does not enter a Lead review queue',async()=>{
  const x=setup(),r=x.tables.media.records[4];
  for(const stage of ['Chờ duyệt kịch bản','Chờ duyệt thành phẩm']){
    const result=await post(x.handler,{team:'media',action:'stage',id:r.record_id,revision:revision(r),stage});
    assert.equal(result.code,400);assert.match(result.body.error,/quan trọng/);
  }
  assert.ok(!x.calls.some(c=>c.method==='PUT'));
});

test('Natural field names retain readiness checks for every workflow column',async()=>{
  const {requirements}=require('../lib/order-service.js');
  const {workflowKeys}=require('../lib/order-schema.js');
  const x=setup();
  const ctx={tables:x.tables,shootTable:x.client.targets.shoots.table};
  for(const team of ['design','media','shoots']){
    assert.deepEqual(requirements(ctx)[team],[]);
    for(const key of workflowKeys[team]){
      const name=schemas[team][key][0];
      const fields=x.tables[team].fields;
      x.tables[team].fields=fields.filter(f=>f.field_name!==name);
      assert.ok(requirements(ctx)[team].some(f=>f.name===name&&f.reason==='missing'),name);
      x.tables[team].fields=fields;
    }
  }
});
test('Media history keeps audited approval and invalidates it after document changes',async()=>{
  const x=setup();let t=(await post(x.handler,{team:'media',action:'create',key:crypto.randomUUID(),values:vals()})).body.record;
  const run=async data=>{const r=await post(x.handler,{team:'media',id:t.id,revision:t.revision,...data});if(r.body.record)t=r.body.record;return r;};
  assert.equal(t.scriptApproval,'Cần duyệt');
  assert.equal((await run({action:'stage',stage:'Chờ duyệt kịch bản'})).code,200);assert.equal(t.scriptApproval,'Chờ duyệt');
  assert.equal((await run({action:'review',kind:'script',decision:'rejected',note:'Bổ sung ví dụ'})).code,200);assert.equal(t.scriptApproval,'Cần sửa');
  await run({action:'stage',stage:'Chờ duyệt kịch bản'});await run({action:'review',kind:'script',decision:'approved'});
  assert.equal(t.scriptApproval,'Đã duyệt');assert.equal(t.scriptApproved,true);assert.equal(t.scriptReview.by,x.user.email);assert.ok(t.scriptReview.fingerprint);
  await run({action:'edit',values:{importantScript:true,title:'Tên đã đổi'}});assert.equal(t.scriptApproved,true);
  await run({action:'refreshScript'});assert.equal(t.scriptApproval,'Cần duyệt');assert.equal(t.scriptApproved,false);assert.equal(t.scriptReview,null);
  const raw=x.tables.media.records.find(r=>r.record_id===t.id);const history=JSON.parse(raw.fields['Lịch sử']);history.at(-1).detail.mediaState.scriptApproval='Đã duyệt';raw.fields['Lịch sử']=JSON.stringify(history);
  assert.equal(require('../lib/order-service.js').expose('media',raw).scriptApproved,false);
});
test('Media uses existing requester and link fields, rejects removed fields and forged review status',async()=>{
  for(const value of [{writers:['ou_demoB']},{script:{parts:[]}},{scriptApproval:'Đã duyệt'},{scriptReview:{decision:'approved'}}]){
    const x=setup();assert.equal((await post(x.handler,{team:'media',action:'create',key:crypto.randomUUID(),values:{...vals(),...value}})).code,400);
    assert.ok(!x.calls.some(c=>c.method==='POST'));
  }
  const x=setup(),data=(await call(x.handler)).body.data.media;
  assert.equal(data[0].requester[0].name,'Content A');assert.equal(data[1].requester[0].name,'Content B');
  assert.ok(data.every(t=>!Object.hasOwn(t,'writers')&&!Object.hasOwn(t,'script')));
});
test('Only existing Media fields and Lịch sử are needed; forged review label is not approval',async()=>{
  const x=setup();assert.deepEqual((await call(x.handler)).body.connection.missing.media,[]);
  const row=x.tables.media.records[1],history=JSON.parse(row.fields['Lịch sử']);history.at(-1).detail.mediaState.scriptApproval='Đã duyệt';row.fields['Lịch sử']=JSON.stringify(history);
  assert.equal((await post(x.handler,{team:'media',action:'stage',id:row.record_id,revision:revision(row),stage:'Sẵn sàng quay'})).code,409);
});
test('Existing Lark app reuse is explicit, uses only configured Order targets, and rejects partial credentials',async()=>{
  const env={LARK_APP_ID:'existing-app',LARK_APP_SECRET:'fake-secret',LARK_ORDER_DESIGN_BASE:'baseDesign',LARK_ORDER_DESIGN_TABLE:'tblDesign',LARK_ORDER_MEDIA_BASE:'baseMedia',LARK_ORDER_MEDIA_TABLE:'tblMedia',LARK_ORDER_SHOOTS_TABLE:'tblShoots'};
  assert.throws(()=>makeClient({env}),/ứng dụng Order/);
  const calls=[];const c=makeClient({env:{...env,ORDER_USE_EXISTING_LARK_APP:'true'},fetcher:async(u,o)=>{
    calls.push({u:String(u),body:o.body?JSON.parse(o.body):null});
    return{ok:true,json:async()=>String(u).includes('/auth/')?{code:0,tenant_access_token:'FAKE'}:{code:0,data:{items:[],has_more:false}}};
  }});
  await c.list('media','fields');assert.equal(calls[0].body.app_id,'existing-app');assert.match(calls[1].u,/apps\/baseMedia\/tables\/tblMedia\/fields/);
  assert.throws(()=>makeClient({env:{...env,ORDER_USE_EXISTING_LARK_APP:'true',LARK_ORDER_APP_ID:'partial'}}),/Cần đủ/);
});

test('Design creates with existing business columns only; retry identity is in history, not MÃ DESIGN',async()=>{
  const x=setup();x.user.quyen.duyet_order=false;
  const body={team:'design',action:'create',key:crypto.randomUUID(),values:{title:'Design test',code:'D-KEEP-01',deadline:Date.now()+86400000,assignees:['ou_demoC'],quantity:2}};
  const a=await post(x.handler,body),b=await post(x.handler,body);
  assert.equal(a.code,200,JSON.stringify(a.body));assert.equal(b.body.record.id,a.body.record.id);assert.equal(x.tables.design.records.length,7);
  const row=x.tables.design.records.at(-1),t=decode('design',row);
  assert.equal(row.fields['MÃ DESIGN'],'D-KEEP-01');assert.equal(row.fields['Người Order'],'Content A');assert.equal(row.fields['Trạng thái'],'Chờ kiểm tra brief');
  assert.equal(t.history[0].by,x.user.email);assert.equal(t.requestKey,t.history[0].detail.requestKey);assert.notEqual(t.requestKey,t.code);
  for(const name of ['Mã yêu cầu','Người tạo','Tiến độ chi tiết','Nhật ký','Hoàn thành lúc','Cần duyệt thành phẩm','Duyệt thành phẩm','Giờ dự kiến'])assert.equal(Object.hasOwn(row.fields,name),false,name);
  assert.equal((await post(x.handler,{...body,values:{...body.values,code:'DIFFERENT'}})).code,409);
});
test('Design completion uses append-only history, preserves timestamp on save, and invalidates on reopening or changed output',async()=>{
  const x=setup();x.user.quyen.duyet_order=false;const row=x.tables.design.records[1];let t=decode('design',row);t.revision=revision(row);
  const run=async data=>{const r=await post(x.handler,{team:'design',id:t.id,revision:t.revision,...data});assert.equal(r.code,200,JSON.stringify(r.body));t=r.body.record;return t;};
  await run({action:'edit',values:{result:'https://example.com/design/final'}});
  assert.equal(t.stage,'Đang thiết kế');assert.equal(t.history.length,1);
  await run({action:'stage',stage:'Hoàn thành'});const at=t.completedAt;assert.ok(at>0);assert.equal(t.history[1].detail.designState.completedAt,at);
  await run({action:'stage',stage:'Hoàn thành'});assert.equal(t.completedAt,at);
  await run({action:'edit',values:{title:'New title'}});assert.equal(t.completedAt,at);assert.deepEqual(t.history.at(-1).detail.changes.title,{before:'Banner chiến dịch tháng 9',after:'New title'});
  const before=structuredClone(t.history);
  await run({action:'stage',stage:'Cần sửa'});assert.equal(t.completedAt,null);assert.deepEqual(t.history.slice(0,-1),before);
  await run({action:'stage',stage:'Hoàn thành'});assert.ok(t.completedAt>=at);
  await run({action:'edit',values:{quantity:5}});assert.equal(t.completedAt,null);assert.equal(t.stage,'Đang thiết kế');
  assert.equal(row.fields['MÃ DESIGN'],'D-002');assert.equal(Object.hasOwn(row.fields,'Hoàn thành lúc'),false);
  assert.equal(t.history.length,7);assert.ok(t.history.every(h=>h.by===x.user.email&&Number.isFinite(h.at)));
});
test('Design handles legacy completion dates and malformed history without inventing a date or discarding history',async()=>{
  const x=setup(),r=x.tables.design.records[5];r.fields['Lịch sử']='[]';assert.equal(decode('design',r).completedAt,null);
  const a=await post(x.handler,{team:'design',action:'stage',id:r.record_id,revision:revision(r),stage:'Hoàn thành'});assert.equal(a.code,200);assert.equal(a.body.record.completedAt,null);
  for(const raw of ['Manual history to preserve','[null]','{"not":"a list"}']){
    r.fields['Lịch sử']=raw;const b=await post(x.handler,{team:'design',action:'edit',id:r.record_id,revision:revision(r),values:{title:'Overwrite'}});assert.equal(b.code,409);assert.equal(r.fields['Lịch sử'],raw);
  }
  const y=setup(),done=y.tables.design.records[5];assert.ok(decode('design',done).completedAt);done.fields['Số trang/ ảnh']=99;assert.equal(decode('design',done).completedAt,null);
});
test('Design rejects removed fields and Lead-review actions, while retaining brief acceptance',async()=>{
  for(const values of [{hours:1},{importantFinal:true},{finalReview:'approved'},{completedAt:Date.now()},{creator:'spoof'},{requester:'Content B'},{history:'[]'}]){
    const x=setup(),r=x.tables.design.records[1];assert.equal((await post(x.handler,{team:'design',action:'edit',id:r.record_id,revision:revision(r),values})).code,400);
    assert.ok(!x.calls.some(c=>c.method==='PUT'));
  }
  const x=setup(),r=x.tables.design.records[4];
  assert.equal((await post(x.handler,{team:'design',action:'review',id:r.record_id,revision:revision(r),kind:'final',decision:'approved'})).code,400);
  assert.equal((await post(x.handler,{team:'design',action:'stage',id:r.record_id,revision:revision(r),stage:'Chờ duyệt thành phẩm'})).code,400);
});
test('Design reuses existing status aliases and fails before saving a missing status option',async()=>{
  const x=setup(),f=x.tables.design.fields.find(f=>f.field_name==='Trạng thái'),r=x.tables.design.records[1];
  f.property.options=f.property.options.map(o=>({name:o.name==='Chờ kiểm tra brief'?'Chưa làm':o.name==='Đang thiết kế'?'Đang làm':o.name}));
  assert.deepEqual((await call(x.handler)).body.connection.missing.design,[]);
  const a=await post(x.handler,{team:'design',action:'stage',id:r.record_id,revision:revision(r),stage:'Đang thiết kế'});
  assert.equal(a.code,200);assert.equal(r.fields['Trạng thái'],'Đang làm');assert.equal(a.body.record.stage,'Đang thiết kế');
  f.property.options=f.property.options.filter(o=>o.name!=='Cần sửa');const before=structuredClone(r.fields);
  const b=await post(x.handler,{team:'design',action:'stage',id:r.record_id,revision:revision(r),stage:'Cần sửa'});
  assert.equal(b.code,409);assert.deepEqual(r.fields,before);assert.ok((await call(x.handler)).body.connection.missing.design.some(f=>f.name.includes('Cần sửa')));
});
test('Design transport writes existing status and Lịch sử with a verified readback and no removed columns',async()=>{
  const fx=fixture(),calls=[];let saved;
  const c=makeClient({env:{LARK_ORDER_APP_ID:'fake',LARK_ORDER_APP_SECRET:'fake',LARK_ORDER_DESIGN_BASE:'baseDesign',LARK_ORDER_DESIGN_TABLE:'tblDesign',LARK_ORDER_MEDIA_BASE:'baseMedia',LARK_ORDER_MEDIA_TABLE:'tblMedia'},fetcher:async(u,o)=>{
    calls.push({u:String(u),o});if(o.method==='PUT')saved=JSON.parse(o.body).fields;
    return {ok:true,json:async()=>String(u).includes('/auth/')?{code:0,tenant_access_token:'FAKE'}:{code:0,data:{record:{record_id:'recTest',fields:saved}}}};
  }});
  await c.save('design',{stage:'Đã nhận order',history:'[]'},fx.tables.design.fields,{id:'recTest'});
  assert.deepEqual(Object.keys(saved).sort(),['Lịch sử','Trạng thái']);assert.equal(calls.at(-1).o.method,'GET');
});

test('Wiki lookup resolves only configured nodes to Base tokens and reuses the Media lookup for shoots',async()=>{
  const env={LARK_ORDER_APP_ID:'fake',LARK_ORDER_APP_SECRET:'fake',LARK_ORDER_DESIGN_WIKI:'wikiDesign',LARK_ORDER_DESIGN_TABLE:'tblDesign',LARK_ORDER_MEDIA_WIKI:'wikiMedia',LARK_ORDER_MEDIA_TABLE:'tblMedia',LARK_ORDER_SHOOTS_TABLE:'tblShoots'},urls=[];
  const c=makeClient({env,fetcher:async(u)=>{u=String(u);urls.push(u);return {ok:true,json:async()=>u.includes('/auth/')?{code:0,tenant_access_token:'FAKE'}:u.includes('/wiki/')?{code:0,data:{node:{obj_type:'bitable',obj_token:u.includes('wikiDesign')?'resolvedDesign':'resolvedMedia'}}}:{code:0,data:{items:[],has_more:false}}};}});
  await c.list('design','fields');await Promise.all([c.list('media','fields'),c.list('shoots','fields')]);
  assert.equal(urls.filter(u=>u.includes('/wiki/')).length,2);assert.ok(urls.some(u=>u.includes('/apps/resolvedMedia/tables/tblShoots/fields')));assert.ok(urls.some(u=>u.includes('/apps/resolvedDesign/tables/tblDesign/fields')));
  for(const response of [{code:99991672},{code:0,data:{node:{obj_type:'docx',obj_token:'unrelated'}}}]){
    const x=makeClient({env,fetcher:async u=>({ok:true,json:async()=>String(u).includes('/auth/')?{code:0,tenant_access_token:'FAKE'}:response})});await assert.rejects(x.list('design','fields'),e=>[502,503].includes(e.statusCode));
  }
});
test('Live schema diagnostic is opt-in, admin-only and omits private field properties',async()=>{
  const x=setup();x.tables.design.fields[0].property.formula='PRIVATE_FORMULA';
  assert.equal((await call(x.handler,{query:{kiemtra:'1'}})).body.schema,undefined);
  x.user.quyen.quan_tri=true;assert.equal((await call(x.handler)).body.schema,undefined);
  const r=await call(x.handler,{query:{kiemtra:'1'}});assert.equal(r.body.schema.design.count,6);assert.equal(r.body.schema.design.fields[0].name,'Nội dung ảnh');assert.ok(!JSON.stringify(r.body.schema).includes('PRIVATE_FORMULA'));assert.ok(!JSON.stringify(r.body.schema).includes('@'));
});


test('Real Design format uses existing select options and rejects new labels',async()=>{
  const x=setup(),r=x.tables.design.records[0];
  assert.equal(schemas.design.format[1],3);
  assert.equal((await post(x.handler,{team:'design',action:'edit',id:r.record_id,revision:revision(r),values:{format:'TIFF'}})).code,400);
  const ok=await post(x.handler,{team:'design',action:'edit',id:r.record_id,revision:revision(r),values:{format:'PNG'}});
  assert.equal(ok.code,200);assert.equal(ok.body.record.format,'PNG');
  assert.equal((await post(x.handler,{team:'design',action:'edit',id:r.record_id,revision:ok.body.record.revision,values:{format:null}})).code,200);
});
test('Legacy Media Progress stays faithful without inventing script status',()=>{
  for(const stage of ['Chưa thực hiện','Đang thực hiện','Đã quay','Đang dựng','Hoàn thành','Delay']) {
    const t=decode('media',{fields:{Progress:stage,'KỊCH BẢN':{link:'https://example.com/already-written'}}});
    assert.equal(t.stage,stage);assert.equal(t.legacy,true);
  }
  assert.equal(decode('media',{fields:{}}).stage,'Chưa xác định tiến độ');
});


test('Media persists workflow exclusively in Lịch sử and reuses existing business fields',async()=>{
  const x=setup(),body={team:'media',action:'create',key:crypto.randomUUID(),values:{...vals(),code:'M-DEMO-01'}};
  const a=await post(x.handler,body);assert.equal(a.code,200,JSON.stringify(a.body));
  const row=x.tables.media.records.find(r=>r.record_id===a.body.record.id);
  assert.equal(row.fields['MÃ VIDEO'],'M-DEMO-01');assert.equal(row.fields.Progress,'Chưa thực hiện');
  for(const name of ['Mã yêu cầu','Người tạo','Tiến độ chi tiết','Nhật ký','Hoàn thành lúc','Cần duyệt thành phẩm','Duyệt thành phẩm','Giờ dự kiến','Duyệt kịch bản'])assert.equal(Object.hasOwn(row.fields,name),false,name);
  const history=JSON.parse(row.fields['Lịch sử']);assert.equal(history.length,1);assert.equal(history[0].detail.mediaState.importantFinal,true);assert.equal(history[0].detail.mediaState.scriptApproval,'Cần duyệt');
  assert.equal((await post(x.handler,body)).body.record.id,a.body.record.id);
});
test('Media history preserves missing legacy completion dates and blocks malformed history',async()=>{
  const x=setup(),row=x.tables.media.records[7];delete row.fields['Lịch sử'];
  const saved=await post(x.handler,{team:'media',action:'stage',id:row.record_id,revision:revision(row),stage:'Hoàn thành'});
  assert.equal(saved.code,200);assert.equal(saved.body.record.completedAt,null);
  row.fields['Lịch sử']='Nội dung ghi tay phải được giữ';
  const blocked=await post(x.handler,{team:'media',action:'edit',id:row.record_id,revision:revision(row),values:{title:'Unsafe edit'}});
  assert.equal(blocked.code,409);assert.equal(row.fields['Lịch sử'],'Nội dung ghi tay phải được giữ');
});
test('Media completion history is invalidated by changed output or editor, with one current completion timestamp',async()=>{
  const x=setup(),row=x.tables.media.records[4];
  const act=async b=>post(x.handler,{team:'media',id:row.record_id,revision:revision(row),...b});
  const done=await act({action:'stage',stage:'Hoàn thành'});assert.ok(done.body.record.completedAt);
  const changed=await act({action:'edit',values:{assignees:['ou_demoD']}});assert.equal(changed.code,200);assert.equal(changed.body.record.stage,'Đang dựng');assert.equal(changed.body.record.completedAt,null);
  const redone=await act({action:'stage',stage:'Hoàn thành'});assert.ok(redone.body.record.completedAt);
  row.fields['Link video tiktok']={link:'https://example.com/direct-change'};
  assert.equal(decode('media',row).completedAt,null);
  row.fields.Progress='Chưa thực hiện';assert.equal(decode('media',row).stage,'Chưa thực hiện');
});
test('Media real transport receives no virtual columns and verifies the saved history',async()=>{
  const x=fixture(),env={LARK_ORDER_APP_ID:'fake',LARK_ORDER_APP_SECRET:'fake',LARK_ORDER_DESIGN_BASE:'baseDesign',LARK_ORDER_DESIGN_TABLE:'tblDesign',LARK_ORDER_MEDIA_BASE:'baseMedia',LARK_ORDER_MEDIA_TABLE:'tblMedia',LARK_ORDER_SHOOTS_TABLE:'tblShoots'};
  let saved;
  const transport=makeClient({env,fetcher:async(u,o)=>{
    if(String(u).includes('/auth/'))return{ok:true,json:async()=>({code:0,tenant_access_token:'FAKE'})};
    if(o.method==='POST')saved=JSON.parse(o.body).fields;
    return{ok:true,json:async()=>({code:0,data:{record:{record_id:'recTransport',fields:saved}}})};
  }});
  const client={...x.client,save:transport.save},ctx=await require('../lib/order-service.js').context(client);
  const task=await require('../lib/order-service.js').create(client,ctx,x.user,{team:'media',action:'create',key:crypto.randomUUID(),values:vals()});
  assert.equal(task.id,'recTransport');assert.ok(task.requestKey);assert.ok(saved['Lịch sử']);assert.equal(saved['Tiến độ chi tiết'],undefined);
});


test('Design reuses the verified Brief capitalization without modifying Base options',async()=>{
  const x=setup(),field=x.tables.design.fields.find(f=>f.field_name==='Trạng thái');field.property.options.find(o=>o.name==='Cần bổ sung brief').name='Cần bổ sung Brief';
  assert.deepEqual((await call(x.handler)).body.connection.missing.design,[]);
  const row=x.tables.design.records[0],r=await post(x.handler,{team:'design',action:'stage',id:row.record_id,revision:revision(row),stage:'Cần bổ sung brief'});
  assert.equal(r.code,200);assert.equal(row.fields['Trạng thái'],'Cần bổ sung Brief');assert.equal(r.body.record.stage,'Cần bổ sung brief');
});
