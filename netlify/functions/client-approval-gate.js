const { json, supabaseRequest, verifyUser } = require('./_nova');

async function approveDelivery(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return {error:'AUTHENTICATION_REQUIRED'};
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org)throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop)return {skipped:true,reason:'EMERGENCY_STOP'};
 const body=JSON.parse(event.body||'{}');
 if(!body.task_id||!['APPROVE','REJECT'].includes(body.decision))return {error:'INVALID_APPROVAL_REQUEST'};
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(body.task_id)}&organization_id=eq.${org.id}&select=id,status,outputs&limit=1`))?.[0];
 if(!task)return {error:'TASK_NOT_FOUND'};
 if(task.status!=='COMPLETED')return {error:'TASK_NOT_READY_FOR_APPROVAL',status:task.status};
 const approved=body.decision==='APPROVE';const now=new Date().toISOString();
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:approved?'CLIENT_DELIVERY_APPROVED':'CLIENT_DELIVERY_REJECTED',source:'client-approval-gate',payload:{task_id:task.id,decision:body.decision,comment:body.comment||null,approved_by:user.id||null,approved_at:now}})});
 return {ok:true,task_id:task.id,decision:body.decision,approved_at:now};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const result=await approveDelivery(event);return json(result.error==='AUTHENTICATION_REQUIRED'?401:result.error?400:200,result);}catch(e){console.error(e);return json(500,{error:'CLIENT_APPROVAL_GATE_FAILED',message:e.message});}};
module.exports.approveDelivery=approveDelivery;
