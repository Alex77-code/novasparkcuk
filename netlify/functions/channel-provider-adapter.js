const { json, supabaseRequest, verifyUser } = require('./_nova');

const CHANNELS=new Set(['CLIENT_DELIVERY','WEBSITE_PUBLISH','SOCIAL_PUBLISH','EMAIL_SEND','AD_DEPLOY','REPORT_DELIVERY']);
async function callProvider(delivery){
 const url=process.env.NOVA_DELIVERY_WORKER_URL, secret=process.env.NOVA_DELIVERY_WORKER_SECRET;
 if(!url||!secret)throw new Error('DELIVERY_PROVIDER_NOT_CONFIGURED');
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${secret}`},body:JSON.stringify({delivery_id:delivery.id,channel:delivery.channel,task_id:delivery.task_id,project_id:delivery.project_id})});
 if(!r.ok)throw new Error(`DELIVERY_PROVIDER_HTTP_${r.status}`);return r.json();
}
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),id=String(body.delivery_id||'').trim();if(!org||!id)return json(400,{error:'ORGANIZATION_AND_DELIVERY_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const d=(await supabaseRequest(`deliveries?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(org)}&select=id,task_id,project_id,channel,status&limit=1`))?.[0];if(!d)return json(404,{error:'DELIVERY_NOT_FOUND'});
 if(!CHANNELS.has(d.channel)||d.status!=='PROCESSING')return json(409,{error:'DELIVERY_NOT_READY',status:d.status,channel:d.channel});
 try{const result=await callProvider(d);await supabaseRequest(`deliveries?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'DELIVERED',provider_result:result,completed_at:new Date().toISOString()})});await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'DELIVERY_COMPLETED',source:'channel-provider-adapter',payload:{delivery_id:id,channel:d.channel}})});return json(200,{ok:true,delivery_id:id,status:'DELIVERED'});}catch(e){await supabaseRequest(`deliveries?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'FAILED',error_message:e.message,failed_at:new Date().toISOString()})});await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'DELIVERY_FAILED',source:'channel-provider-adapter',payload:{delivery_id:id,channel:d.channel,error:e.message}})});return json(502,{error:'DELIVERY_PROVIDER_FAILED',delivery_id:id});}
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CHANNEL_PROVIDER_ADAPTER_FAILED'});}};
module.exports.run=run;
