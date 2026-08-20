const { json, supabaseRequest, verifyUser } = require('./_nova');

const CHANNELS=new Set(['CLIENT_DELIVERY','WEBSITE_PUBLISH','SOCIAL_PUBLISH','EMAIL_SEND','AD_DEPLOY']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim(),channel=String(body.channel||'CLIENT_DELIVERY').toUpperCase();
 if(!org||!taskId||!CHANNELS.has(channel))return json(400,{error:'INVALID_DELIVERY_REQUEST'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,project_id,status,qa_status,approval_status&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 if(task.qa_status!=='QA_APPROVED'||task.approval_status!=='APPROVED')return json(409,{error:'DELIVERY_NOT_AUTHORIZED',qa_status:task.qa_status,approval_status:task.approval_status});
 const delivery={organization_id:org,task_id:taskId,project_id:task.project_id,channel,status:'READY',requested_by:user.id||null,created_at:new Date().toISOString()};
 const rows=await supabaseRequest('deliveries',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(delivery)});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'DELIVERY_QUEUED',source:'publishing-delivery-engine',payload:{task_id:taskId,channel,delivery_id:rows?.[0]?.id||null}})});
 return json(200,{ok:true,delivery:rows?.[0]||delivery,execution:'QUEUED',auto_publish:false});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PUBLISHING_DELIVERY_FAILED'});}};
module.exports.run=run;
