const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','SEO','ANALYST']);
const ACTIONS=new Set(['AUDIT','KEYWORD_PLAN','ON_PAGE_PLAN','CONTENT_BRIEF']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),action=String(body.action||'AUDIT').toUpperCase();
 if(!org||!projectId||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_PROJECT_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'SEO_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,status,delivery_service,website_url&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const input={website_url:project.website_url||String(body.website_url||''),industry:String(body.industry||''),location:String(body.location||''),seed_keywords:Array.isArray(body.seed_keywords)?body.seed_keywords:[],competitors:Array.isArray(body.competitors)?body.competitors:[]};
 const recommendations=action==='AUDIT'?['Run technical crawl and indexability checks','Review title/meta coverage','Check Core Web Vitals and mobile UX','Identify internal-link and schema opportunities']:action==='KEYWORD_PLAN'?['Cluster keywords by search intent','Map primary terms to dedicated landing pages','Prioritize commercial and local opportunities']:action==='ON_PAGE_PLAN'?['Optimize titles and H1/H2 structure','Improve internal linking','Add relevant schema markup','Strengthen topical relevance']:['Create briefs with search intent, entities and primary keywords','Define outline, internal links and conversion CTA'];
 const payload={action,project_id:project.id,input,recommendations,execution_mode:'PLAN_ONLY',external_crawl_performed:false,generated_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'SEO_MARKETING_PLAN_GENERATED',source:'seo-marketing-agent-engine',payload})});
 return json(200,{ok:true,plan:payload,next_step:'CONNECT_SEO_DATA_PROVIDER'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'SEO_MARKETING_AGENT_FAILED'});}};
module.exports.run=run;
