const { json, supabaseRequest, verifyUser } = require('./_nova');

const MAX_RETRIES=3; const TIMEOUT_MINUTES=15;
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),deliveryId=String(body.delivery_id||'').trim();
 if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const filter=deliveryId?`&id=eq.${encodeURIComponent(deliveryId)}`:'';
 const cutoff=new Date(Date.now()-TIMEOUT_MINUTES*60000).toISOString();
 const deliveries=await supabaseRequest(`deliveries?organization_id=eq.${encodeURIComponent(org)}&or=(status.eq.FAILED,status.eq.PROCESSING)&${deliveryId?`id=eq.${encodeURIComponent(deliveryId)}&`:''}select=id,task_id,channel,status,retry_count,error_message,started_at&order=started_at.asc&limit=50`);
 const results=[];
 for(const d of deliveries||[]){
  const count=Number(d.retry_count||0); const timedOut=d.status==='PROCESSING'&&(!d.started_at||d.started_at<cutoff); const retryable=d.status==='FAILED'||timedOut;
  if(!retryable)continue;
  if(count<MAX_RETRIES){const next=count+1;await supabaseRequest(`deliveries?id=eq.${encodeURIComponent(d.id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'READY',retry_count:next,last_retry_at:new Date().toISOString(),error_message:timedOut?'DELIVERY_TIMEOUT':d.error_message})});results.push({delivery_id:d.id,status:'READY',retry_count:next});}
  else{await supabaseRequest(`deliveries?id=eq.${encodeURIComponent(d.id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'FAILED',error_message:'MAX_RETRIES_REACHED'})});results.push({delivery_id:d.id,status:'PERMANENTLY_FAILED',retry_count:count});}
 }
 if(results.length)await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'DELIVERY_RETRY_EVALUATED',source:'delivery-monitor-retry-engine',payload:{results,max_retries:MAX_RETRIES,timeout_minutes:TIMEOUT_MINUTES}})});
 return json(200,{ok:true,processed:results.length,max_retries:MAX_RETRIES,timeout_minutes:TIMEOUT_MINUTES,results});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'DELIVERY_RETRY_ENGINE_FAILED'});}};
module.exports.run=run;
