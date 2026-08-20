const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','SOCIAL_MEDIA','ANALYST']);
const PLATFORMS=new Set(['INSTAGRAM','FACEBOOK','LINKEDIN','X','TIKTOK']);
const ACTIONS=new Set(['CONTENT_PLAN','POST_DRAFTS','CAMPAIGN_CALENDAR']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),action=String(body.action||'CONTENT_PLAN').toUpperCase();
 if(!org||!projectId||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_PROJECT_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'SOCIAL_MEDIA_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,status,delivery_service&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const platforms=(Array.isArray(body.platforms)?body.platforms:['INSTAGRAM','FACEBOOK','LINKEDIN']).map(x=>String(x).toUpperCase()).filter(x=>PLATFORMS.has(x));if(!platforms.length)return json(400,{error:'VALID_PLATFORM_REQUIRED'});
 const goal=String(body.goal||'AWARENESS'),tone=String(body.tone||'PROFESSIONAL'),frequency=String(body.frequency||'3_POSTS_WEEK');
 const plan=action==='CONTENT_PLAN'?['Educational/value content','Authority and trust content','Client/result storytelling','Engagement/community content']:action==='POST_DRAFTS'?platforms.map(p=>({platform:p,format:p==='LINKEDIN'?'TEXT_OR_CAROUSEL':'SHORT_FORM',approval_required:true})):['Monday: educational post','Wednesday: authority/case-study post','Friday: engagement/CTA post'];
 const payload={action,project_id:project.id,platforms,goal,tone,frequency,plan,execution_mode:'DRAFT_ONLY',auto_publish:false,generated_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'SOCIAL_MEDIA_PLAN_GENERATED',source:'social-media-marketing-agent-engine',payload})});
 return json(200,{ok:true,plan:payload,next_step:'CONNECT_SOCIAL_PLATFORM_APIS'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'SOCIAL_MEDIA_AGENT_FAILED'});}};
module.exports.run=run;
