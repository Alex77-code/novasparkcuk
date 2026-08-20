const { json, supabaseRequest, verifyUser } = require('./_nova');

const APPROVALS=new Set(['TEAM_APPROVAL','CLIENT_APPROVAL','PUBLISH_APPROVAL']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim(),type=String(body.approval_type||'TEAM_APPROVAL').toUpperCase();
 if(!org||!taskId||!APPROVALS.has(type))return json(400,{error:'INVALID_APPROVAL_REQUEST'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,project_id,status,qa_status&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 if(task.qa_status!=='QA_APPROVED'||task.status!=='COMPLETED')return json(409,{error:'TASK_NOT_READY_FOR_APPROVAL',status:task.status,qa_status:task.qa_status});
 const approval={organization_id:org,task_id:taskId,approval_type:type,status:'PENDING',requested_by:user.id||null,created_at:new Date().toISOString()};
 const rows=await supabaseRequest('task_approvals',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(approval)});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'HUMAN_APPROVAL_REQUESTED',source:'human-approval-gate',payload:{task_id:taskId,approval_type:type,approval_id:rows?.[0]?.id||null}})});
 return json(200,{ok:true,task_id:taskId,approval_type:type,status:'PENDING',approval_id:rows?.[0]?.id||null,auto_publish:false});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'HUMAN_APPROVAL_GATE_FAILED'});}};
module.exports.run=run;
