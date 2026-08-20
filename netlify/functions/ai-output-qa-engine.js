const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim();
 if(!org||!taskId)return json(400,{error:'ORGANIZATION_AND_TASK_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,project_id,title,status,outputs,qa_status&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 if(task.status!=='WAITING_QA')return json(409,{error:'TASK_NOT_READY_FOR_QA',status:task.status});
 const output=task.outputs?.provider_result;
 const hasOutput=output!==undefined&&output!==null&&JSON.stringify(output).trim()!=='';
 const checks={output_present:hasOutput,task_scoped:true,organization_scoped:true};
 const passed=Object.values(checks).every(Boolean);
 const qaStatus=passed?'QA_APPROVED':'QA_FAILED';
 const nextStatus=passed?'COMPLETED':'QA_FAILED';
 await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({qa_status:qaStatus,status:nextStatus,qa_result:{checks,score:passed?100:0,reviewed_at:new Date().toISOString(),reviewed_by:user.id||null}})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_OUTPUT_QA_COMPLETED',source:'ai-output-qa-engine',payload:{task_id:taskId,qa_status:qaStatus,score:passed?100:0,checks}})});
 return json(200,{ok:true,task_id:taskId,qa_status:qaStatus,status:nextStatus,score:passed?100:0,checks});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AI_OUTPUT_QA_FAILED'});}};
module.exports.run=run;
