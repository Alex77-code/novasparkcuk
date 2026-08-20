const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS','PROJECT_MANAGER']);
const AGENTS={SEO:'SEO',SOCIAL_MEDIA:'SOCIAL_MEDIA',GOOGLE_ADS:'PAID_ADS',META_ADS:'PAID_ADS',EMAIL_MARKETING:'EMAIL_MARKETING',WEBSITE:'CRO',VIDEO:'VIDEO',CREATIVE:'CREATIVE'};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim();if(!org||!projectId)return json(400,{error:'ORGANIZATION_AND_PROJECT_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'WORKFORCE_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,status,delivery_service&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const service=String(project.delivery_service||'').toUpperCase().replace(/[^A-Z_]/g,'');const suggestedRole=AGENTS[service]||'OPERATIONS';
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,title,status,priority,due_date,assigned_to&order=due_date.asc&limit=200`);
 const workload={total:(tasks||[]).length,assigned:(tasks||[]).filter(t=>t.assigned_to).length,unassigned:(tasks||[]).filter(t=>!t.assigned_to).length,pending:(tasks||[]).filter(t=>t.status==='PENDING').length};
 const assignments=[];for(const task of (tasks||[]).filter(t=>!t.assigned_to)){assignments.push({task_id:task.id,title:task.title,suggested_agent_role:suggestedRole,reason:`Matched to ${service||'delivery'} service`,assignment_mode:'SUGGESTED',requires_human_confirmation:true});}
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_TASK_ASSIGNMENT_PLAN_CREATED',source:'ai-task-assignment-workforce-engine',payload:{project_id:projectId,service,suggested_role:suggestedRole,workload,assignments}})});
 return json(200,{ok:true,project_id:projectId,service,suggested_agent_role:suggestedRole,workload,assignments,next_step:'CONFIRM_ASSIGNMENTS'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AI_TASK_ASSIGNMENT_FAILED'});}};
module.exports.run=run;
