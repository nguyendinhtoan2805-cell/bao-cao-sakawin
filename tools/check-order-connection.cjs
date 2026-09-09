'use strict';
// Read-only metadata/record-count diagnostic. No record contents, person names, tokens or secrets printed.
// node --env-file=.env.order.local tools/check-order-connection.cjs
const {makeClient}=require('../lib/order-lark.js');
const {context,requirements}=require('../lib/order-service.js');
(async()=>{
  const client=makeClient();
  const ctx=await context(client,process.env);
  process.stdout.write(JSON.stringify({readVerified:true,writeVerified:false,
    tables:Object.fromEntries(Object.entries(ctx.tables).map(([team,t])=>[team,{recordCount:t.records.length,fieldCount:t.fields.length}])),
    missing:requirements(ctx),peopleSeen:ctx.roster.length,peopleWithIdentityMapping:ctx.roster.filter(p=>p.email).length},null,2)+'\n');
})().catch(e=>{process.stderr.write((e.statusCode?e.message:'Kết nối chưa hoàn tất; kiểm tra mạng và cấu hình Lark Order.')+'\n');process.exitCode=1;});
