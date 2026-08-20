const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS']);
const PROVIDERS={GOOGLE_ADS:'GOOGLE_ADS_CREDENTIALS',META_ADS:'META_ADS_CREDENTIALS',EMAIL:'EMAIL_PROVIDER_CREDENTIALS',WHATSAPP:'WHATSAPP_PROVIDER_CREDENTIALS',SOCIAL_PUBLISH:'SOCIAL_PROVIDER_CREDENTIALS',ANALYTICS:'ANALYTICS_CREDENTIALS',SEARCH_CONSOLE:'SEARCH_CONSOLE_CREDENTIALS',BILLING:'BILLING_PROVIDER_CREDENTIALS'};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'HEALTH_CHECK').toUpperCase(),provider=String(body.provider||'').toUpperCase();if(!org||!PROVIDERS[provider])return json(400,{error:'ORGANIZATION_AND_SUPPORTED_PROVIDER_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'EXECUTION_WORKER_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const configured=Boolean(process.env[PROVIDERS[provider]]);const health={provider,configured,credential_present:configured,adapter_ready:false,healthy:false,external_execution:false,checked_at:new Date().toISOString()};
 if(action==='HEALTH_CHECK'){await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'PROVIDER_HEALTH_CHECK',source:'provider-health-execution-worker',payload:health})});return json(200,{ok:true,health,next_step:configured?'IMPLEMENT_AND_REGISTER_PROVIDER_ADAPTER':'ADD_PROVIDER_CREDENTIALS_SECURELY'});}
 if(action==='EXECUTE_APPROVED'){const requestId=String(body.request_id||'').trim();if(!requestId)return json(400,{error:'REQUEST_ID_REQUIRED'});const requests=await supabaseRequest(`agent_tool_requests?id=eq.${encodeURIComponent(requestId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,tool,status,payload&limit=1`);const req=requests?.[0];if(!req)return json(404,{error:'EXECUTION_REQUEST_NOT_FOUND'});if(String(req.status).toUpperCase()!=='APPROVED')return json(403,{error:'EXECUTION_REQUEST_NOT_APPROVED'});return json(403,{error:'PROVIDER_ADAPTER_NOT_CONNECTED',reason:'Worker will not perform external writes until a provider-specific adapter and verified credentials are available'});}
 return json(400,{error:'INVALID_ACTION'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PROVIDER_WORKER_FAILED'});}};
module.exports.run=run;
