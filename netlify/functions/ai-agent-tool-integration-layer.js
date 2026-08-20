const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS']);
const ACTIONS=new Set(['LIST','PLAN','REQUEST_EXECUTION','EXECUTE']);
const TOOLS={SEO_SEARCH_CONSOLE:{domain:'MARKETING',mode:'READ_ONLY'},ANALYTICS:{domain:'MARKETING',mode:'READ_ONLY'},GOOGLE_ADS:{domain:'MARKETING',mode:'EXTERNAL_WRITE'},META_ADS:{domain:'MARKETING',mode:'EXTERNAL_WRITE'},EMAIL:{domain:'MARKETING',mode:'EXTERNAL_WRITE'},WHATSAPP:{domain:'CLIENT_SUCCESS',mode:'EXTERNAL_WRITE'},SOCIAL_PUBLISH:{domain:'MARKETING',mode:'EXTERNAL_WRITE'},BILLING:{domain:'FINANCE',mode:'EXTERNAL_WRITE'}};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'LIST').toUpperCase();if(!org||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_AND_VALID_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'TOOL_LAYER_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 if(action==='LIST')return json(200,{ok:true,tools:Object.entries(TOOLS).map(([name,v])=>({name,...v,enabled:false}))});
 const tool=String(body.tool||'').toUpperCase();if(!TOOLS[tool])return json(400,{error:'UNKNOWN_TOOL'});
 const definition={tool,domain:TOOLS[tool].domain,mode:TOOLS[tool].mode,enabled:false,external_actions_authorized:false};
 if(action==='PLAN'){return json(200,{ok:true,tool_plan:{...definition,execution:'PLANNED_ONLY',required_approval:TOOLS[tool].mode==='EXTERNAL_WRITE'}});}
 if(action==='REQUEST_EXECUTION'){const rows=await supabaseRequest('agent_tool_requests',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,tool,requested_by:user.id||null,status:'PENDING',payload:body.payload||{},created_at:new Date().toISOString()})});await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AGENT_TOOL_EXECUTION_REQUESTED',source:'ai-agent-tool-integration-layer',payload:{tool,request_id:rows?.[0]?.id||null}})});return json(200,{ok:true,request:rows?.[0]||null,next_step:'APPROVE_AND_CONNECT_PROVIDER'});}
 return json(403,{error:'EXTERNAL_TOOL_EXECUTION_DISABLED',reason:'Provider credentials and approved execution worker are not connected'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AGENT_TOOL_LAYER_FAILED'});}};
module.exports.run=run;
