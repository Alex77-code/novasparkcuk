const { json, supabaseRequest, verifyUser } = require('./_nova');

const CHANNELS=new Set(['EMAIL','WEBHOOK','IN_APP']);
const MAX_RETRIES=3;
async function dispatch(n){
 const url=process.env.NOVA_NOTIFICATION_WORKER_URL,secret=process.env.NOVA_NOTIFICATION_WORKER_SECRET;
 if(!url||!secret)throw new Error('NOTIFICATION_PROVIDER_NOT_CONFIGURED');
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${secret}`},body:JSON.stringify({notification_id:n.id,channel:n.channel,title:n.title,message:n.message})});
 if(!r.ok)throw new Error(`NOTIFICATION_PROVIDER_HTTP_${r.status}`);return r.json();
}
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),id=String(body.notification_id||'').trim();if(!org||!id)return json(400,{error:'ORGANIZATION_AND_NOTIFICATION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const n=(await supabaseRequest(`notifications?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(org)}&select=id,channel,title,message,status,retry_count&limit=1`))?.[0];if(!n)return json(404,{error:'NOTIFICATION_NOT_FOUND'});
 if(!CHANNELS.has(n.channel)||n.status!=='QUEUED')return json(409,{error:'NOTIFICATION_NOT_EXECUTABLE',status:n.status,channel:n.channel});
 const now=new Date().toISOString();await supabaseRequest(`notifications?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PROCESSING',started_at:now})});
 try{const result=await dispatch(n);await supabaseRequest(`notifications?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'SENT',provider_result:result,sent_at:new Date().toISOString()})});return json(200,{ok:true,notification_id:id,status:'SENT'});}catch(e){const retries=Number(n.retry_count||0)+1;const status=retries>=MAX_RETRIES?'FAILED':'QUEUED';await supabaseRequest(`notifications?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status,retry_count:retries,error_message:e.message,last_retry_at:new Date().toISOString()})});return json(502,{error:'NOTIFICATION_DELIVERY_FAILED',notification_id:id,status,retry_count:retries});}
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'NOTIFICATION_WORKER_FAILED'});}};
module.exports.run=run;
