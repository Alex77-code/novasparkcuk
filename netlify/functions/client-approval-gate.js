const { json, supabaseRequest, verifyUser } = require('./_nova');

const DECISIONS=new Set(['APPROVE','REJECT','CHANGES_REQUESTED']);
async function approveDelivery(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return {error:'AUTHENTICATION_REQUIRED'};
 const body=JSON.parse(event.body||'{}');const orgId=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim(),decision=String(body.decision||'').toUpperCase();
 if(!orgId||!taskId||!DECISIONS.has(decision))return {error:'INVALID_APPROVAL_REQUEST'};
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(orgId)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return {skipped:true,reason:'EMERGENCY_STOP'};
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(orgId)}&select=id,status,project_id,qa_status&limit=1`))?.[0];
 if(!task)return {error:'TASK_NOT_FOUND'};
 if(task.status!=='COMPLETED')return {error:'TASK_NOT_READY_FOR_APPROVAL',status:task.status};
 if(task.qa_status!=='QA_APPROVED')return {error:'QA_NOT_APPROVED',qa_status:task.qa_status};
 const approved=decision==='APPROVE';const now=new Date().toISOString();const next=approved?'CLIENT_APPROVED':'REWORK_REQUIRED';
 await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(orgId)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({client_approval_status:next,client_approval_comment:body.comment||null,client_approved_at:approved?now:null})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:orgId,event_type:approved?'CLIENT_DELIVERY_APPROVED':'CLIENT_DELIVERY_REJECTED',source:'client-approval-gate',payload:{task_id:task.id,project_id:task.project_id,decision,comment:body.comment||null,approved_by:user.id||null,approved_at:now}})});
 return {ok:true,task_id:task.id,decision,status:next,approved_at:approved?now:null,next_action:approved?'REPORTING':'REWORK'};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const result=await approveDelivery(event);return json(result.error==='AUTHENTICATION_REQUIRED'?401:result.error?400:200,result);}catch(e){console.error(e);return json(500,{error:'CLIENT_APPROVAL_GATE_FAILED',message:e.message});}};
module.exports.approveDelivery=approveDelivery;
