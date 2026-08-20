const { json, supabaseRequest, verifyUser } = require('./_nova');

const NEXT_STATES=new Set(['QA_PENDING','FAILED','REWORK_REQUIRED']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim(),state=String(body.next_state||'QA_PENDING').toUpperCase();
 if(!org||!taskId||!NEXT_STATES.has(state))return json(400,{error:'INVALID_EXECUTION_RESULT'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status,assigned_agent&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 if(task.status!=='RUNNING')return json(409,{error:'TASK_NOT_RUNNING',status:task.status});
 const now=new Date().toISOString();const output=body.output||null;const error=String(body.error||'');
 const patch={status:state,outputs:output,execution_error:error||null,execution_completed_at:now,updated_at:now};
 if(state==='QA_PENDING')patch.qa_status='PENDING';
 if(state==='REWORK_REQUIRED')patch.qa_status='REWORK_REQUIRED';
 if(state==='FAILED')patch.qa_status='FAILED';
 await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AGENT_EXECUTION_COMPLETED',source:'agent-execution-result-handler',payload:{task_id:taskId,agent:task.assigned_agent,next_state:state,has_output:Boolean(output),error:error||null}})});
 return json(200,{ok:true,task_id:taskId,agent:task.assigned_agent,status:state,qa_status:patch.qa_status||null,next:state==='QA_PENDING'?'QA_ENGINE':state==='REWORK_REQUIRED'?'REWORK_ENGINE':'FAILURE_HANDLING'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AGENT_RESULT_HANDLER_FAILED'});}};
module.exports.run=run;
