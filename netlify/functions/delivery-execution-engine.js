const { json, supabaseRequest, verifyUser } = require('./_nova');

const CHANNELS=new Set(['WEBHOOK','EMAIL','IN_APP']);
const MAX_RETRIES=3;
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),deliveryId=String(body.delivery_id||'').trim();
 if(!org||!deliveryId)return json(400,{error:'ORGANIZATION_AND_DELIVERY_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const d=(await supabaseRequest(`deliveries?id=eq.${encodeURIComponent(deliveryId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,task_id,status,channel,retry_count&limit=1`))?.[0];if(!d)return json(404,{error:'DELIVERY_NOT_FOUND'});
 if(d.status!=='READY')return json(409,{error:'DELIVERY_NOT_EXECUTABLE',status:d.status});if(!CHANNELS.has(d.channel))return json(400,{error:'UNSUPPORTED_DELIVERY_CHANNEL'});
 const now=new Date().toISOString();await supabaseRequest(`deliveries?id=eq.${encodeURIComponent(deliveryId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PROCESSING',started_at:now})});
 try{
  const url=process.env.NOVA_DELIVERY_PROVIDER_URL,secret=process.env.NOVA_DELIVERY_PROVIDER_SECRET;if(!url||!secret)throw new Error('DELIVERY_PROVIDER_NOT_CONFIGURED');
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${secret}`},body:JSON.stringify({delivery_id:d.id,task_id:d.task_id,channel:d.channel})});if(!r.ok)throw new Error(`DELIVERY_PROVIDER_HTTP_${r.status}`);
  const provider=await r.json().catch(()=>({ok:true}));await supabaseRequest(`deliveries?id=eq.${encodeURIComponent(deliveryId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'SENT',provider_result:provider,sent_at:new Date().toISOString()})});
  await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'DELIVERY_SENT',source:'delivery-execution-engine',payload:{delivery_id:deliveryId,task_id:d.task_id,channel:d.channel}})});return json(200,{ok:true,delivery_id:deliveryId,status:'SENT'});
 }catch(e){const retries=Number(d.retry_count||0)+1;const status=retries>=MAX_RETRIES?'FAILED':'READY';await supabaseRequest(`deliveries?id=eq.${encodeURIComponent(deliveryId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status,retry_count:retries,error_message:e.message,last_retry_at:new Date().toISOString()})});return json(502,{error:'DELIVERY_EXECUTION_FAILED',delivery_id:deliveryId,status,retry_count:retries});}
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'DELIVERY_EXECUTION_ENGINE_FAILED'});}};
module.exports.run=run;
