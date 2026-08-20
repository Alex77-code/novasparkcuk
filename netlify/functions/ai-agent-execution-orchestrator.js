const { json, supabaseRequest, verifyUser } = require('./_nova');

const AGENTS={SEO:'NOVA_SEO_AGENT',CONTENT:'NOVA_CONTENT_AGENT',SOCIAL_MEDIA:'NOVA_SOCIAL_AGENT',ADS:'NOVA_ADS_AGENT',WEBSITE:'NOVA_WEB_AGENT',EMAIL:'NOVA_EMAIL_AGENT',ANALYTICS:'NOVA_ANALYTICS_AGENT'};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim(),service=String(body.service_type||'').toUpperCase();
 if(!org||!taskId||!AGENTS[service])return json(400,{error:'INVALID_AGENT_EXECUTION_REQUEST'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,project_id,title,status,task_type&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 if(!['PENDING','QUEUED','IN_PROGRESS'].includes(task.status))return json(409,{error:'TASK_NOT_EXECUTABLE',status:task.status});
 const now=new Date().toISOString();await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'IN_PROGRESS',assigned_agent:AGENTS[service],execution_started_at:now})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_AGENT_EXECUTION_STARTED',source:'ai-agent-execution-orchestrator',payload:{task_id:taskId,project_id:task.project_id,service_type:service,agent:AGENTS[service],started_at:now,execution:'ORCHESTRATED'}})});
 return json(200,{ok:true,task_id:taskId,project_id:task.project_id,agent:AGENTS[service],status:'IN_PROGRESS',next:'AGENT_OUTPUT_AND_QA'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AI_AGENT_ORCHESTRATOR_FAILED'});}};
module.exports.run=run;
