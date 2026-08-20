const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim();
 if(!org||!taskId)return json(400,{error:'ORGANIZATION_AND_TASK_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status,qa_status,approval_status,approval_required&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 if(task.qa_status!=='QA_APPROVED')return json(409,{error:'QA_APPROVAL_REQUIRED',execution_blocked:true});
 if(task.approval_required!==false&&task.approval_status!=='APPROVED')return json(409,{error:'HUMAN_APPROVAL_REQUIRED',execution_blocked:true});
 if(!['COMPLETED','APPROVED'].includes(task.status))return json(409,{error:'TASK_NOT_READY_FOR_DELIVERY',status:task.status});
 const now=new Date().toISOString();
 const rows=await supabaseRequest('deliveries',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,task_id:taskId,status:'READY',channel:String(body.channel||'WEBHOOK').toUpperCase(),created_by:user.id||null,created_at:now})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'PRODUCTION_DELIVERY_RELEASED',source:'production-delivery-gate',payload:{task_id:taskId,delivery_id:rows?.[0]?.id||null}})});
 return json(200,{ok:true,task_id:taskId,delivery_id:rows?.[0]?.id||null,status:'READY',execution_blocked:false});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PRODUCTION_DELIVERY_GATE_FAILED'});}};
module.exports.run=run;
