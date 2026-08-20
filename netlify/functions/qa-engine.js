const { json, supabaseRequest, verifyUser } = require('./_nova');

const RESULTS=new Set(['QA_APPROVED','QA_FAILED','REWORK_REQUIRED']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim(),result=String(body.result||'QA_FAILED').toUpperCase();
 if(!org||!taskId||!RESULTS.has(result))return json(400,{error:'INVALID_QA_RESULT'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status,outputs,assigned_agent&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 if(!['QA_PENDING','REWORK_REQUIRED'].includes(task.status))return json(409,{error:'TASK_NOT_READY_FOR_QA',status:task.status});
 const now=new Date().toISOString();const notes=String(body.notes||'');
 const patch={qa_status:result,qa_notes:notes,qa_checked_at:now,qa_checked_by:user.id||null,updated_at:now};
 if(result==='QA_APPROVED')patch.status='COMPLETED';
 if(result==='QA_FAILED')patch.status='QA_FAILED';
 if(result==='REWORK_REQUIRED')patch.status='REWORK_REQUIRED';
 await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'QA_RESULT_RECORDED',source:'qa-engine',payload:{task_id:taskId,agent:task.assigned_agent,result,notes}})});
 return json(200,{ok:true,task_id:taskId,qa_status:result,status:patch.status,next:result==='QA_APPROVED'?'HUMAN_APPROVAL':result==='REWORK_REQUIRED'?'REWORK_ENGINE':'FAILURE_HANDLING'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'QA_ENGINE_FAILED'});}};
module.exports.run=run;
