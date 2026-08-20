const { json, supabaseRequest, verifyUser } = require('./_nova');

const ESCALATE_AFTER=3;
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),deliveryId=String(body.delivery_id||'').trim();
 if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const filter=deliveryId?`&id=eq.${encodeURIComponent(deliveryId)}`:'';
 const failures=await supabaseRequest(`deliveries?organization_id=eq.${encodeURIComponent(org)}&status=eq.FAILED${filter}&select=id,task_id,channel,retry_count,error_message&order=updated_at.desc&limit=50`);
 const results=[];
 for(const d of failures||[]){const retries=Number(d.retry_count||0);if(retries<ESCALATE_AFTER)continue;
  const existing=(await supabaseRequest(`delivery_escalations?organization_id=eq.${encodeURIComponent(org)}&delivery_id=eq.${encodeURIComponent(d.id)}&status=eq.OPEN&select=id&limit=1`))?.[0];if(existing){results.push({delivery_id:d.id,status:'ALREADY_ESCALATED',escalation_id:existing.id});continue;}
  const rows=await supabaseRequest('delivery_escalations',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,delivery_id:d.id,task_id:d.task_id,status:'OPEN',severity:'HIGH',reason:'MAX_RETRIES_REACHED',retry_count:retries,channel:d.channel,error_message:d.error_message||null,created_by:user.id||null,created_at:new Date().toISOString()})});
  await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'DELIVERY_FAILURE_ESCALATED',source:'failure-escalation-alert-engine',payload:{delivery_id:d.id,task_id:d.task_id,severity:'HIGH',retry_count:retries,escalation_id:rows?.[0]?.id||null}})});
  results.push({delivery_id:d.id,status:'ESCALATED',severity:'HIGH',escalation_id:rows?.[0]?.id||null});
 }
 return json(200,{ok:true,checked:(failures||[]).length,escalated:results.filter(x=>x.status==='ESCALATED').length,results});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'FAILURE_ESCALATION_ENGINE_FAILED'});}};
module.exports.run=run;
