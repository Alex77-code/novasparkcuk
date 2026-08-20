const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER']);
const RISK=new Set(['LOW','MEDIUM','HIGH','CRITICAL']);
const ACTIONS=new Set(['ASSESS','AUTHORIZE','DENY','EMERGENCY_STOP','AUDIT']);
const POLICY={LOW:{approval:false,external:false},MEDIUM:{approval:true,external:false},HIGH:{approval:true,external:true},CRITICAL:{approval:true,external:false}};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'ASSESS').toUpperCase();if(!org||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_AND_VALID_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'GOVERNANCE_ROLE_REQUIRED'});
 const controls=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0]||{};
 if(action==='EMERGENCY_STOP'){await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({emergency_stop:true,updated_at:new Date().toISOString(),updated_by:user.id||null})});await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'EMERGENCY_STOP_ACTIVATED',source:'ai-governance-security-audit-engine',payload:{by:user.id||null}})});return json(200,{ok:true,emergency_stop:true});}
 if(controls.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const risk=String(body.risk||'MEDIUM').toUpperCase();if(!RISK.has(risk))return json(400,{error:'INVALID_RISK_LEVEL'});const policy=POLICY[risk];
 if(action==='ASSESS'){const result={risk,approval_required:policy.approval,external_actions_allowed:policy.external,reason:Array.isArray(body.reasons)?body.reasons:['Risk policy evaluated from requested action']};await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'GOVERNANCE_RISK_ASSESSED',source:'ai-governance-security-audit-engine',payload:result})});return json(200,{ok:true,assessment:result});}
 const requestId=String(body.request_id||'').trim();if(['AUTHORIZE','DENY'].includes(action)&&!requestId)return json(400,{error:'REQUEST_ID_REQUIRED'});
 const status=action==='AUTHORIZE'?'AUTHORIZED':'DENIED';if(action==='AUTHORIZE'&&risk!=='HIGH')return json(403,{error:'EXTERNAL_AUTHORIZATION_ONLY_ALLOWED_FOR_HIGH_RISK_APPROVED_ACTIONS'});
 if(action==='AUTHORIZE'){await supabaseRequest(`agent_approval_requests?id=eq.${encodeURIComponent(requestId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'APPROVED',reviewed_by:user.id||null,reviewed_at:new Date().toISOString()})});}
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:`GOVERNANCE_${status}`,source:'ai-governance-security-audit-engine',payload:{request_id:requestId,risk,by:user.id||null}})});
 return json(200,{ok:true,status,risk,request_id:requestId});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'GOVERNANCE_ENGINE_FAILED'});}};
module.exports.run=run;
