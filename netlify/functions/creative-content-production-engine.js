const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','CREATIVE','COPYWRITER','ANALYST']);
const TYPES=new Set(['BLOG','SOCIAL_POST','AD_COPY','EMAIL_COPY','LANDING_PAGE_COPY','VIDEO_SCRIPT','CREATIVE_BRIEF']);
const ACTIONS=new Set(['CONTENT_BRIEF','DRAFT','VARIANTS','PRODUCTION_PLAN']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),action=String(body.action||'CONTENT_BRIEF').toUpperCase();
 if(!org||!projectId||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_PROJECT_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'CREATIVE_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,status,delivery_service&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const type=String(body.type||'CREATIVE_BRIEF').toUpperCase();if(!TYPES.has(type))return json(400,{error:'INVALID_CONTENT_TYPE'});
 const brief={type,topic:String(body.topic||''),audience:String(body.audience||''),goal:String(body.goal||'LEAD_GENERATION'),tone:String(body.tone||'PROFESSIONAL'),key_points:Array.isArray(body.key_points)?body.key_points:[],cta:String(body.cta||''),variants:Number(body.variants||3)};
 const recommendations=action==='CONTENT_BRIEF'?['Define one primary audience and conversion goal','Create a clear value proposition and supporting proof','Specify CTA, tone and mandatory brand claims']:action==='DRAFT'?['Generate a first draft from the approved brief','Keep claims evidence-based and brand-safe','Prepare final copy for human review']:action==='VARIANTS'?['Create multiple hooks/headlines','Vary CTA and opening angle','Preserve approved facts and brand voice']:['Route brief to copy/design/video production','Run QA for brand, factual and compliance checks','Require approval before external publication'];
 const payload={action,project_id:project.id,brief,recommendations,execution_mode:'DRAFT_ONLY',external_generation_provider_connected:false,approval_required:true,generated_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CREATIVE_CONTENT_PLAN_GENERATED',source:'creative-content-production-engine',payload})});
 return json(200,{ok:true,production:payload,next_step:'CONNECT_ASSET_STORAGE_AND_GENERATION_PROVIDER'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CREATIVE_CONTENT_ENGINE_FAILED'});}};
module.exports.run=run;
