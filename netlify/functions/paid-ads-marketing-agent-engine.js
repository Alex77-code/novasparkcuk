const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','PAID_ADS','ANALYST']);
const PLATFORMS=new Set(['GOOGLE_ADS','META_ADS']);
const ACTIONS=new Set(['CAMPAIGN_PLAN','AUDIENCE_PLAN','AD_CREATIVE_PLAN','BUDGET_PLAN']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),action=String(body.action||'CAMPAIGN_PLAN').toUpperCase();
 if(!org||!projectId||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_PROJECT_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'PAID_ADS_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,status,delivery_service&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const platforms=(Array.isArray(body.platforms)?body.platforms:['GOOGLE_ADS','META_ADS']).map(x=>String(x).toUpperCase()).filter(x=>PLATFORMS.has(x));if(!platforms.length)return json(400,{error:'VALID_AD_PLATFORM_REQUIRED'});
 const objective=String(body.objective||'LEAD_GENERATION'),budget=Number(body.budget||0),currency=String(body.currency||'GBP').toUpperCase();if(!Number.isFinite(budget)||budget<0)return json(400,{error:'INVALID_BUDGET'});
 const plan=action==='CAMPAIGN_PLAN'?['Define conversion objective and tracking','Build campaign/ad-group structure','Set geographic and audience targeting','Create measurement and optimisation checkpoints']:action==='AUDIENCE_PLAN'?['Define high-intent audience segments','Create exclusions and retargeting pools','Separate prospecting from remarketing']:action==='AD_CREATIVE_PLAN'?platforms.map(p=>({platform:p,formats:p==='GOOGLE_ADS'?['SEARCH_AD','RESPONSIVE_SEARCH_AD']:['IMAGE','VIDEO','CAROUSEL'],approval_required:true})):['Set daily/period budget guardrails','Define target CPA/ROAS thresholds','Create spend-pause conditions'];
 const payload={action,project_id:project.id,platforms,objective,budget,currency,plan,execution_mode:'PLAN_ONLY',auto_launch:false,generated_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'PAID_ADS_PLAN_GENERATED',source:'paid-ads-marketing-agent-engine',payload})});
 return json(200,{ok:true,plan:payload,next_step:'CONNECT_AD_PLATFORM_APIS'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PAID_ADS_AGENT_FAILED'});}};
module.exports.run=run;
