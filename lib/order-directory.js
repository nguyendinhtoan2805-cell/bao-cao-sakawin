'use strict';
// Company directory is an explicit opt-in. Only identity fields leave this adapter.
// Never populate membership from client-supplied names or unrelated HR tables.
const sharedCache=new Map();
const fail=(statusCode,message)=>Object.assign(new Error(message),{statusCode});
const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim();
function queryText(value) {
  if(typeof value!=='string'||value.trim().length<2||value.length>100)throw fail(400,'Nhập từ 2 đến 100 ký tự để tìm nhân sự.');
  const q=normalize(value);if(q.length<2)throw fail(400,'Nhập ít nhất 2 ký tự tên nhân sự.');return q;
}
function makeDirectory({enabled,request,cacheKey,cache=sharedCache,now=Date.now,timeoutMs=20000}) {
  async function load() {
    if(!enabled)throw fail(503,'Chưa bật tìm nhân sự trong danh bạ Lark. Bạn vẫn có thể chọn người đã có trong danh sách.');
    const previous=cache.get(cacheKey);
    if(previous && previous.expires>now())return previous.promise;
    const entry={expires:Infinity,promise:null};
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(fail(503,'Danh bạ Lark tải quá lâu. Bạn vẫn có thể chọn người đã có trong danh sách; thử tìm lại sau.')),timeoutMs);
    entry.promise=(async()=>{
      try {return await Promise.race([(async()=>{
      let requests=0;
      async function pages(path,query) {
        const all=[],seen=new Set();let page;
        do {
          controller.signal.throwIfAborted();
          if(++requests>200)throw fail(503,'Danh bạ vượt giới hạn lượt tải. Chưa dùng kết quả thiếu để chọn nhân sự.');
          const data=await request(path,{...query,page_size:'50',...(page?{page_token:page}:{})},{signal:controller.signal});
          controller.signal.throwIfAborted();
          if(!Array.isArray(data?.items)||typeof data.has_more!=='boolean')throw fail(502,'Lark trả danh bạ chưa đầy đủ. Vui lòng thử lại.');
          all.push(...data.items);
          if(all.length>5000)throw fail(503,'Danh bạ vượt giới hạn lượt tải. Chưa dùng kết quả thiếu để chọn nhân sự.');
          if(!data.has_more)break;
          if(typeof data.page_token!=='string'||!data.page_token||seen.has(data.page_token))throw fail(502,'Phân trang danh bạ Lark chưa đầy đủ. Vui lòng thử lại.');
          page=data.page_token;seen.add(page);
        }while(page);
        return all;
      }
      // Root users are not necessarily members of a child department.
      const children=await pages('departments/0/children',{department_id_type:'open_department_id',fetch_child:'true'});
      const departments=new Set(['0']);
      for(const d of children) {
        if(typeof d.open_department_id!=='string'||!/^od-[A-Za-z0-9_-]+$/.test(d.open_department_id))throw fail(502,'Lark trả mã phòng ban không hợp lệ. Chưa dùng danh bạ thiếu.');
        departments.add(d.open_department_id);
      }
      if(departments.size>100)throw fail(503,'Danh bạ có quá nhiều phòng ban cho lượt tải này. Chưa dùng kết quả thiếu.');
      const members=new Map(),pending=[...departments];
      // Bound concurrency, request count and result size for a Vercel function.
      await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
        while(pending.length) {
          controller.signal.throwIfAborted();
          const department_id=pending.shift();
          for(const p of await pages('users/find_by_department',{department_id,department_id_type:'open_department_id',user_id_type:'open_id'})) {
            if(p?.status?.is_resigned===true||p?.status?.is_exited===true)continue;
            if(typeof p?.open_id!=='string'||!/^ou_[A-Za-z0-9]+$/.test(p.open_id)||typeof p.name!=='string'||!p.name.trim())throw fail(502,'Chưa đọc đủ tên và mã nhân sự Lark. Kiểm tra quyền đọc thông tin cơ bản.');
            const emails=[p.email,p.enterprise_email].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim().toLowerCase());
            members.set(p.open_id,{id:p.open_id,name:p.name.trim(),emails});
            if(members.size>5000)throw fail(503,'Danh bạ vượt giới hạn lượt tải. Chưa dùng kết quả thiếu.');
          }
        }
      }));
      return [...members.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi')||a.id.localeCompare(b.id));
      })(),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}))]);}
      catch(e){controller.abort(e);throw e;}
      finally{clearTimeout(timeout);}
    })();
    cache.set(cacheKey,entry);
    // A small process cache; no names or email addresses are persisted to disk.
    while(cache.size>4)cache.delete(cache.keys().next().value);
    try {const result=await entry.promise;entry.expires=now()+300000;return result;}
    catch(e){if(cache.get(cacheKey)===entry)cache.delete(cacheKey);throw e;}
  }
  return {
    async search(value) {const q=queryText(value),matches=(await load()).filter(p=>normalize(p.name).includes(q));return {people:matches.slice(0,50).map(({id,name})=>({id,name})),hasMore:matches.length>50};},
    async resolve(ids) {
      if(!Array.isArray(ids)||ids.length>90||ids.some(id=>typeof id!=='string'||!/^ou_[A-Za-z0-9]+$/.test(id)))throw fail(400,'Mã nhân sự không hợp lệ.');
      const people=await load(),out=ids.map(id=>people.find(p=>p.id===id));
      if(out.some(p=>!p))throw fail(400,'Nhân sự không còn trong danh bạ công ty được Lark cho phép. Hãy tìm và chọn lại.');
      return out.map(({id,name})=>({id,name}));
    },
    async byEmail(value) {const email=typeof value==='string'?value.trim().toLowerCase():'';if(!email||!email.includes('@'))return null;const matches=(await load()).filter(p=>p.emails.includes(email));if(matches.length>1)throw fail(409,'Email tài khoản trùng nhiều nhân sự Lark. Cần quản trị đối chiếu trước khi tạo order.');return matches.length?{id:matches[0].id,name:matches[0].name,email}:null;},
  };
}
module.exports={makeDirectory,queryText};
