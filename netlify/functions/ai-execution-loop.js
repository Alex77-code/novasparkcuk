const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS']);
const STATES=['PLANNED','APPROVAL_REQUIRED','APPROVED','EXECUTING','VERIFYING','COMPLETED','FAILED'];
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();const intent=String(body.intent||'').trim();if(!org||!intent)return json(400,{error:'ORGANIZATION_AND_INTENT_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'EXECUTION_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const requestedTool=String(body.tool||'').toUpperCase();const risk=String(body.risk||'MEDIUM').toUpperCase();const externalWrite=['GOOGLE_ADS','META_ADS','EMAIL','WHATSAPP','SOCIAL_PUBLISH','BILLING'].includes(requestedTool);
 const state=externalWrite?'APPROVAL_REQUIRED':'PLANNED';const run={organization_id:org,intent,tool:requestedTool||null,risk,state,step:externalWrite?'Await approved tool execution':'Prepare and execute only after tool availability check',verification_required:true,external_actions_authorized:false,created_by:user.id||null,created_at:new Date().toISOString()};
 const rows=await supabaseRequest('ai_execution_runs',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(run)});const execution=rows?.[0]||run;
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_EXECUTION_LOOP_STARTED',source:'ai-execution-loop',payload:{execution_id:execution.id||null,intent,tool:requestedTool||null,risk,state}})});
 return json(200,{ok:true,execution,next_step:externalWrite?'APPROVAL_AND_PROVIDER_WORKER':'CONNECT_TOOL_EXECUTOR_AND_VERIFIER'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AI_EXECUTION_LOOP_FAILED'});}};
module.exports.run=run;
