const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','CRO','ANALYST']);
const ACTIONS=new Set(['CRO_AUDIT','LANDING_PAGE_PLAN','UX_PLAN','EXPERIMENT_PLAN']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),action=String(body.action||'CRO_AUDIT').toUpperCase();
 if(!org||!projectId||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_PROJECT_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'CRO_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,status,delivery_service,website_url&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const recommendations=action==='CRO_AUDIT'?['Review primary CTA visibility and hierarchy','Check mobile navigation and form friction','Verify trust signals, proof and objections','Review page speed and accessibility']:action==='LANDING_PAGE_PLAN'?['Define one conversion goal per page','Build hero, benefits, proof, objections and CTA sections','Align page copy with search/ad intent']:action==='UX_PLAN'?['Map critical user journeys','Reduce unnecessary clicks and fields','Improve responsive states, feedback and error handling']:['Define hypothesis, primary KPI and guardrail metric','Create control and variant','Set test duration and minimum sample criteria','Document rollout and rollback rules'];
 const payload={action,project_id:project.id,website_url:project.website_url||String(body.website_url||''),conversion_goal:String(body.conversion_goal||'LEAD_GENERATION'),recommendations,execution_mode:'PLAN_ONLY',external_analytics_connected:false,generated_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'WEBSITE_CRO_PLAN_GENERATED',source:'website-cro-agent-engine',payload})});
 return json(200,{ok:true,plan:payload,next_step:'CONNECT_ANALYTICS_AND_EXPERIMENT_PLATFORM'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'WEBSITE_CRO_AGENT_FAILED'});}};
module.exports.run=run;
