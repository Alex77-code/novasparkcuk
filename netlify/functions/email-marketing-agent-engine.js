const { json, supabaseRequest, verifyUser } = require('./_nova');
const ROLES=new Set(['OWNER','ADMIN','MANAGER','EMAIL_MARKETING','ANALYST']);
const ACTIONS=new Set(['CAMPAIGN_PLAN','SEQUENCE_PLAN','EMAIL_DRAFTS','AUDIENCE_SEGMENTATION']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),action=String(body.action||'CAMPAIGN_PLAN').toUpperCase();
 if(!org||!projectId||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_PROJECT_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'EMAIL_MARKETING_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,status,delivery_service&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const goal=String(body.goal||'LEAD_NURTURE'),tone=String(body.tone||'PROFESSIONAL'),frequency=String(body.frequency||'WEEKLY');
 const plan=action==='CAMPAIGN_PLAN'?['Define conversion goal and audience','Create campaign theme and offer','Set delivery and measurement checkpoints']:action==='SEQUENCE_PLAN'?['Welcome email','Value/education email','Proof or case-study email','Offer/CTA email','Follow-up email']:action==='EMAIL_DRAFTS'?['Subject-line variants','Preview text','Personalised body copy','Clear CTA and compliance footer']:['Segment by lifecycle stage','Separate engaged and inactive contacts','Apply consent and suppression rules'];
 const payload={action,project_id:project.id,goal,tone,frequency,plan,execution_mode:'DRAFT_ONLY',auto_send:false,consent_required:true,generated_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'EMAIL_MARKETING_PLAN_GENERATED',source:'email-marketing-agent-engine',payload})});
 return json(200,{ok:true,plan:payload,next_step:'CONNECT_EMAIL_PROVIDER_AND_CONSENT_STORE'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'EMAIL_MARKETING_AGENT_FAILED'});}};
module.exports.run=run;
