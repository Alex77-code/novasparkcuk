const { json, supabaseRequest, verifyUser } = require('./_nova');
const ROLES=new Set(['OWNER','ADMIN','MANAGER']);
const ACTIONS=new Set(['STATUS','PLAN','EXECUTE']);
const MODULES=['CRM','SALES_FOLLOWUP','MARKETING','CONTENT','ANALYTICS','SEO','LOCAL_SEO','INTEGRATIONS'];
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'STATUS').toUpperCase();if(!org||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_AND_VALID_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'CEO_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const [leads,campaigns,tasks]=await Promise.all([
  supabaseRequest(`leads?organization_id=eq.${encodeURIComponent(org)}&select=id,stage&limit=1000`),
  supabaseRequest(`campaigns?organization_id=eq.${encodeURIComponent(org)}&select=id,status&limit=1000`),
  supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&select=id,status,priority,due_date&limit=2000`)
 ]);
 const summary={leads:{total:(leads||[]).length,follow_up_needed:(leads||[]).filter(x=>['NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION'].includes(String(x.stage).toUpperCase())).length},campaigns:{total:(campaigns||[]).length,active:(campaigns||[]).filter(x=>String(x.status).toUpperCase()==='ACTIVE').length},tasks:{open:(tasks||[]).filter(x=>!['DONE','COMPLETED','CANCELLED'].includes(String(x.status).toUpperCase())).length,high_priority:(tasks||[]).filter(x=>String(x.priority).toUpperCase()==='HIGH').length}};
 if(action==='STATUS')return json(200,{ok:true,role,modules:MODULES,summary,autonomy:{external_actions:'APPROVAL_REQUIRED',emergency_stop:Boolean(stop?.emergency_stop)}});
 const priorities=[];if(summary.leads.follow_up_needed)priorities.push({module:'SALES_FOLLOWUP',reason:`${summary.leads.follow_up_needed} leads require follow-up`});if(summary.campaigns.total&&!summary.campaigns.active)priorities.push({module:'MARKETING',reason:'No active campaigns detected'});if(summary.tasks.high_priority)priorities.push({module:'OPERATIONS',reason:`${summary.tasks.high_priority} high-priority tasks open`});if(!priorities.length)priorities.push({module:'ANALYTICS',reason:'Review performance and identify next growth opportunity'});
 if(action==='PLAN')return json(200,{ok:true,ceo_plan:{priorities,modules:MODULES,execution_policy:'Create internal plans/tasks; external publishing requires explicit approval'}});
 if(!body.approval)return json(409,{error:'EXPLICIT_APPROVAL_REQUIRED',plan:{priorities}});
 const created=[];for(const p of priorities.slice(0,5)){const rows=await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,title:`AI CEO: ${p.module}`,description:p.reason,status:'TODO',priority:'HIGH',assigned_to:user.id||null,created_at:new Date().toISOString()})});created.push(rows?.[0]||null)}
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_CEO_PLAN_EXECUTED',source:'ai-ceo-orchestrator',payload:{priorities,task_count:created.length}})});
 return json(200,{ok:true,executed:true,tasks:created,external_actions:false});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'AI_CEO_ORCHESTRATOR_FAILED'})}};
module.exports.run=run;
