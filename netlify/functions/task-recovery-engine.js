const { json, supabaseRequest, verifyUser } = require('./_nova');

async function recover(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=eq.FAILED&select=id,title,task_type,retries,max_retries,metadata&limit=50`);const recovered=[];const escalated=[];
 for(const t of tasks||[]){const retries=Number(t.retries||0),max=Number(t.max_retries||3);if(retries<max){await supabaseRequest(`tasks?id=eq.${encodeURIComponent(t.id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'QUEUED',retries:retries+1,metadata:{...(t.metadata||{}),recovery:'automatic',requeued_at:new Date().toISOString()}})});recovered.push({task_id:t.id,retry:retries+1});}else{await supabaseRequest(`tasks?id=eq.${encodeURIComponent(t.id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'ESCALATED',metadata:{...(t.metadata||{}),escalated_at:new Date().toISOString(),reason:'MAX_RETRIES_REACHED'}})});escalated.push(t.id);}}
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'TASK_RECOVERY_COMPLETED',source:'task-recovery-engine',payload:{recovered,escalated}})});
 return json(200,{ok:true,recovered:recovered.length,escalated:escalated.length,recovered_tasks:recovered,escalated_tasks:escalated});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await recover(event);}catch(e){console.error(e);return json(500,{error:'TASK_RECOVERY_FAILED',message:e.message});}};
module.exports.recover=recover;
