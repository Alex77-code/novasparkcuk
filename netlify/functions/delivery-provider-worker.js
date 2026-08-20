const { json, supabaseRequest, verifyUser } = require('./_nova');

const CHANNELS=new Set(['CLIENT_DELIVERY','WEBSITE_PUBLISH','SOCIAL_PUBLISH','EMAIL_SEND','AD_DEPLOY','REPORT_DELIVERY']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),deliveryId=String(body.delivery_id||'').trim();
 if(!org||!deliveryId)return json(400,{error:'ORGANIZATION_AND_DELIVERY_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const delivery=(await supabaseRequest(`deliveries?id=eq.${encodeURIComponent(deliveryId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,task_id,project_id,channel,status&limit=1`))?.[0];if(!delivery)return json(404,{error:'DELIVERY_NOT_FOUND'});
 if(!CHANNELS.has(delivery.channel)||delivery.status!=='READY')return json(409,{error:'DELIVERY_NOT_EXECUTABLE',status:delivery.status,channel:delivery.channel});
 const now=new Date().toISOString();
 await supabaseRequest(`deliveries?id=eq.${encodeURIComponent(deliveryId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PROCESSING',started_at:now})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'DELIVERY_PROVIDER_STARTED',source:'delivery-provider-worker',payload:{delivery_id:deliveryId,task_id:delivery.task_id,channel:delivery.channel,execution:'PROVIDER_ADAPTER_PENDING'}})});
 return json(200,{ok:true,delivery_id:deliveryId,status:'PROCESSING',channel:delivery.channel,next:'CHANNEL_PROVIDER_ADAPTER'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'DELIVERY_PROVIDER_WORKER_FAILED'});}};
module.exports.run=run;
