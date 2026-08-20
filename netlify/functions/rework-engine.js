const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim();
 if(!org||!taskId)return json(400,{error:'ORGANIZATION_AND_TASK_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status,assigned_agent,outputs,qa_notes,retry_count&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 if(task.status!=='REWORK_REQUIRED')return json(409,{error:'TASK_NOT_READY_FOR_REWORK',status:task.status});
 const retry=Number(task.retry_count||0)+1;if(retry>3)return json(409,{error:'MAX_REWORK_ATTEMPTS_REACHED',retry_count:retry-1});
 const now=new Date().toISOString();
 await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'QUEUED',qa_status:'REWORK_REQUIRED',retry_count:retry,rework_instructions:String(body.instructions||task.qa_notes||''),rework_requested_at:now,updated_at:now})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'TASK_REWORK_QUEUED',source:'rework-engine',payload:{task_id:taskId,agent:task.assigned_agent,retry_count:retry}})});
 return json(200,{ok:true,task_id:taskId,status:'QUEUED',retry_count:retry,next:'AGENT_ORCHESTRATOR'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'REWORK_ENGINE_FAILED'});}};
module.exports.run=run;
