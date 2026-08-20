const { json, supabaseRequest, verifyUser } = require('./_nova');

const AGENTS={SEO:'SEO_AGENT',CONTENT:'CONTENT_AGENT',SOCIAL_MEDIA:'SOCIAL_MEDIA_AGENT',ADS:'PAID_ADS_AGENT',WEBSITE:'WEB_AGENT',EMAIL:'EMAIL_AGENT',ANALYTICS:'ANALYTICS_AGENT',DESIGN:'DESIGN_AGENT',VIDEO:'VIDEO_AGENT'};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim(),service=String(body.service_type||'').toUpperCase();
 if(!org||!taskId||!AGENTS[service])return json(400,{error:'INVALID_ROUTING_REQUEST'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status,assigned_agent&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 if(!['PENDING','QUEUED'].includes(task.status))return json(409,{error:'TASK_NOT_ROUTABLE',status:task.status});
 const agent=AGENTS[service];const now=new Date().toISOString();
 await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({assigned_agent:agent,status:'QUEUED',routing_service:service,routed_at:now})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'TASK_ROUTED_TO_AGENT',source:'agent-task-router',payload:{task_id:taskId,service_type:service,agent}})});
 return json(200,{ok:true,task_id:taskId,service_type:service,assigned_agent:agent,status:'QUEUED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AGENT_TASK_ROUTER_FAILED'});}};
module.exports.run=run;
