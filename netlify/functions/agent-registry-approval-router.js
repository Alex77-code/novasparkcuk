const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER']);
const AGENTS={SEO:{domain:'MARKETING',role:'SEO'},SOCIAL_MEDIA:{domain:'MARKETING',role:'SOCIAL_MEDIA'},PAID_ADS:{domain:'MARKETING',role:'PAID_ADS'},EMAIL_MARKETING:{domain:'MARKETING',role:'EMAIL_MARKETING'},CRO:{domain:'MARKETING',role:'CRO'},CREATIVE:{domain:'MARKETING',role:'CREATIVE'},VIDEO:{domain:'MARKETING',role:'VIDEO'},CLIENT_REPORTING:{domain:'CLIENT_SUCCESS',role:'ANALYST'},DELIVERY:{domain:'DELIVERY',role:'OPERATIONS'}};
const ACTIONS=new Set(['LIST','REGISTER','ROUTE','REQUEST_APPROVAL','APPROVE','REJECT']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'LIST').toUpperCase();if(!org||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_AND_VALID_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'AGENT_REGISTRY_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 if(action==='LIST')return json(200,{ok:true,agents:Object.entries(AGENTS).map(([name,v])=>({name,...v,status:'AVAILABLE',external_actions_authorized:false}))});
 const agent=String(body.agent||'').toUpperCase();if(!AGENTS[agent])return json(400,{error:'UNKNOWN_AGENT'});
 const requestId=String(body.request_id||'').trim();
 if(['APPROVE','REJECT'].includes(action)&&!requestId)return json(400,{error:'REQUEST_ID_REQUIRED'});
 if(action==='ROUTE'){const route={agent,domain:AGENTS[agent].domain,role:AGENTS[agent].role,approval_required:body.high_impact!==false,execution_mode:'SUGGESTED'};await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AGENT_ROUTE_CREATED',source:'agent-registry-approval-router',payload:route})});return json(200,{ok:true,route});}
 if(action==='REGISTER'){const rows=await supabaseRequest('agent_registry',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,name:agent,domain:AGENTS[agent].domain,role:AGENTS[agent].role,status:'AVAILABLE',external_actions_authorized:false,created_by:user.id||null,created_at:new Date().toISOString()})});return json(200,{ok:true,agent:rows?.[0]||null});}
 const status=action==='REQUEST_APPROVAL'?'PENDING':action==='APPROVE'?'APPROVED':'REJECTED';const patch=action==='REQUEST_APPROVAL'?{status,requested_by:user.id||null,requested_at:new Date().toISOString()}:{status,reviewed_by:user.id||null,reviewed_at:new Date().toISOString()};
 const rows=await supabaseRequest(`agent_approval_requests?id=eq.${encodeURIComponent(requestId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:`AGENT_APPROVAL_${status}`,source:'agent-registry-approval-router',payload:{request_id:requestId,agent}})});
 return json(200,{ok:true,request_id:requestId,status,approval_required:status==='PENDING'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AGENT_REGISTRY_ROUTER_FAILED'});}};
module.exports.run=run;
