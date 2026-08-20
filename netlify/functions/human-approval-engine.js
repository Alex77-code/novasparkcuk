const { json, supabaseRequest, verifyUser } = require('./_nova');

const TYPES=new Set(['PUBLISH','AD_DEPLOY','CLIENT_DELIVERY','SYSTEM_CONTROL','HIGH_RISK_AI']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim(),type=String(body.approval_type||'HIGH_RISK_AI').toUpperCase();
 if(!org||!taskId||!TYPES.has(type))return json(400,{error:'INVALID_APPROVAL_REQUEST'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status,qa_status&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 if(task.qa_status!=='QA_APPROVED')return json(409,{error:'QA_APPROVAL_REQUIRED_FIRST'});
 const existing=(await supabaseRequest(`task_approvals?task_id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&approval_type=eq.${encodeURIComponent(type)}&status=eq.PENDING&select=id&limit=1`))?.[0];
 if(existing)return json(200,{ok:true,approval_id:existing.id,status:'PENDING'});
 const rows=await supabaseRequest('task_approvals',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,task_id:taskId,approval_type:type,status:'PENDING',requested_by:user.id||null,created_at:new Date().toISOString()})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'HUMAN_APPROVAL_REQUESTED',source:'human-approval-engine',payload:{task_id:taskId,approval_type:type,approval_id:rows?.[0]?.id||null}})});
 return json(200,{ok:true,approval_id:rows?.[0]?.id||null,status:'PENDING',execution_blocked:true});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'HUMAN_APPROVAL_ENGINE_FAILED'});}};
module.exports.run=run;
