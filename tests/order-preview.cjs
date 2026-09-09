'use strict';
// Loopback-only preview, fake Lark and fake login; no real records, secrets or network writes.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {fixture,auth,env}=require('./order-fixture.cjs');
const {makeHandler}=require('../api/orders.js');
const ROOT=path.resolve(__dirname,'..'),fx=fixture();
const handler=makeHandler({env,auth:auth(fx.user),clientFactory:()=>fx.client,lease:async(k,work)=>work()});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.status=n=>{res.statusCode=n;return res;};res.json=j=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...j,...(j.data?{demo:true}:{})}));return res;};
  if(!['127.0.0.1:4323','localhost:4323'].includes(req.headers.host))return res.status(403).end();
  try{const url=new URL(req.url,'http://127.0.0.1:4323');
    if(url.pathname==='/api/auth/me')return res.json({...fx.user,dangNhap:true});
    if(url.pathname==='/api/orders'){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>95000)return res.status(413).end();}req.body=body;req.query=Object.fromEntries(url.searchParams);return await handler(req,res);}
    const relative=url.pathname==='/'?'order.html':url.pathname.slice(1),target=path.resolve(ROOT,relative);
    if(relative!=='order.html'&&!target.startsWith(path.join(ROOT,'assets')+path.sep))return res.status(404).end();
    const type=types[path.extname(target)];if(!type||!fs.existsSync(target))return res.status(404).end();res.setHeader('Content-Type',type);res.end(fs.readFileSync(target));
  }catch{res.status(500).json({ok:false,error:'Lỗi bản thử nghiệm.'});}
}).listen(4323,'127.0.0.1',()=>process.stdout.write('Order preview · synthetic data only · http://127.0.0.1:4323/order.html\n'));
