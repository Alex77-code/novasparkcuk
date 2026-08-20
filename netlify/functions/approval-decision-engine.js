const { json, supabaseRequest, verifyUser } = require('./_nova');

const DECISIONS=new Set(['APPROVE','REJECT','REQUEST_CHANGES']);
const APPROVER_ROLES=new Set(['OWNER','ADMIN','MANAGER']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim(),decision=String(body.decision||'').toUpperCase();
 if(!org||!taskId||!DECISIONS.has(decision))return json(400,{error:'INVALID_APPROVAL_DECISION'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!APPROVER_ROLES.has(role))return json(403,{error:'APPROVER_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const approval=(await supabaseRequest(`task_approvals?organization_id=eq.${encodeURIComponent(org)}&task_id=eq.${encodeURIComponent(taskId)}&status=eq.PENDING&select=id,approval_type&order=created_at.desc&limit=1`))?.[0];if(!approval)return json(404,{error:'PENDING_APPROVAL_NOT_FOUND'});
 const now=new Date().toISOString();let taskStatus='COMPLETED';if(decision==='REJECT')taskStatus='REJECTED';if(decision==='REQUEST_CHANGES')taskStatus='REWORK_REQUIRED';
 const approvalStatus=decision==='APPROVE'?'APPROVED':decision==='REJECT'?'REJECTED':'CHANGES_REQUESTED';
 await supabaseRequest(`task_approvals?id=eq.${encodeURIComponent(approval.id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:approvalStatus,decision,decision_notes:String(body.notes||''),decided_by:user.id||null,decided_at:now})});
 await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:taskStatus,approval_status:approvalStatus,approval_notes:String(body.notes||''),updated_at:now})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'APPROVAL_DECISION_RECORDED',source:'approval-decision-engine',payload:{task_id:taskId,approval_id:approval.id,decision,decided_by:user.id||null,role}})});
 return json(200,{ok:true,task_id:taskId,approval_id:approval.id,decision,status:taskStatus,auto_publish:false,next:decision==='APPROVE'?'DELIVERY_OR_NEXT_STAGE':decision==='REQUEST_CHANGES'?'REWORK_ENGINE':'CLOSED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'APPROVAL_DECISION_FAILED'});}};
module.exports.run=run;
