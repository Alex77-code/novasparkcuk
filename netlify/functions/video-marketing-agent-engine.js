const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','VIDEO','CREATIVE','ANALYST']);
const TYPES=new Set(['VIDEO_SCRIPT','SHORT_FORM','AD_VIDEO','EXPLAINER','TESTIMONIAL']);
const ACTIONS=new Set(['SCRIPT_PLAN','SHOT_LIST','VIDEO_VARIANTS','PRODUCTION_PLAN']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),action=String(body.action||'SCRIPT_PLAN').toUpperCase();
 if(!org||!projectId||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_PROJECT_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'VIDEO_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,status,delivery_service&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const type=String(body.type||'VIDEO_SCRIPT').toUpperCase();if(!TYPES.has(type))return json(400,{error:'INVALID_VIDEO_TYPE'});
 const brief={type,topic:String(body.topic||''),audience:String(body.audience||''),goal:String(body.goal||'LEAD_GENERATION'),duration_seconds:Number(body.duration_seconds||30),tone:String(body.tone||'PROFESSIONAL'),cta:String(body.cta||'')};
 const plan=action==='SCRIPT_PLAN'?['Hook in first seconds','Problem/value proposition','Proof or differentiator','Clear CTA']:action==='SHOT_LIST'?['Opening/establishing shot','Problem or product shot','Proof/demo sequence','CTA/end card']:action==='VIDEO_VARIANTS'?['Create multiple hooks','Test alternate CTAs','Adapt framing for each platform']:['Storyboard and script','Record/source assets','Edit, captions and brand QA','Client approval before publication'];
 const payload={action,project_id:project.id,brief,plan,execution_mode:'DRAFT_ONLY',auto_publish:false,approval_required:true,generated_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'VIDEO_MARKETING_PLAN_GENERATED',source:'video-marketing-agent-engine',payload})});
 return json(200,{ok:true,production:payload,next_step:'CONNECT_VIDEO_ASSET_AND_RENDER_PROVIDER'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'VIDEO_MARKETING_AGENT_FAILED'});}};
module.exports.run=run;
