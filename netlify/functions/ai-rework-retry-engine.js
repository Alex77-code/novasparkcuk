const { json, supabaseRequest, verifyUser } = require('./_nova');

const MAX_RETRIES=3;
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim();
 if(!org||!taskId)return json(400,{error:'ORGANIZATION_AND_TASK_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,project_id,title,status,qa_status,qa_result,retry_count,assigned_agent&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 if(task.qa_status!=='QA_FAILED'&&task.status!=='QA_FAILED')return json(409,{error:'TASK_NOT_READY_FOR_REWORK',status:task.status,qa_status:task.qa_status});
 const retryCount=Number(task.retry_count||0);if(retryCount>=MAX_RETRIES)return json(409,{error:'MAX_RETRIES_REACHED',retry_count:retryCount,max_retries:MAX_RETRIES});
 const next=retryCount+1;const now=new Date().toISOString();
 const feedback=body.feedback||task.qa_result||{};
 await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'QUEUED',qa_status:'REWORK_REQUIRED',retry_count:next,rework_feedback:feedback,assigned_agent:task.assigned_agent||null,rework_requested_at:now})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_REWORK_REQUESTED',source:'ai-rework-retry-engine',payload:{task_id:taskId,project_id:task.project_id,retry_count:next,max_retries:MAX_RETRIES,feedback}})});
 return json(200,{ok:true,task_id:taskId,status:'QUEUED',qa_status:'REWORK_REQUIRED',retry_count:next,max_retries:MAX_RETRIES,next:'AGENT_REEXECUTION'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AI_REWORK_RETRY_FAILED'});}};
module.exports.run=run;
