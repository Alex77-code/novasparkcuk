const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER']);
const DOMAINS=new Set(['SALES','FINANCE','MARKETING','DELIVERY','CLIENT_SUCCESS','OPERATIONS']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),intent=String(body.intent||'').trim();if(!org||!intent)return json(400,{error:'ORGANIZATION_AND_INTENT_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'CEO_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const domain=String(body.domain||'OPERATIONS').toUpperCase();if(!DOMAINS.has(domain))return json(400,{error:'INVALID_DOMAIN'});
 const priorities=Array.isArray(body.priorities)?body.priorities:[];const constraints=Array.isArray(body.constraints)?body.constraints:[];
 const plan={intent,domain,priority_order:priorities,known_constraints:constraints,steps:['Interpret business intent','Check relevant records and constraints','Create a structured action plan','Route work to the appropriate specialist agent','Require approval for high-impact external actions','Record outcome and audit event'],execution_mode:'ORCHESTRATE_ONLY',external_actions_authorized:false,generated_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_CEO_ORCHESTRATION_PLAN_CREATED',source:'ai-ceo-orchestrator-engine',payload:{domain,intent,plan}})});
 return json(200,{ok:true,ceo_plan:plan,next_step:'CONNECT_AGENT_REGISTRY_AND_APPROVAL_ROUTER'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AI_CEO_ORCHESTRATOR_FAILED'});}};
module.exports.run=run;
